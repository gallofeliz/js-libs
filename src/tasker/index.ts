import { DefaultDocumentCollection, DocumentCollectionQuery, DocumentCollectionSort } from './document-collection'
import { each, omit, mapValues, sortBy, cloneDeep, every, groupBy } from 'lodash'
import { getMaxLevelsIncludes, Logger, LogLevel, UniversalLogger } from '@gallofeliz/logger'
import { v4 as uuid } from 'uuid'
import EventEmitter, { once } from 'events'

export interface TaskerOpts {
    persistDir: string
    logger: Logger
    runners?: Record<string, Runner>
}

export class AbortError extends Error {
    name = 'AbortError'
    code = 'ABORT_ERR'
    constructor(message: string = 'This operation was aborted') {
        super(message)
    }
}

export interface RunningData extends TaskDocument {
    logger: UniversalLogger
    abortSignal: AbortSignal
}

export type Runner = (data: RunningData) => Promise<void>

export type TaskPriority = number

export type TaskStatus = 'new' | 'running' | 'done' | 'failed' | 'aborted'

export type TaskConcurrency = Array<{
    scope: 'running' | 'before-queued'
    query: DocumentCollectionQuery
    limit: number
}>

export type TaskDocumentConcurrency = Array<{
    scope: 'running' | 'before-queued'
    query: string
    limit: number
}>

/*

interface BaseTask<Operation extends string = any, Data extends any = any> {
    uuid: string
    status: TaskStatus
    operation: Operation
    data: Data
    priority: TaskPriority
    createdAt: Date
    concurrency?: TaskConcurrency
    runTimeout?: number
    logs?: object[]
}

export interface NewTask<Operation extends string = any, Data extends any = any> extends BaseTask<Operation, Data> {
    status: 'new'
}

export interface RunningTask<Operation extends string = any, Data extends any = any> extends BaseTask<Operation, Data> {
    status: 'running'
    startedAt: Date
}

export interface DoneTask<Operation extends string = any, Data extends any = any, Result extends any = any> extends BaseTask<Operation, Data> {
    status: 'done'
    startedAt: Date
    endedAt: Date
    result: Result
}

export interface AbortedTask<Operation extends string = any, Data extends any = any> extends BaseTask<Operation, Data> {
    status: 'aborted'
    startedAt: Date
    endedAt: Date
    abortReason: Error
}

export interface FailedTask<Operation extends string = any, Data extends any = any> extends BaseTask<Operation, Data> {
    status: 'failed'
    startedAt: Date
    endedAt: Date
    error: Error
}

export type Task<Operation extends string = any, Data extends any = any, Result extends any = any>
    = NewTask<Operation, Data> | RunningTask<Operation, Data> | DoneTask<Operation, Data, Result> | AbortedTask<Operation, Data> | FailedTask<Operation, Data>

*/

export interface Task<Operation extends string = any, Data extends any = any, Result extends any = any> {
    uuid: string
    status: TaskStatus
    operation: Operation
    data: Data
    priority: TaskPriority
    createdAt: Date
    concurrency?: TaskConcurrency
    startedAt?: Date
    endedAt?: Date
    logs?: object[]
    result?: Result
    error?: Error
    abortReason?: Error
    runTimeout?: number
}

type TaskDocument = Omit<Task, 'logs' | 'concurrency'> & {
    _id: string
    concurrency?: TaskDocumentConcurrency
}

interface LogDocument {
    _id: string
    taskUuid: string
    [key: string]: any
}

export interface AddTaskOpts {
    operation: string
    data: any
    priority?: TaskPriority
    concurrency?: TaskConcurrency
    runTimeout?: number
}

export interface RetrieveTaskOpts {
    withLogs?: boolean
    logsMaxLevel?: LogLevel
}

export class Tasker extends EventEmitter {
    protected started: boolean = false
    protected tasksCollection: DefaultDocumentCollection<TaskDocument>
    protected logsCollection: DefaultDocumentCollection<LogDocument>
    protected runners: Record<string, Runner> = {}
    protected logger: Logger
    protected abortControllers: Record<string, AbortController> = {}
    protected internalEmitter = new EventEmitter
    protected runNextsLock: boolean = false
    protected runNextsRequested: boolean = false

