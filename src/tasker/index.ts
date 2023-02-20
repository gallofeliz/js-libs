import { DefaultDocumentCollection } from './document-collection'
import { each, omit } from 'lodash'
import { Logger, UniversalLogger } from '@gallofeliz/logger'
import { v4 as uuid } from 'uuid'

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
    abortReason?: string
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

    public constructor({persistDir, runners, logger}: TaskerOpts) {
        this.logger = logger
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

        this.runNexts()

        return task.uuid
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
            this.abortControllers[uuid].abort(new AbortError(reason))
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

        const taskLogger = this.logger.child({ taskUuid: task.uuid })

        const log = async (log: object) => {
            await this.logsCollection.insert(log)
        }

        taskLogger.on('log', log)
        const abortController = new AbortController

        try {
            this.abortControllers[task.uuid] = abortController
            const outputData = await this.runners[task.operation]({
                ...task,
                logger: taskLogger,
                abortSignal: abortController.signal
            })

            await this.tasksCollection.updateOne(
                { _id: task._id },
                { $set: {status: 'done', outputData, endedAt: new Date }},
                { assertUpdated: true, returnDocument: false }
            )
        } catch (error) {
            if (abortController.signal.aborted) {
                await this.tasksCollection.updateOne(
                    { _id: task._id },
                    { $set: { status: 'aborted', abortReason: abortController.signal.reason.message, endedAt: new Date }},
                    { assertUpdated: true, returnDocument: false }
                )
            } else {
                await this.tasksCollection.updateOne(
                    { _id: task._id },
                    { $set: { status: 'failed', error, endedAt: new Date }},
                    { assertUpdated: true, returnDocument: false }
                )
            }

        } finally {
            taskLogger.off('log', log)
            delete this.abortControllers[task.uuid]
        }
    }

    protected getDocumentCollectionFilename(persistDir: string, collectionName: string) {
        return persistDir + '/' + collectionName + '.db'
    }
}