import { EventEmitter, once } from 'events'
import { v4 as uuid4 } from 'uuid'
import { Logger } from './logger'
import _ from 'lodash'
import { Duration, durationToSeconds } from './utils'

export type JobState = 'new' | 'running' | 'aborting' | ('done' | 'failed' | 'aborted' | 'canceled' /* = ended */)
export type JobRunState = 'ready' | 'running' | 'ended'
const runStateMapping: Record<JobState, JobRunState> = {
    'new': 'ready',
    'running': 'running',
    'aborting': 'running',
    'done': 'ended',
    'failed': 'ended',
    'aborted': 'ended',
    'canceled': 'ended'
}
export type SemanticJobPriority = 'immediate' | 'next' | 'superior' | 'normal' | 'inferior' | 'on-idle'
export type OrderedJobPriority = number
export type JobPriority = SemanticJobPriority | OrderedJobPriority

export interface JobOpts<Identity> {
    id: Identity
    fn: JobFn
    logger: Logger
    priority?: JobPriority
    allocatedTime?: Duration
    abortOnAllocatedTime?: boolean
    duplicable?: boolean
}

type JobFn = (args: {logger: Logger, abortSignal: AbortSignal, job: Job}) => Promise<any>

export class Job<Identity = any, Result = any> extends EventEmitter {
    protected id: Identity
    protected priority: JobPriority
    protected fn: JobFn
    protected state: JobState = 'new'
    protected result?: Result
    protected error?: Error
    protected uuid: string = uuid4()
    protected createdAt: Date = new Date
    protected startedAt?: Date
    protected endedAt?: Date
    protected logger: Logger
    protected runLogs: object[] = []
    protected warnings: object[] = []
    protected abortController: AbortController = new AbortController
    protected abortCancelReason?: string
    protected allocatedTime?: Duration
    protected abortOnAllocatedTime: boolean
    protected duplicable: boolean

    constructor({ id, fn, priority = 'normal', logger, allocatedTime, abortOnAllocatedTime, duplicable }: JobOpts<Identity>) {
        super()

        this.id = id
        this.priority = priority
        this.fn = fn

        this.logger = logger.child({
            job: {
                uuid: this.uuid,
                id: this.id
            }
        })

        this.allocatedTime = allocatedTime
        this.abortOnAllocatedTime = abortOnAllocatedTime || false
        this.duplicable = duplicable || false
    }

    public isDuplicable() {
        return this.duplicable
    }

    public duplicate() {
        if (!this.duplicable) {
            throw new Error('Not duplicable (potential side effects)')
        }

        return new Job({
            id: this.id,
            priority: this.priority,
            fn: this.fn,
            logger: this.logger,
            allocatedTime: this.allocatedTime,
            abortOnAllocatedTime: this.abortOnAllocatedTime,
            duplicable: this.duplicable
        })
    }

    public getState() {
        return this.state
    }

    public getAbortOrCancelReason() {
        if (!['aborting', 'aborted', 'canceled'].includes(this.state)) {
            throw new Error('Job not aborted nor canceled')
        }
        return this.abortCancelReason
    }

    public isRunnableConcurrently(job: Job<Identity, any>) {
        return true
    }

    public getRunState(): JobRunState {
        return runStateMapping[this.state]
    }

    public getPriority() {
        return this.priority
    }

    public prioritize(priority: JobPriority) {
        if (priority === this.priority) {
            return
        }
        this.priority = priority
        this.emit('prioritize', this.priority)
    }

    public static isPriorityHigherThan(priorityA: JobPriority, priorityB: JobPriority): boolean {
        if (priorityA === priorityB) {
            return false
        }

        if (priorityA === 'immediate') {
            return true
        }

        // Can be optimized

        if (priorityA === 'next' && priorityB != 'immediate') {
            return true
        }

        if (priorityA === 'on-idle') {
            return false
        }

        if (priorityB === 'immediate' || priorityB === 'next') {
            return false
        }

        if (priorityB === 'on-idle') {
            return true
        }

        if (priorityA === 'normal') {
            priorityA = 0
        }

        if (priorityB === 'normal') {
            priorityB = 0
        }

        if (priorityA === 'superior' && priorityB != 'superior') {
            return true
        }

        if (priorityA === 'inferior' && priorityB != 'inferior') {
            return false
        }

        if (priorityB === 'superior' && priorityA != 'superior') {
            return false
        }

        if (priorityB === 'inferior' && priorityA != 'inferior') {
            return true
        }

        return priorityA > priorityB
    }