    public constructor({persistDir, runners, logger}: TaskerOpts) {
        super()
        this.logger = logger.child({ taskerUuid: uuid() })
        this.internalEmitter.setMaxListeners(Infinity)
        this.tasksCollection = new DefaultDocumentCollection({
            filePath: this.getDocumentCollectionFilename(persistDir, 'tasks'),
            indexes: [
                { fieldName: 'status' },
                { fieldName: 'uuid', unique: true },
                { fieldName: 'operation' }
            ]
        })
        this.logsCollection = new DefaultDocumentCollection({
            filePath: this.getDocumentCollectionFilename(persistDir, 'logs'),
            indexes: [
                { fieldName: 'taskUuid' }
            ]
        })
        each(runners, (runner, operation) => this.assignRunner(operation, runner))

        // Emit events ?
        this.tasksCollection.update(
            { status: 'running' },
            { $set: {
                status: 'aborted',
                abortReason: this.errorToJson(new AbortError('Unexpected running task on Tasker load')),
                endedAt: new Date
            }}
        )
    }

    public start(abortSignal?: AbortSignal) {
        abortSignal?.addEventListener('abort', () => this.stop())
        this.started = true
        this.emit('started')
        this.runNexts()
    }

    public async stop() {
        this.started = false

        const runningTasks = await this.tasksCollection.find({ status: 'running' })

        runningTasks.forEach(task => this.abortTask(task.uuid, 'Tasker Stop'))

        this.emit('stopped')
    }

    public assignRunner(operation: string, run: Runner) {
        if (this.runners[operation]) {
            throw new Error(operation + ' already assigned')
        }
        this.runners[operation] = run
    }

    public async addTask(addTask: AddTaskOpts/*, abortSignal */): Promise<string> {
        if (!this.runners[addTask.operation]) {
            this.logger.warning('No runner assigned for operation ' + addTask.operation)
        }

        this.emit('task.add', addTask)

        const task = await this.tasksCollection.insert({
            priority: 0,
            ...omit(addTask, 'concurrency'),
            ...addTask.concurrency && {
                concurrency: addTask.concurrency.map(condition => {
                    return {
                        ...cloneDeep(condition),
                        query: JSON.stringify(condition.query)
                    }
                })
            },
            uuid: uuid(),
            status: 'new',
            createdAt: new Date
        })

        this.logger.info('Adding task', { task })
        this.emit('task.added', task.uuid)

        this.runNexts()

        return task.uuid
    }

