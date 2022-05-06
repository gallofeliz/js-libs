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
export type SemanticPriority = 'immediate' | 'next' | 'superior' | 'normal' | 'inferior' | 'on-idle'
export type OrderedPriority = number
export type Priority = SemanticPriority | number

export interface JobOpts<Identity> {
    identity: Identity
    fn: JobFn
    logger: Logger
    priority?: Priority
}

type JobFn = (args: {logger: Logger, abortSignal: AbortSignal}) => Promise<any>

export class Job<Identity extends NonNullable<any>, Result> extends EventEmitter {
    protected identity: Identity
    protected priority: Priority
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

    constructor({ identity, fn, priority = 'normal', logger }: JobOpts<Identity>) {
        super()

        this.identity = identity
        this.priority = priority
        this.fn = fn

        this.logger = logger.child({
            job: {
                uuid: this.uuid,
                identity: this.identity
            }
        })
    }

    public getState() {
        return this.state
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

    public getUuid() {
        return this.uuid
    }

    public getIdentity() {
        return this.identity
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

        try {
            result = await this.fn({
                logger: this.logger,
                abortSignal: this.abortController.signal
            })
        } catch (e) {
            error = e as Error
        } finally {
            this.logger.off('log', runningLoggerListener)
            this.endedAt = new Date
        }

        if ((this.state as JobState) === 'aborting') {
            error = error || new Error('Aborted')
            this.state = 'aborted'
            this.logger.error('Aborted', {
                jobState: this.state
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

    public abort(): void {
        // Convenience
        if (this.state === 'new') {
            return this.cancel()
        }

        if (this.state !== 'running') {
            return
        }

        this.state = 'aborting'
        this.logger.info('Requested abort', {
            jobState: this.state
        })

        this.emit('abort')
        this.abortController.abort()
    }

    public cancel(): void {
        // Convenience
        if (this.state === 'running') {
            return this.abort()
        }

        if (this.state !== 'new') {
            return
        }

        this.state = 'canceled'
        this.logger.info('Requested cancel', {
            jobState: this.state
        })

        this.emit('canceled')
        this.emit('ended')
        this.emit('error', new Error('Canceled'))
    }
}


export class JobsRegistry<RegisteredJob extends Job<any, any>> {
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
            job.once('ended', () => this.removeExceedEnded())
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

export class JobsRunner<RunnedJob extends Job<any, any>> {
    protected queue: RunnedJob[] = []
    protected running: RunnedJob[] = []
    protected started = false
    protected logger: Logger
    protected concurrency: number

    public constructor({logger, concurrency = 1}: {logger: Logger, concurrency?: number}) {
        this.logger = logger
        this.concurrency = concurrency
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
            this.clearQueue()
        }

        if (clearRunning) {
            this.clearRunning()
        }
    }

    public clearQueue() {
        ;[...this.queue].forEach(job => job.cancel())
    }

    public clearRunning() {
        ;[...this.running].forEach(job => job.abort())
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

        const onRunning = () => {
            // In case of job is run outside this runner
            if (this.queue.includes(job)) {
                this.queue.splice(this.queue.indexOf(job), 1)
                this.running.push(job)
            }
        }

        job.once('running', onRunning)

        job.once('ended', () => {
            job.off('running', onRunning)

            // Don't listen others events, we only want to remove the job
            if (this.queue.includes(job)) {
                this.queue.splice(this.queue.indexOf(job), 1)
            } else {
                this.running.splice(this.running.indexOf(job), 1)
            }

            this.runNexts()
        })

        this.runNexts()

        if (getResult) {
            return job.toPromise()
        }
    }

    protected computeJobQueuePosition(job: RunnedJob) {
        let index = 0
        for (const jjob of this.queue) {
            if (this.isPrioSup(job, jjob)) {
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

    protected isPrioSup(jobA: RunnedJob, jobB: RunnedJob): boolean {
        let priorityA = jobA.getPriority()
        let priorityB = jobB.getPriority()

        if (priorityA === 'immediate') {
            return true
        }

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
}