    public isPriorityHigherThan(otherJob: Job): boolean {
        return Job.isPriorityHigherThan(this.getPriority(), otherJob.getPriority())
    }

    public getUuid() {
        return this.uuid
    }

    public getId() {
        return this.id
    }

    public getCreatedAt() {
        return this.createdAt
    }

    public getStartedAt() {
        return this.startedAt
    }

    public getEndedAt() {
        return this.endedAt
    }

    public getWarnings() {
        return this.warnings
    }

    public getResult(): Result {
        if (this.state !== 'done') {
            throw new Error('Result only available on done job')
        }

        return this.result!
    }

    public async toPromise(): Promise<Result> {
        if (this.getRunState() === 'ended') {
            if (this.state === 'done') {
                return this.result!
            }
            throw this.error!
        }

        return once(this, 'done').then(eventArgs => eventArgs[0])
    }

    public getError(): Error {
        if (this.state !== 'failed') {
            throw new Error('Error only available on failed job')
        }

        return this.error!
    }

    public async run() {
        if (this.state !== 'new') {
            throw new Error('Already started')
        }

        const runningLoggerListener = (log: object) => {

            if (_.get(log, 'job.uuid') !== this.uuid) {
                return
            }

            // WARNING IN CASE OF VERBOSE
            const runLog = _.omit(log, ['job'])
            this.runLogs.push(runLog)
            this.emit('log', runLog)

            if (_.get(runLog, 'level') === 'warning') {
                this.warnings.push(runLog)
            }
        }

        this.logger.on('log', runningLoggerListener)

        this.state = 'running'
        this.startedAt = new Date
        this.logger.info('Let\'s run the job !', {
            jobState: this.state
        })
        this.emit('running')

        let result: any = undefined
        let error: Error | undefined = undefined

        let allocatedTimeTimeout

        if (this.allocatedTime) {
            allocatedTimeTimeout = setTimeout(() => {
                if (this.abortOnAllocatedTime) {
                    this.abort('timeout')
                }
                this.emit('allocated-time-reached')
            }, durationToSeconds(this.allocatedTime) * 1000)
        }

        try {
            result = await this.fn({
                logger: this.logger,
                abortSignal: this.abortController.signal,
                job: this
            })
        } catch (e) {
            error = e as Error
        } finally {
            allocatedTimeTimeout && clearTimeout(allocatedTimeTimeout)
            this.logger.off('log', runningLoggerListener)
            this.endedAt = new Date
        }

        if ((this.state as JobState) === 'aborting') {
            error = error || new Error('Aborted : ' + this.abortCancelReason)
            this.state = 'aborted'
            this.error = error
            this.logger.error('Aborted', {
                jobState: this.state,
                reason: this.abortCancelReason
            })
            this.emit('aborted')
            this.emit('error', error)
        } else if (error) {
            this.state = 'failed'
            this.error = error
            this.logger.error('Failed (error)', {
                jobState: this.state,
                error
            })
            this.emit('failed', error)
            this.emit('error', error)
        } else {
            this.result = result
            this.state = 'done'
            this.logger.info('Done :)', {
                jobState: this.state
            })
            this.emit('done', this.result)
        }

        this.emit('ended')
    }

    public getRunLogs() {
        return this.runLogs
    }

    public abort(reason: string): void {
        // Convenience
        if (this.state === 'new') {
            return this.cancel(reason)
        }

        if (this.state !== 'running') {
            return
        }

        this.state = 'aborting'
        this.logger.info('Requested abort', {
            jobState: this.state,
            reason
        })
        this.abortCancelReason = reason
        this.emit('abort')
        this.abortController.abort()
    }

    public cancel(reason: string): void {
        // Convenience
        if (this.state === 'running') {
            return this.abort(reason)
        }

        if (this.state !== 'new') {
            return
        }

        this.state = 'canceled'
        this.logger.info('Requested cancel', {
            jobState: this.state,
            reason
        })
        this.abortCancelReason = reason
        this.error = new Error('Canceled : ' + reason)
        this.emit('canceled')
        this.emit('ended')
        this.emit('error', this.error)
    }
}


export class JobsRegistry<RegisteredJob extends Job> {
    protected maxNbEnded?: number
    protected maxEndDateDurationSeconds?: number
    // protected readyOrRunningJobs: Job<any, any>[] = []
    // protected endedJobs: Job<any, any>[] = []
    protected jobs: RegisteredJob[] = []
    //protected nextRemoveExceedEndedTimeout?: NodeJS.Timeout
    protected logger: Logger