    public async waitForTaskOutputData(uuid: string) : Promise<any> {
        let task = await this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})

        if (['new', 'running'].includes(task.status)) {
            await once(this.internalEmitter, 'ended.' + task.uuid)
            task = await this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})
        }

        if (task.status === 'done') {
            return task.result
        }

        throw task.status === 'aborted' ? task.abortReason : task.error
    }

    public async listenTaskLogs(
        uuid: string,
        { fromBeginning = false, abortSignal }: {fromBeginning?: boolean, abortSignal?: AbortSignal} = {}
    ) {
        const task = await this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})
        const internalEmitter = this.internalEmitter

        let alreadyLogs: object[] = []

        if (fromBeginning) {

            function onLogDuringFetchingLogs(log: object) {
                alreadyLogs.push(log)
            }

            internalEmitter.on('log.' + uuid, onLogDuringFetchingLogs)

            alreadyLogs = [
                ...await this.logsCollection.find({ taskUuid: uuid }, { timestamp: 1 }),
                ...alreadyLogs
            ]

            internalEmitter.off('log.' + uuid, onLogDuringFetchingLogs)
        }

        return function*() {
            for (const log of alreadyLogs) {
                yield Promise.resolve(log)
            }
            if (!['new', 'running'].includes(task.status)) {
                return
            }

            let cont = true

            function getNextLog() {
                return new Promise((resolve, reject) => {
                    const removeListeners = () => {
                        internalEmitter.off('log.' + uuid, onLog)
                        internalEmitter.off('ended.' + uuid, onEndOrAbort)
                        abortSignal?.removeEventListener('abort', onEndOrAbort)
                    }

                    const onLog = (log: object) => {
                        removeListeners()
                        resolve(log)
                    }

                    const onEndOrAbort = () => {
                        cont = false
                        removeListeners()
                        resolve(undefined)
                    }

                    internalEmitter.once('log.' + uuid, onLog)
                    internalEmitter.once('ended.' + uuid, onEndOrAbort)
                    abortSignal?.addEventListener('abort', onEndOrAbort)
                })
            }

            while(cont) {
                yield getNextLog()
            }
        }()
    }

    public async hasTask(query: DocumentCollectionQuery) {
        return await this.tasksCollection.has(query)
    }

    public async findTask(
        query: DocumentCollectionQuery,
        {sort, ...retrieveOpts}: RetrieveTaskOpts & {sort?: DocumentCollectionSort<TaskDocument>} = {}
    ) {
        const tasks = await this.findTasks(query, {...retrieveOpts, sort, limit: 1})

        if (tasks.length === 0) {
            return
        }

        return tasks[0]
    }

    public async findTasks(
        query: DocumentCollectionQuery,
        {sort, limit, skip, withLogs = false, logsMaxLevel = 'info'}: RetrieveTaskOpts & {sort?: DocumentCollectionSort<TaskDocument>, limit?: number, skip?: number} = {}
    ) {
        const logLevels = getMaxLevelsIncludes(logsMaxLevel)

        // Not sur the good place to try to returns tasks that represents the queue order, the running order and the ended order
        sort = sort || { endedAt: 1, startedAt: 1, priority: -1, createdAt: 1 }

        const tasks = await this.tasksCollection.find(query, sort, limit, skip)
        const logs = withLogs
            ? groupBy(
                await this.logsCollection.find({ taskUuid: { $in: tasks.map(t => t.uuid) }, level: { $in: logLevels } }, { timestamp: 1 }),
                'taskUuid'
            )
            : undefined

        return tasks.map(task => {
            return {
                ...task,
                ...task.concurrency && { concurrency: task.concurrency.map(condition => {
                    return {
                        ...cloneDeep(condition),
                        query: JSON.parse(condition.query)
                    }
                })},
                ...logs && {logs: (logs[task.uuid] || []).map(log => omit(log, 'taskUuid', '_id'))}
            }
        })
    }

    public async getTask(uuid: string, { withLogs = false, logsMaxLevel = 'info' }: RetrieveTaskOpts = {}): Promise<Task> {
        const logLevels = getMaxLevelsIncludes(logsMaxLevel)

        const taskPromise = this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})
        const logsPromise = withLogs
            ? this.logsCollection.find({ taskUuid: uuid, level: { $in: logLevels } }, { timestamp: 1 })
            : Promise.resolve(undefined)

        const [task, logs] = await Promise.all([taskPromise, logsPromise])

        return {
            ...task,
            ...task.concurrency && { concurrency: task.concurrency.map(condition => {
                return {
                    ...cloneDeep(condition),
                    query: JSON.parse(condition.query)
                }
            })},
            ...logs && {logs: logs.map(log => omit(log, 'taskUuid', '_id'))}
        }
    }

    public async prioritizeTask(uuid: string, priority: number) {
        // db.update({uuid, status: 'new'}, {$set: ...}) can make the job simplier

        const task = await this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})

        if (task.status !== 'new' || task.priority === priority) {
            return
        }

        await this.tasksCollection.updateOne({ uuid }, { $set: { priority } }, {assertUpdated: true})
        this.emit('task.prioritized', task.uuid, priority)
        this.emit(`task.${task.uuid}.prioritized`, priority)

        this.runNexts()
    }

    public async abortTask(uuid: string, reason?: string) {
        const task = await this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})

        if (!['new', 'running'].includes(task.status)) {
            return
        }

        const reasonErr = new AbortError(reason)

        if (task.status === 'new') {
            await this.tasksCollection.updateOne(
                { _id: task._id },
                { $set: { status: 'aborted', endedAt: new Date, abortReason: this.errorToJson(reasonErr) }},
                { assertUpdated: true, returnDocument: false }
            )
            this.emit('task.aborted', task.uuid, reasonErr)
            this.emit(`task.${task.uuid}.aborted`, reasonErr)
        } else if (task.status === 'running') {
            this.internalEmitter.emit('abort.' + uuid, reasonErr)
        }
    }

    protected async runNexts() {
        if (!this.started) {
            return
        }

        if (this.runNextsLock) {
            this.runNextsRequested = true
            return
        }

        this.runNextsLock = true
        this.runNextsRequested = false

        const newTasks = await this.tasksCollection.find(
            { status: 'new' },
            { priority: -1, createdAt: 1 }
        )

        const refused: string[] = []

        for (const task of newTasks) {
            if (!this.runners[task.operation]) {
                continue
            }

            const conditionsResults = await Promise.all((task.concurrency || []).map(async condition => {
                if (condition.scope === 'running') {
                    const a = await this.tasksCollection.count({
                        ...JSON.parse(condition.query as string),
                        status: 'running'
                    })

                    return a <= condition.limit
                } else if (condition.scope === 'before-queued') {

                    const a = await this.tasksCollection.count({
                        ...JSON.parse(condition.query as string),
                        _id: { $in: refused }
                    })

                    return a <= condition.limit
                } else {
                    throw new Error('Unhandled')
                }
            }))

            if (every(conditionsResults, Boolean)) {
                await this.runTask(task)
            } else {
                refused.push(task._id)
            }
        }

        this.runNextsLock = false

        if (this.runNextsRequested) {
            this.runNexts()
        }
    }

    protected async runTask(task: TaskDocument) {
        if (!this.runners[task.operation]) {
            return
        }

        task = await this.tasksCollection.updateOne(
            { _id: task._id },
            { $set: { status: 'running', startedAt: new Date }},
            { assertUpdated: true, returnDocument: true }
        )

        this.emit('task.run', task.uuid)
        this.emit(`task.${task.uuid}.run`)

        ;(async() => {
            this.logger.info('Running task', { task })

            const taskLogger = this.logger.child({ taskUuid: task.uuid })

            const onLog = async (log: object) => {
                await this.logsCollection.insert(omit(log, 'taskerUuid'))
                this.internalEmitter.emit('log.' + task.uuid, log)
                const cleanedLog = omit(log, 'taskerUuid', 'taskUuid')
                this.emit('task.log', task.uuid, cleanedLog)
                this.emit(`task.${task.uuid}.log`, cleanedLog)
            }

            taskLogger.on('log', onLog)

            const onAbort = (reason?: AbortError) => {
                abortController.abort(reason)
            }

            this.internalEmitter.on('abort.' + task.uuid, onAbort)

            const abortController = new AbortController

            const runTimeout = task.runTimeout
                && setTimeout(() => abortController.abort(new AbortError('Task run timeout')), task.runTimeout)

            const immediateAfterToDo = () => {
                clearTimeout(runTimeout)
                this.internalEmitter.off('abort.' + task.uuid, onAbort)
            }

            try {
                const result = await this.runners[task.operation]({
                    ...task,
                    logger: taskLogger,
                    abortSignal: abortController.signal
                })

                immediateAfterToDo()

                task = await this.tasksCollection.updateOne(
                    { _id: task._id },
                    { $set: {status: 'done', result, endedAt: new Date }},
                    { assertUpdated: true, returnDocument: true }
                )

                this.emit('task.done', task.uuid, result)
                this.emit(`task.${task.uuid}.done`, result)
                this.emit('task.ended', task.uuid, task.status, result)
                this.emit(`task.${task.uuid}.ended`, task.status, result)
            } catch (error) {
                immediateAfterToDo()

                if (abortController.signal.aborted) {
                    task = await this.tasksCollection.updateOne(
                        { _id: task._id },
                        { $set: { status: 'aborted', abortReason: this.errorToJson(abortController.signal.reason), endedAt: new Date }},
                        { assertUpdated: true, returnDocument: true }
                    )
                    this.emit('task.aborted', task.uuid, abortController.signal.reason)
                    this.emit(`task.${task.uuid}.aborted`, abortController.signal.reason)
                    this.emit('task.ended', task.uuid, task.status, abortController.signal.reason)
                    this.emit(`task.${task.uuid}.ended`, task.status, abortController.signal.reason)
                } else {
                    task = await this.tasksCollection.updateOne(
                        { _id: task._id },
                        { $set: { status: 'failed', error: this.errorToJson(error as Error), endedAt: new Date }},
                        { assertUpdated: true, returnDocument: true }
                    )
                    this.emit('task.failed', task.uuid, error)
                    this.emit(`task.${task.uuid}.failed`, error)
                    this.emit('task.ended', task.uuid, task.status, error)
                    this.emit(`task.${task.uuid}.ended`, task.status, error)
                }
            } finally {
                taskLogger.off('log', onLog)
                this.logger.info('Ended task', { task: {...task, result: task.result !== undefined ? '(troncated)' : undefined} })
                this.internalEmitter.emit('ended.' + task.uuid)
                this.runNexts()
            }
        })()
    }

    protected errorToJson(error: Error) {
        // security if throws is not Error
        if (!(error instanceof Error)) {
            return error
        }

        return {
            ...mapValues(Object.getOwnPropertyDescriptors(error), v => v.value),
            name: error.name
        }
    }

    protected getDocumentCollectionFilename(persistDir: string, collectionName: string) {
        return persistDir + '/' + collectionName + '.db'
    }
}