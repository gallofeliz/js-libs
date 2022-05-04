import { EventEmitter, once } from 'events'
import { v4 as uuid4 } from 'uuid'
import { Logger } from './logger'
import _ from 'lodash'

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

interface JobOpts<Identity> {
    trigger?: string | null
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
    protected resolve?: (data: any) => void
    protected reject?: (error: Error) => void
    protected logger: Logger
    protected runLogs: object[] = []
    protected warnings: object[] = []
    protected abortController: AbortController = new AbortController

    constructor({ trigger, identity, fn, priority = 'normal', logger }: JobOpts<Identity>) {
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

export class JobsRunner {
    protected queue: Job<any, any>[] = []
    protected running: Job<any, any>[] = []
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

    public run(job: Job<any, any>, getResult?: false): void
    public run<Result>(job: Job<any, Result>, getResult: true): Promise<Result>

    public run<Result>(job: Job<any, Result>, getResult: boolean = false) {
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
            return once(job, 'done').then(eventArgs => eventArgs[0])
        }
    }

    protected computeJobQueuePosition(job: Job<any, any>) {
        let index = 0
        for (const jjob of this.queue) {
            if (this.isPrioSup(job, jjob)) {
                break
            }
            index++
        }

        return index
    }

    protected isJobRunnableConcurrentlyWithRunningJobs(job: Job<any, any>) {
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

    protected _run(job: Job<any, any>) {
        // Slot reservation
        this.queue.splice(this.queue.indexOf(job), 1)
        this.running.push(job)
        job.run()
    }

    protected isPrioSup(jobA: Job<any, any>, jobB: Job<any, any>): boolean {
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
