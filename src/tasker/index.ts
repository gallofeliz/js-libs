import { DefaultDocumentCollection } from './document-collection'
import { each, omit, mapValues } from 'lodash'
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

export interface Task/*<R extends any>*/ {
    uuid: string
    status: TaskStatus
    operation: string
    inputData: any
    priority: TaskPriority
    createdAt: Date
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
}

export class Tasker {
    protected started: boolean = false
    protected tasksCollection: DefaultDocumentCollection<TaskDocument>
    protected logsCollection: DefaultDocumentCollection<LogDocument>
    protected runners: Record<string, Runner> = {}
    protected logger: Logger
    protected abortControllers: Record<string, AbortController> = {}
    protected internalEmitter = new EventEmitter

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
    }

    public start(abortSignal?: AbortSignal) {
        abortSignal?.addEventListener('abort', () => this.stop())
        this.started = true
        this.runNexts()
    }

    public stop() {
        this.started = false
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
            uuid: uuid(),
            status: 'new',
            createdAt: new Date
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
                ...await this.logsCollection.find({ taskUuid: uuid }),
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
        const logsPromise = this.logsCollection.find({ taskUuid: uuid })

        const [task, logs] = await Promise.all([taskPromise, logsPromise])

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

        const newTasks = await this.tasksCollection.find({ status: 'new' })

        newTasks.forEach(task => this.runTask(task))
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
        }
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