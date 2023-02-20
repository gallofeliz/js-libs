import { DefaultDocumentCollection, DocumentCollectionQuery } from './document-collection'
import { each, omit, mapValues, sortBy, cloneDeep, every } from 'lodash'
import { Logger, UniversalLogger } from '@gallofeliz/logger'
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

export type RunCondition = ConcurrencyRunCondition | FnRunCondition

export interface ConcurrencyRunCondition {
    type: 'concurrency'
    scope: 'running' | 'before-queued'
    query: DocumentCollectionQuery | string
    limit: number
}

export interface FnRunCondition {
    type: 'fn',
    fnName: string
}

export interface Task/*<R extends any>*/ {
    uuid: string
    status: TaskStatus
    operation: string
    inputData: any
    priority: TaskPriority
    createdAt: Date
    runConditions: RunCondition[]
    startedAt?: Date
    endedAt?: Date
    logs: object[]
    outputData?: unknown
    error?: Error
    abortReason?: Error
}

type TaskDocument = Omit<Task, 'logs'> & {
    _id: string
}

interface LogDocument {
    _id: string
    taskUuid: string
    [key: string]: any
}

export interface AddTaskOpts {
    operation: string
    inputData: Task['inputData']
    priority?: TaskPriority
    runConditions?: RunCondition[]
}

export class Tasker {
    protected started: boolean = false
    protected tasksCollection: DefaultDocumentCollection<TaskDocument>
    protected logsCollection: DefaultDocumentCollection<LogDocument>
    protected runners: Record<string, Runner> = {}
    protected logger: Logger
    protected abortControllers: Record<string, AbortController> = {}
    protected internalEmitter = new EventEmitter
    protected runNextsLock: boolean = false

    public constructor({persistDir, runners, logger}: TaskerOpts) {
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
        this.runNexts()
    }

    public async stop() {
        this.started = false

        const runningTasks = await this.tasksCollection.find({ status: 'running' })

        runningTasks.forEach(task => this.abortTask(task.uuid, 'Tasker Stop'))
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

        const task = await this.tasksCollection.insert({
            priority: 0,
            ...addTask,
            runConditions: addTask.runConditions
                ? addTask.runConditions.map(condition => {
                    if (condition.type === 'concurrency' && typeof condition.query !== 'string') {
                        condition = cloneDeep(condition)
                        condition.query = JSON.stringify(condition.query)
                    }

                    return condition
                })
                : [],
            uuid: uuid(),
            status: 'new',
            createdAt: new Date,
        })

        this.logger.info('Adding task', { task })

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
            return task.outputData
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

    public async getTask(uuid: string): Promise<Task> {
        const taskPromise = this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})
        const logsPromise = this.logsCollection.find({ taskUuid: uuid }, { timestamp: 1 })

        const [task, logs] = await Promise.all([taskPromise, logsPromise])

        // task.runConditions.forEach(condition => {
        //     if (condition.type === 'concurrency') {
        //         condition.query = JSON.parse(condition.query as string)
        //     }
        // })

        return {
            ...task,
            logs: logs.map(log => omit(log, 'taskUuid'))
        }
    }

    public async abortTask(uuid: string, reason?: string) {
        const task = await this.tasksCollection.findOne({ uuid }, undefined, {assertFound: true})

        if (task.status === 'new') {

            await this.tasksCollection.updateOne(
                { _id: task._id },
                { $set: { status: 'aborted', endedAt: new Date }},
                { assertUpdated: true, returnDocument: false }
            )

        } else if (task.status === 'running') {
            this.internalEmitter.emit('abort.' + uuid, new AbortError(reason))
        }
    }

    protected async runNexts() {
        if (!this.started) {
            return
        }

        if (this.runNextsLock) {
            return
        }

        this.runNextsLock = true

        const newTasks = await this.tasksCollection.find(
            { status: 'new' },
            { priority: -1, createdAt: 1 }
        )

        const refused: string[] = []

        for (const task of newTasks) {
            if (!this.runners[task.operation]) {
                continue
            }

            const conditionsResults = await Promise.all(task.runConditions.map(async condition => {
                if (condition.type !== 'concurrency') {
                    throw new Error('Unhandled')
                }

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

        ;(async() => {
            this.logger.info('Running task', { task })

            const taskLogger = this.logger.child({ taskUuid: task.uuid })

            const onLog = async (log: object) => {
                await this.logsCollection.insert(log)
                this.internalEmitter.emit('log.' + task.uuid, log)
            }

            taskLogger.on('log', onLog)

            const onAbort = (reason?: AbortError) => {
                abortController.abort(reason)
            }

            this.internalEmitter.on('abort.' + task.uuid, onAbort)

            const abortController = new AbortController

            try {
                const outputData = await this.runners[task.operation]({
                    ...task,
                    logger: taskLogger,
                    abortSignal: abortController.signal
                })

                task = await this.tasksCollection.updateOne(
                    { _id: task._id },
                    { $set: {status: 'done', outputData, endedAt: new Date }},
                    { assertUpdated: true, returnDocument: true }
                )
            } catch (error) {
                if (abortController.signal.aborted) {
                    task = await this.tasksCollection.updateOne(
                        { _id: task._id },
                        { $set: { status: 'aborted', abortReason: this.errorToJson(abortController.signal.reason), endedAt: new Date }},
                        { assertUpdated: true, returnDocument: true }
                    )
                } else {
                    task = await this.tasksCollection.updateOne(
                        { _id: task._id },
                        { $set: { status: 'failed', error: this.errorToJson(error as Error), endedAt: new Date }},
                        { assertUpdated: true, returnDocument: true }
                    )
                }
            } finally {
                taskLogger.off('log', onLog)
                this.logger.info('Ended task', { task: {...task, outputData: task.outputData !== undefined ? '(troncated)' : undefined} })
                this.internalEmitter.off('abort.' + task.uuid, onAbort)
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