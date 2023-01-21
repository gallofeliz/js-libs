import { EventEmitter, once } from 'events'
import { v4 as uuid } from 'uuid'
import { Logger } from './logger'
import _ from 'lodash'
import { Duration, durationToMilliSeconds } from './utils'
import { Query } from 'mingo'
import Datastore from 'nedb'
import { promisify } from 'util'

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
export const semanticJobPriorities = ['immediate', 'next', 'superior',  'normal',  'inferior',  'on-idle']
export type OrderedJobPriority = number
export type JobPriority = SemanticJobPriority | OrderedJobPriority

export interface JobOpts<Identity> {
    id: Identity
    fn: JobFn
    logger: Logger
    priority?: JobPriority
    keepResult?: boolean
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
    protected uuid: string = uuid()
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
    protected keepResult: boolean

    constructor(
        { id, fn, priority = 'normal', logger, allocatedTime, abortOnAllocatedTime = false, duplicable = false, keepResult = true }:
        JobOpts<Identity>
    ) {
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
        this.abortOnAllocatedTime = abortOnAllocatedTime
        this.duplicable = duplicable
        this.keepResult = keepResult
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

    public toJSON() {
        return {
            uuid: this.uuid,
            createdAt: this.createdAt.toJSON(),
            startedAt: this.startedAt?.toJSON(),
            endedAt: this.endedAt?.toJSON(),
            state: this.state,
            priority: this.priority,
            id: this.id,
            warnings: this.warnings,
            abortCancelReason: this.abortCancelReason,
            error: this.state === 'failed' && {
                ..._.mapValues(Object.getOwnPropertyDescriptors(this.error), v => v.value),
                name: this.error!.name
            },
            runLogs: this.runLogs,
            duplicable: this.duplicable,
            result: this.result
            // others if needed
        }
    }

    public static fromJSON(jsonJob: any) {
        if (runStateMapping[jsonJob.state as JobState] !== 'ended') {
            throw new Error('Job not unserializable (not ended) : cannot be unserialized correctly nor in the same state')
        }

        const values = {
            ...jsonJob,
            duplicable: false, // as it is alterated, it cannot be duplicated
            createdAt: new Date(jsonJob.createdAt),
            startedAt: jsonJob.startedAt && new Date(jsonJob.startedAt),
            endedAt: jsonJob.endedAt && new Date(jsonJob.endedAt),
            error: jsonJob.error && (() => {
                const e = new Error(jsonJob.error.message)
                _.forEach(jsonJob.error, (v, k) => (e as any)[k] = v)
                return e
            })()
        }

        const asProperties = _.mapValues(values, value => ({
            value,
            writable: true,
            enumerable: true,
            configurable: true
        }))

        return Object.create(Job.prototype, asProperties)
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

    public prioritizeTo(priority: JobPriority) {
        if (this.state !== 'new') {
            throw new Error('Cannot change priority on not new job')
        }

        if (priority === this.priority) {
            return
        }

        this.priority = priority
        this.emit('prioritize', this.priority)
    }

    public static comparePriority(priorityA: JobPriority, priorityB: JobPriority): -1 | 0 | 1 {
        if (priorityA === 'normal') {
            priorityA = 0
        }

        if (priorityB === 'normal') {
            priorityB = 0
        }

        if (priorityA === priorityB) {
            return 0
        }

        if (priorityA === 'immediate') {
            return 1
        }

        // Can be optimized

        if (priorityA === 'next' && priorityB != 'immediate') {
            return 1
        }

        if (priorityA === 'on-idle') {
            return -1
        }

        if (priorityB === 'immediate' || priorityB === 'next') {
            return -1
        }

        if (priorityB === 'on-idle') {
            return 1
        }

        if (priorityA === 'superior' && priorityB != 'superior') {
            return 1
        }

        if (priorityA === 'inferior' && priorityB != 'inferior') {
            return -1
        }

        if (priorityB === 'superior' && priorityA != 'superior') {
            return -1
        }

        if (priorityB === 'inferior' && priorityA != 'inferior') {
            return 1
        }

        return priorityA > priorityB ? 1 : -1
    }

    public comparePriority(otherJob: Job) {
        return Job.comparePriority(this.getPriority(), otherJob.getPriority())
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

        if (!this.keepResult) {
            throw new Error('No result kept')
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
            // WARNING IN CASE OF VERBOSE
            const runLog = _.omit(log, ['job'])
            this.runLogs.push(runLog)
            this.emit('log', runLog)

            if (_.get(runLog, 'level') === 'warning') {
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
        let error: Error | undefined = undefined

        let allocatedTimeTimeout

        if (this.allocatedTime) {
            allocatedTimeTimeout = setTimeout(() => {
                if (this.abortOnAllocatedTime) {
                    this.abort('timeout')
                }
                this.emit('allocated-time-reached')
            }, durationToMilliSeconds(this.allocatedTime))
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
            if (this.keepResult) {
                this.result = result
            }
            this.state = 'done'
            this.logger.info('Done :)', {
                jobState: this.state
            })
            this.emit('done', result)
        }

        this.logger.off('log', runningLoggerListener)
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
        this.endedAt = new Date
        this.emit('canceled')
        this.emit('ended')
        this.emit('error', this.error)
    }
}

export interface JobsCollectionQuery {
    [filter: string]: any
}

export interface JobsCollectionSort {
    [filter: string]: 1 | -1
}

export interface JobsCollection<RegisteredJob extends Job> {
    insert(job: RegisteredJob): Promise<void>
    remove(query: JobsCollectionQuery): Promise<void>
    find(query: JobsCollectionQuery, sort?: JobsCollectionSort, limit?: number, skip?: number): Promise<RegisteredJob[]>
    findOne(query: JobsCollectionQuery, sort?: JobsCollectionSort): Promise<RegisteredJob | undefined>
}

function resolveQuery(query: JobsCollectionQuery): JobsCollectionQuery {
    if (query.runState as JobRunState) {
        const states = _.invertBy(runStateMapping)[query.runState]

        query = _.cloneDeep(query)
        delete query.runState

        // Strange but to avoid complex code
        if (!query.$and) {
            query = { $and: [query] }
        }
        query.$and.push({ state: { $in: states } })

        // if (!query.state) {
        //     query.state = { $in: states }
        // } else {
        //     if (query.$and) {
        //         query.$and.push({ state: { $in: states } })
        //     } else {
        //         query = {
        //             $and: [
        //                 query,
        //                 { state: { $in: states } }
        //             ]
        //         }
        //     }
        // }
    }

    return query
}

export class InMemoryJobsCollection<RegisteredJob extends Job> implements JobsCollection<RegisteredJob> {
    protected jobs: RegisteredJob[] = []

    public async insert(job: RegisteredJob) {
        if (this.jobs.includes(job)) {
            return
        }

        this.jobs.push(job)
    }

    public async find(query: JobsCollectionQuery, sort?: JobsCollectionSort, limit?: number, skip?: number) {
        const cursor = new Query(resolveQuery(query)).find(this.jobs)

        if (sort) {
            cursor.sort(sort)
        }

        if (skip) {
            cursor.skip(skip)
        }

        if (limit) {
            cursor.limit(limit)
        }

        return cursor.all() as RegisteredJob[]
    }

    public async remove(query: JobsCollectionQuery) {
        const jobs = await this.find(query)

        jobs.forEach(job => this.jobs.splice(this.jobs.indexOf(job), 1))
    }

    public async findOne(query: JobsCollectionQuery, sort?: JobsCollectionSort) {
        const founds = await this.find(query, sort, 1)

        return founds.length ? founds[0] as RegisteredJob : undefined
    }
}

// Only for ended jobs :)
export class FilePersistedJobsCollection<RegisteredJob extends Job> implements JobsCollection<RegisteredJob> {
    protected datastore: Datastore

    constructor(filePath: string) {
        this.datastore = new Datastore({filename: filePath, autoload: true})
    }

    public async insert(job: RegisteredJob) {
        if (await this.findOne({uuid: job.getUuid()})) {
            return
        }
        await new Promise((resolve, reject) => this.datastore.insert(job.toJSON(), (e) => e && reject(e) || resolve(undefined)))
    }

    public async remove(query: JobsCollectionQuery) {
         await new Promise((resolve, reject) => this.datastore.remove(query, { multi: true }, (e) => e && reject(e) || resolve(undefined)))
    }

    public async find(query: JobsCollectionQuery, sort?: JobsCollectionSort, limit?: number, skip?: number) {
        const docs: object[] = await new Promise((resolve, reject) => {
            const cursor = this.datastore.find(resolveQuery(query))

            if (sort) {
                cursor.sort(sort)
            }

            if (limit) {
                cursor.limit(limit)
            }

            if (skip) {
                cursor.skip(skip)
            }

            cursor.exec((e, docs) => e && reject(e) || resolve(docs))
        })

        return docs.map(doc => Job.fromJSON(doc))
    }

    public async findOne(query: JobsCollectionQuery, sort?: JobsCollectionSort) {
        const founds = await this.find(query, sort, 1)

        return founds.length ? founds[0] as RegisteredJob : undefined
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
            } else {
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
            const compare = job.comparePriority(jjob)
            if (compare === 1 || compare === 0 && job.getCreatedAt() < jjob.getCreatedAt()) {
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
