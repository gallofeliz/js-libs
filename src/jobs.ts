import { EventEmitter } from 'events'
import { v4 as uuid4 } from 'uuid'
import { Logger } from './logger'
import _ from 'lodash'

export type JobState = 'new' | 'running' | 'aborting' | 'success' | 'failure' | 'aborted' | 'canceled'
export type SemanticPriority =     'immediate' | 'next' | 'superior' | 'normal' | 'inferior' | 'on-idle'
export type OrderedPriority = number
export type Priority = SemanticPriority | number

interface SearchJobsCriteria {
    operation?: string
    someSubjects?: Record<string, string>
    jobManagerState?: 'queue' | 'running' | 'archived'
    state?: JobState
}

interface JobOpts {
    trigger: string | null,
    operation: string,
    subjects: Record<string, string>,
    fn: (job: Job) => Promise<any>,
    logger: Logger,
    priority?: Priority
}

export class Job extends EventEmitter {
    protected trigger: string | null
    protected operation: string
    protected subjects: Record<string, string>
    protected priority: Priority
    protected fn: (job: Job) => Promise<any>
    protected state: JobState = 'new'
    protected result: Promise<any>
    protected uuid: string = uuid4()
    protected createdAt: Date = new Date
    protected startedAt?: Date
    protected endedAt?: Date
    protected resolve?: (data: any) => void
    protected reject?: (error: Error) => void
    protected logger: Logger
    protected runLogs: object[] = []
    protected warnings: object[] = []

    constructor({ trigger, operation, subjects, fn, priority = 'normal', logger }: JobOpts) {
        super()

        this.trigger = trigger
        this.operation = operation
        this.subjects = subjects
        this.priority = priority
        this.fn = fn
        this.result = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })

        this.logger = logger.child({
            job: {
                uuid: this.uuid,
                operation: this.operation,
                subjects: this.subjects
            }
        })

        this.logger.info('Job creation', {
            jobState: this.state
        })
    }

    public getState() {
        return this.state
    }

    public getPriority() {
        return this.priority
    }

    public getTrigger() {
        return this.trigger
    }

    public getLogger() {
        return this.logger
    }

    public getUuid() {
        return this.uuid
    }

    public getOperation() {
        return this.operation
    }

    public getSubjects() {
        return this.subjects
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

        try {
            const result = await this.fn(this)

            // Stupid Typescript ...
            if ((this.state as string) === 'aborting') {
                throw new Error('Aborted')
            }

            this.resolve!(result)
            this.state = 'success'
            this.logger.info('Success :)', {
                jobState: this.state
            })
            this.emit('success')
        } catch (e) {
            this.state = (this.state as string) === 'aborting' ? 'aborted' : 'failure'
            this.logger.error('failure', {
                jobState: this.state,
                error: e
            })
            this.reject!(e as Error)
            this.emit(this.state)
        }

        this.logger.off('log', runningLoggerListener)

        this.endedAt = new Date

        this.emit('ended')

        this.removeAllListeners()

        return this.getResult()
    }

    public async getResult() {
        return this.result
    }

    public getRunLogs() {
        return this.runLogs
    }

    public abort() {
        if (this.state !== 'running') {
            return
        }

        if (this.listenerCount('abort') === 0) {
            throw new Error('Abort not handled')
        }

        this.state = 'aborting'
        this.logger.info('Requested abort', {
            jobState: this.state
        })
        this.emit('abort')
    }

    public cancel() {
        if (this.state !== 'new') {
            throw new Error('Unable to cancel a non-new job')
        }

        this.state = 'canceled'
        this.logger.info('Requested cancel', {
            jobState: this.state
        })
        // Avoid crashing node !
        this.getResult().catch(e => {})
        this.reject!(new Error('Canceled'))
        this.emit('canceled')
        this.removeAllListeners()
    }

    public async getSummary({withRunLogs = false, withSuccessResult = false, withWarnings = false} = {}) {
        return {
            uuid: this.getUuid(),
            createdAt: this.getCreatedAt(),
            startedAt: this.getStartedAt(),
            endedAt: this.getEndedAt(),
            state: this.getState(),
            priority: this.getPriority(),
            trigger: this.getTrigger(),
            operation: this.getOperation(),
            subjects: this.getSubjects(),
            warnings: withWarnings ? this.warnings : this.warnings.length,
            ...this.getState() === 'failure' && { error: await (this.getResult().catch(e => e.toString())) },
            ...this.getState() === 'success' && withSuccessResult && { result: await this.getResult() },
            ...withRunLogs && { runLogs: this.getRunLogs() }
        }
    }
}

export class JobsManager {
    protected queue: Job[] = []
    protected running: Job[] = []
    protected archived: Job[]
    protected started = false
    protected logger: Logger

