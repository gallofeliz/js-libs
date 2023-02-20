import { DefaultDocumentCollection } from './document-collection'
import { each, omit } from 'lodash'
import { Logger, UniversalLogger } from '@gallofeliz/logger'
import { v4 as uuid } from 'uuid'

export interface TaskerOpts {
    persistDir: string
    logger: Logger
    runners?: Record<string, Runner>
}

export interface RunningData extends TaskDocument {
    logger: UniversalLogger
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

    public async addTask(addTask: AddTaskOpts): Promise<string> {
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

        try {
            const outputData = await this.runners[task.operation]({...task, logger: taskLogger})

            task = await this.tasksCollection.updateOne(
                { _id: task._id },
                { $set: {status: 'done', outputData, endedAt: new Date }},
                { assertUpdated: true, returnDocument: true }
            )
        } catch (error) {
            task = await this.tasksCollection.updateOne(
                { _id: task._id },
                { $set: { status: 'failed', error, endedAt: new Date }},
                { assertUpdated: true, returnDocument: true }
            )
        } finally {
            taskLogger.off('log', log)
        }
    }

    protected getDocumentCollectionFilename(persistDir: string, collectionName: string) {
        return persistDir + '/' + collectionName + '.db'
    }
}