    constructor({ maxNbEnded, maxEndDateDuration, logger }: { maxNbEnded?: number, maxEndDateDuration?: Duration, logger:Logger }) {
        this.maxEndDateDurationSeconds = maxEndDateDuration ? durationToSeconds(maxEndDateDuration) : undefined
        this.maxNbEnded = maxNbEnded
        this.logger = logger
    }

    // public addJob(job: Job<any, any>) {
    //     if (job.getRunState() === 'ended') {
    //         const olderIndex = this.endedJobs.findIndex((job2) => job2.getEndedAt()! > job.getEndedAt()!)
    //         if (!olderIndex) {
    //             this.endedJobs.push(job)
    //         } else {
    //             this.endedJobs.splice(olderIndex, 0, job)
    //         }
    //         this.removeExceedEnded()
    //     } else {
    //         this.readyOrRunningJobs.push(job)
    //         job.once('ended', () => this.removeExceedEnded())
    //     }
    // }

    public addJob(job: RegisteredJob) {
        this.jobs.push(job)
        this.logger.info('Registering job', { job: job.getUuid() })

        if (job.getRunState() === 'ended') {
            this.removeExceedEnded()
        } else {
            const onError = () => {} // Registry avoid to need to catch ;)
            job.once('error', onError)
            job.once('ended', () => {
                job.off('error', onError)
                this.removeExceedEnded()
            })
        }
    }

    public getJobs() {
        this.removeExceedEnded()
        return this.jobs
    }

    public getJobsByRunState(): Record<JobRunState, RegisteredJob[]> {
        return {
            ready: [],
            running: [],
            ended: [],
            ..._.groupBy(this.getJobs(), (job) => job.getRunState())
        }
    }

    public getJob(uuid: string) {
        return this.getJobs().find(job => job.getUuid() === uuid)
    }

    protected removeExceedEnded() {
        const endedJobs = _.sortBy(this.jobs.filter((job) => job.getRunState() === 'ended'), (job) => job.getEndedAt())
        const jobsToRemove: RegisteredJob[] = []

        if (this.maxNbEnded) {
            jobsToRemove.push(..._.dropRight(endedJobs, this.maxNbEnded))
        }

        if (this.maxEndDateDurationSeconds) {
            const nowTime = (new Date).getTime()
            jobsToRemove.push(..._.takeWhile(endedJobs, (job) => (job.getEndedAt()!.getTime() + this.maxEndDateDurationSeconds! * 1000) < nowTime))

            // const stillEndedJobs = _.without(endedJobs, ...jobsToRemove)
            // if (stillEndedJobs.length > 0) {
            //     const nextTimeout = stillEndedJobs[0].getEndedAt()!.getTime() + this.maxEndDateDurationSeconds * 1000 - (new Date).getTime()
            // }
        }

        if (!jobsToRemove.length) {
            return
        }

        this.logger.info('Cleaning jobs', { jobs: jobsToRemove.map(j => j.getUuid()) })
        this.jobs = _.without(this.jobs, ...jobsToRemove)
    }
}

export class JobsRunner<RunnedJob extends Job> {
    protected queue: RunnedJob[] = []
    protected running: RunnedJob[] = []
    protected started = false
    protected logger: Logger
    protected concurrency: number
    protected allocatedTimeReached: RunnedJob[] = []
    protected handleAllocatedTimesReaches: boolean

    public constructor(
        {logger, concurrency = 1, handleAllocatedTimesReaches}:
        {logger: Logger, concurrency?: number, handleAllocatedTimesReaches?: boolean }
    ) {
        this.logger = logger
        this.concurrency = concurrency
        this.handleAllocatedTimesReaches = handleAllocatedTimesReaches || false
    }

    public start() {
        if (this.started) {
            return
        }

        this.started = true
        this.runNexts()
    }

    public stop(clearRunning = true, clearQueue = false) {
        this.started = false

        if (clearQueue) {
            this.clearQueue('JobsRunner stop')
        }

        if (clearRunning) {
            this.clearRunning('JobsRunner stop')
        }
    }

    public clearQueue(reason: string) {
        ;[...this.queue].forEach(job => job.cancel(reason))
    }

    public clearRunning(reason: string) {
        ;[...this.running].forEach(job => job.abort(reason))
    }

    public getQueuingJobs() {
        return this.queue
    }