    public constructor(logger: Logger, archivedCount: number = 100) {
        this.logger = logger
        this.archived = new Array(archivedCount)
    }

    public start() {
        if (this.started) {
            return
        }

        this.started = true
        this.runNext()
    }

    public stop() {
        this.started = false
        this.queue.forEach(job => job.cancel())
        this.running.forEach(job => job.abort())
    }

    public getJobs(byStateCat?: true): {queue: Job[], running: Job[], archived: Job[]}
    public getJobs(byStateCat: false): Job[]

    public getJobs(byStateCat: boolean = true) {
        return byStateCat // Fix Typescript boolean != true|false but not as I would like
            ? this.searchJobs({} as SearchJobsCriteria, true)
            : this.searchJobs({} as SearchJobsCriteria, false)
    }

    public searchJobs(criteria: SearchJobsCriteria, byStateCat?: true): {queue: Job[], running: Job[], archived: Job[]}
    public searchJobs(criteria: SearchJobsCriteria, byStateCat: false): Job[]

    public searchJobs(criteria: SearchJobsCriteria, byStateCat: boolean = true) {
        function filterJobs(jobs: Job[]): Job[] {
            if (Object.keys(_.omit(criteria, 'jobManagerState')).length === 0) {
                return jobs
            }

            return jobs.filter(job => {
                if (criteria.operation && job.getOperation() !== criteria.operation) {
                    return false
                }
                if (criteria.someSubjects && !_.isEqual(criteria.someSubjects, _.pick(job.getSubjects(), Object.keys(criteria.someSubjects)))) {
                    return false
                }
                if (criteria.state && job.getState() !== criteria.state) {
                    return false
                }

                return true
            })
        }

        const byStateCatJobs = {
            queue: criteria.jobManagerState && criteria.jobManagerState !== 'queue' ? [] : filterJobs(this.queue),
            running: criteria.jobManagerState && criteria.jobManagerState !== 'running' ? [] : filterJobs(this.running),
            archived: criteria.jobManagerState && criteria.jobManagerState !== 'archived' ? [] : filterJobs(this.archived.filter(job => job))
        }

        return byStateCat ? byStateCatJobs : _.flatten(Object.values(byStateCatJobs))
    }

    public getJob(uuid: string) {
        const job = this.getJobs(false).find(job => job.getUuid() === uuid)

        if (!job) {
            throw new Error('Unknow job ' + uuid)
        }

        return job
    }

    public addJob(job: Job, canBeDuplicate: boolean = false, getResult = false) {
        if (job.getState() !== 'new') {
            throw new Error('Job already started')
        }

        if (this.queue.includes(job)) {
            return
        }

        if (!canBeDuplicate) {
            const equalJob = this.queue.find(inQueueJob => {
                return inQueueJob.getOperation() === job.getOperation()
                    && _.isEqual(inQueueJob.getSubjects(), job.getSubjects())
            })

            if (equalJob) {
                if (equalJob.getPriority() === job.getPriority()) {
                    this.logger.info('Not queueing job because of duplicate', { job: job.getUuid() })
                    job.cancel()
                    //this.archive(job) Don't archive because has never been added ! Avoid pollution in archived
                    return
                }
                this.queue.splice(this.queue.indexOf(equalJob), 1)
                this.logger.info('Canceling previous job on duplicate', { job: job.getUuid(), previousJob: job.getUuid() })
                equalJob.cancel()
                this.archive(equalJob)
            }
        }

        this.logger.info('Queueing job', { job: job.getUuid() })

        job.once('running', () => {
            this.queue.splice(this.queue.indexOf(job), 1)
            this.running.push(job)
        })

        job.once('canceled', () => {
            this.queue.splice(this.queue.indexOf(job), 1)
            this.archive(job)
        })

        job.once('ended', () => {
            this.running.splice(this.running.indexOf(job), 1)
            this.archive(job)
        })

        if (this.started && job.getPriority() === 'immediate' && this.queue.length > 0) {
            this.run(job)
        } else {
            let index = 0
            for (const jjob of this.queue) {
                if (this.isPrioSup(job, jjob)) {
                    break
                }
                index++
            }

            this.queue.splice(index, 0, job)
            this.runNext()
        }

        if (getResult) {
            return job.getResult()
        }

        job.getResult().catch(() => {})
    }

    protected archive(job: Job) {
        this.archived.pop()
        this.archived.unshift(job)
    }

    protected isPrioSup(jobA: Job, jobB: Job): boolean {
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

    protected runNext() {
        if (!this.started) {
            return
        }

        if (this.queue.length === 0) {
            return
        }

        if (this.running.length > 0) {
            return
        }

        this.run(this.queue[0] as Job)
    }

    protected async run(job: Job) {
        try {
            await job.run()
        } catch(e) {}

        this.runNext()
    }
}