    public getRunningJobs() {
        return this.running
    }

    public run(job: RunnedJob, getResult?: false): void
    public run<Result>(job: RunnedJob, getResult: true): Promise<Result>

    public run<Result>(job: RunnedJob, getResult: boolean = false) {
        if (job.getState() !== 'new') {
            throw new Error('Job already started')
        }

        if (this.queue.includes(job)) {
            throw new Error('Job already in queue')
        }

        this.logger.info('Queueing job', { job: job.getUuid() })

        this.queue.splice(this.computeJobQueuePosition(job), 0, job)

        const onPrioritize = () => {
            if (!this.queue.includes(job)) { // == new
                return
            }

            this.logger.info('Job priority changed ; update ...', { job: job.getUuid() })

            this.queue.splice(this.queue.indexOf(job), 1)
            this.queue.splice(this.computeJobQueuePosition(job), 0, job)
        }

        const onRunning = () => {
            // In case of job is run outside this runner
            if (this.queue.includes(job)) {
                this.queue.splice(this.queue.indexOf(job), 1)
                this.running.push(job)
            }
        }

        const onJobReachAllocatedTime = () => {
            this.allocatedTimeReached.push(job)
            this.handleAllocatedTimesReached()
        }

        job.once('running', onRunning)
        job.on('prioritize', onPrioritize)
        job.once('allocated-time-reached', onJobReachAllocatedTime)

        job.once('ended', () => {
            job.off('running', onRunning)
            job.off('prioritize', onPrioritize)
            job.off('allocated-time-reached', onJobReachAllocatedTime)

            if (this.allocatedTimeReached.includes(job)) {
                this.allocatedTimeReached.splice(this.allocatedTimeReached.indexOf(job), 1)
            }

            // Don't listen others events, we only want to remove the job
            if (this.queue.includes(job)) {
                this.queue.splice(this.queue.indexOf(job), 1)
            } else {
                this.running.splice(this.running.indexOf(job), 1)
            }

            this.runNexts()
        })

        this.runNexts()
        this.handleAllocatedTimesReached()

        if (getResult) {
            return job.toPromise()
        }
    }

    protected handleAllocatedTimesReached() {
        if (!this.handleAllocatedTimesReaches) {
            return
        }
        /*
            It is hard to develop this logic
            For example : is it logic to interrupt a high priority job for a low priority job ?
            Should we abort a job only for higher or equal priority ?
        */

        const nbCleanable = this.allocatedTimeReached.length
        const nbSlotsToFreeToRunNewJob = this.running.length - this.concurrency + 1
        const nbQueuingJobs = this.queue.filter(job => job.getPriority() !== 'on-idle').length

        if (!nbQueuingJobs || nbSlotsToFreeToRunNewJob > nbCleanable) {
            return
        }

        const nbJobsToAbort = Math.min(this.running.length - this.concurrency + Math.max(nbQueuingJobs, this.concurrency), nbCleanable)

        const jobsToAbort = this.allocatedTimeReached.slice(0, nbJobsToAbort)

        jobsToAbort.forEach(job => job.abort('allocatedTime exceeds, others jobs queuing'))

        this.runNexts()

        jobsToAbort.forEach(job => {
            if (!job.isDuplicable() || job.listenerCount('done') > 0) {
                return
            }
            this.logger.info('Duplicate job and rerun for postponing')
            this.run(job.duplicate() as RunnedJob, false)
        })
    }

    protected computeJobQueuePosition(job: RunnedJob) {
        let index = 0
        for (const jjob of this.queue) {
            if (job.isPriorityHigherThan(jjob)) {
                break
            }
            index++
        }

        return index
    }

    protected isJobRunnableConcurrentlyWithRunningJobs(job: RunnedJob) {
        return _.every(this.running, runningJob => runningJob.isRunnableConcurrently(job))
    }

    protected runNexts() {
        if (!this.started) {
            return
        }

        for (const job of [...this.queue]) {
            if (job.getPriority() === 'immediate') {
                if (this.isJobRunnableConcurrentlyWithRunningJobs(job)) {
                    this._run(job)
                }
            } else {
                if (this.running.length >= this.concurrency) {
                    break
                }
                if (this.isJobRunnableConcurrentlyWithRunningJobs(job)) {
                    this._run(job)
                }
            }
        }
    }

    protected _run(job: RunnedJob) {
        // Slot reservation
        this.queue.splice(this.queue.indexOf(job), 1)
        this.running.push(job)
        job.run()
    }
}
