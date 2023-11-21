import { DocumentCollection, NeDbDocumentCollection, DocumentCollectionQuery, DocumentCollectionSort } from '@gallofeliz/documents-collection'
import { each, omit, mapValues, groupBy } from 'lodash'
import { getMaxLevelsIncludes, Logger, LogLevel, UniversalLogger } from '@gallofeliz/logger'
import { v4 as uuid } from 'uuid'
import EventEmitter, { once } from 'events'
import jsonata from 'jsonata'
import Pqueue from 'p-queue'

export interface TaskerOpts {
    persistDir: string | null
    logger: Logger
    runners?: Record<string, Runner>
    archivingFrequency?: number
}

export class AbortError extends Error {
    name = 'AbortError'
    code = 'ABORT_ERR'
    constructor(message: string = 'This operation was aborted') {
        super(message)
    }
}

export class SkippedAddTask extends Error {
    name = 'SkippedAddTask'
    code = 'SKIPPED_ADD_TASK'
    constructor(message: string = 'Skipped addTask (see addCondition)') {
        super(message)
    }
}

export interface RunningData extends Task {
    logger: UniversalLogger
    abortSignal: AbortSignal
}

export type Runner = (data: RunningData) => Promise<void>

export type TaskPriority = number

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'aborted'

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
    id: any
    status: TaskStatus
    operation: Operation
    data?: Data
    priority: TaskPriority
    createdAt: Date
    startedAt?: Date
    endedAt?: Date
    logs?: object[]
    result?: Result
    error?: Error
    abortReason?: Error
    runTimeout?: number
    archiving?: {
        duration?: number
    }
    addCondition?: {
        query: string
    }
    runCondition?: {
        query: string
    }
    onTaskerStop?: {
        abortQueued: boolean
    }
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
    id: any
    operation: string
    data?: any
    priority?: TaskPriority
    runCondition?: {
        query: string
    }
    runTimeout?: number
    abortSignal?: AbortSignal
    archiving?: {
        duration?: number
    }
    addCondition?: {
        query: string
    }
    onTaskerStop?: {
        abortQueued: boolean
    }
}


export interface RetrieveTaskOpts {
    withLogs?: boolean
    logsMaxLevel?: LogLevel
}

export class Tasker extends EventEmitter {
    protected started: boolean = false
    protected tasksCollection: DocumentCollection<TaskDocument>
    protected logsCollection: DocumentCollection<LogDocument>
    protected runners: Record<string, Runner> = {}
    protected logger: Logger
    //protected abortControllers: Record<string, AbortController> = {}
    protected internalEmitter = new EventEmitter
    protected runNextsLock: boolean = false
    protected runNextsRequested: boolean = false
    protected archivingFrequency: number
    protected archivingInterval?: NodeJS.Timeout
    protected addQueue = new Pqueue({concurrency: 1})
    protected runningCount = 0
    protected lastQueueCount = 0

    public constructor({persistDir, runners, logger, archivingFrequency}: TaskerOpts) {
        super()
        this.logger = logger.child({ taskerUuid: uuid() })
        this.internalEmitter.setMaxListeners(Infinity)
        this.archivingFrequency = archivingFrequency || 60 * 60 * 1000
        this.tasksCollection = new NeDbDocumentCollection<TaskDocument>({
            filePath: persistDir === null ? null : this.getDocumentCollectionFilename(persistDir, 'tasks'),
            indexes: [
                { fieldName: 'status' },
                { fieldName: 'uuid', unique: true },
                { fieldName: 'operation' }
            ]
        })
        this.logsCollection = new NeDbDocumentCollection<LogDocument>({
            filePath: persistDir === null ? null : this.getDocumentCollectionFilename(persistDir, 'logs'),
            indexes: [
                { fieldName: 'taskUuid' }
            ]
        })
        each(runners, (runner, operation) => this.assignRunner(operation, runner))
    }

    public async cleanEndedTasks() {
        const toCleanTasks = await this.tasksCollection.aggregate(
            [
                {
                    $match: {
                        status: { $in: ['done', 'failed', 'aborted'] },
                        'archiving.duration': { $exists: true },
                        $expr: {
                            $gt: [
                                new Date,
                                {
                                    $dateAdd: {
                                        startDate: "$endedAt",
                                        unit: "millisecond",
                                        amount: "$archiving.duration"
                                    }
                                }
                            ]
                        }
                    }
                },
                {
                    $project: {
                        uuid: 1,
                        _id: 0
                    }
                }
            ]
        ).toArray()

        const uuids = toCleanTasks.map(task => task.uuid)

        await Promise.all([
            this.tasksCollection.remove({ uuid: { $in: uuids } }),
            this.logsCollection.remove({ taskUuid: { $in: uuids } })
        ])
    }

    public start(abortSignal?: AbortSignal) {
        if (abortSignal?.aborted) {
            this.stop()
            return
        }
        abortSignal?.addEventListener('abort', () => this.stop())

        if (this.started) {
            return
        }

        this.started = true
        this.emit('started')

        const statusToAbort: TaskStatus[] = /*this.abortNewTasksOnStop ? ['new', 'running'] : */['running']

        // Emit events ?
        this.tasksCollection.update(
            {
                $or: [
                    { status: { $in: statusToAbort } },
                    { 'onTaskerStop.abortQueued': true, status: 'queued' }
                ]
            },
            { $set: {
                status: 'aborted',
                abortReason: this.errorToJson(new AbortError('Unexpected tasks status on Tasker load (bad shutdown ?)')),
                endedAt: new Date
            }}
        )

        this.archivingInterval = setInterval(() => this.cleanEndedTasks(), this.archivingFrequency)
        this.cleanEndedTasks()
        this.runNexts()
    }

    public async stop() {
        if (!this.started) {
            return
        }

        this.started = false
        clearInterval(this.archivingInterval)

        const statusToAbort: TaskStatus[] = /*this.abortNewTasksOnStop ? ['new', 'running'] : */['running']

        const tasksToAbort = this.tasksCollection.find(
            {
                $or: [
                    { status: { $in: statusToAbort } },
                    { 'onTaskerStop.abortQueued': true, status: 'queued' }
                ]
            },
            { projection: { uuid: 1 } }
        )

        tasksToAbort.forEach(task => this.abortTask(task.uuid, 'Tasker Stop'))

        this.emit('stopped')
    }

    public assignRunner(operation: string, run: Runner) {
        if (this.runners[operation]) {
            throw new Error(operation + ' already assigned')
        }
        this.runners[operation] = run
    }

    protected async evaluateConditionQuery({query, context}: {query: string, context?: any}): Promise<boolean> {
        const evaluation = await jsonata(query).evaluate(context, {
            hasTask: this.hasTask.bind(this),
            countTasks: this.countTasks.bind(this)
        })

        if (typeof evaluation !== 'boolean') {
            this.logger.warning('Invalid query evaluation, expected boolean ; using cast strategy', { evaluation })
            return !!evaluation
        }

        return evaluation
    }

    public async addTask(addTask: AddTaskOpts): Promise<string> {
        if (!this.runners[addTask.operation]) {
            this.logger.warning('No runner assigned for operation ' + addTask.operation)
        }

        return this.addQueue.add(async () => {
            this.emit('task.add', addTask)

            if(addTask.addCondition) {
                const shouldAdd: boolean = await this.evaluateConditionQuery({
                    query: addTask.addCondition.query,
                    context: {addOpts: addTask}
                })

                if (!shouldAdd) {
                    this.logger.info('Skipping task', { addTask: { id: addTask.id }, events: { 'add.skipped': 1 } })
                    this.emit('task.add.skipped', addTask.id)
                    throw new SkippedAddTask
                }
            }

            const taskUuid = uuid()

            await this.tasksCollection.insert({
                priority: 0,
                ...omit(addTask, 'abortSignal'),
                uuid: taskUuid,
                status: 'queued',
                createdAt: new Date
            })

            if (addTask.abortSignal) {
                if(addTask.abortSignal.aborted) {
                    this.abortTask(taskUuid, 'Task AbortSignal aborted')
                } else {
                    const abortSignal = addTask.abortSignal
                    const onTaskSignalAbort = () => this.abortTask(taskUuid, 'Task AbortSignal aborted')
                    abortSignal.addEventListener('abort', onTaskSignalAbort)

                    this.once(`task.${taskUuid}.aborted`, () => {
                        abortSignal.removeEventListener('abort', onTaskSignalAbort)
                    })
                }
            }

            this.logger.info('Adding task', { task: {uuid: taskUuid, id: addTask.id, status: 'queued'}, events: { add: 1 } })
            this.emit('task.added', taskUuid, addTask.id)

            this.runNexts()

            return taskUuid
        })
    }

    public async waitForTaskOutputData(uuid: string) : Promise<any> {
        let task = await this.tasksCollection.findOne({ uuid }) as TaskDocument | undefined

        if (!task) {
            throw new Error('Task not found')
        }

        if (['queued', 'running'].includes(task.status)) {
            await once(this.internalEmitter, 'ended.' + task.uuid)
            task = await this.tasksCollection.findOne({ uuid }) as TaskDocument
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
        const task = await this.tasksCollection.findOne({ uuid }) as TaskDocument | undefined
        const internalEmitter = this.internalEmitter
        if (!task) {
            throw new Error('Task not found')
        }
        let alreadyLogs: object[] = []

        if (fromBeginning) {

            function onLogDuringFetchingLogs(log: object) {
                alreadyLogs.push(log)
            }

            internalEmitter.on('log.' + uuid, onLogDuringFetchingLogs)

            alreadyLogs = [
                ...await this.logsCollection.find({ taskUuid: uuid }, {sort:{ timestamp: 1 }, projection: { taskUuid: 0, _id: 0 }}).toArray(),
                ...alreadyLogs
            ]

            internalEmitter.off('log.' + uuid, onLogDuringFetchingLogs)
        }

        return function*() {
            for (const log of alreadyLogs) {
                yield Promise.resolve(log)
            }
            if (!['queued', 'running'].includes(task.status)) {
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

    public async countTasks(query: DocumentCollectionQuery) {
        return await this.tasksCollection.count(query)
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

        const tasks = this.tasksCollection.find(query, {sort, limit, skip, projection: { _id: 0 }})
        const logs = withLogs
            ? groupBy(
                await this.logsCollection.find({ taskUuid: { $in: tasks.map(t => t.uuid) }, level: { $in: logLevels } }, {sort:{ timestamp: 1 }}).toArray(),
                'taskUuid'
            )
            : undefined

        return tasks.map(task => {
            return {
                ...omit(task, '_id'),
                ...logs && {logs: (logs[task.uuid] || []).map(log => omit(log, 'taskUuid', '_id'))}
            }
        })
    }

    public async getTask(uuid: string, { withLogs = false, logsMaxLevel = 'info' }: RetrieveTaskOpts = {}): Promise<Task> {
        const logLevels = getMaxLevelsIncludes(logsMaxLevel)

        const taskPromise = this.tasksCollection.findOne({ uuid }, {projection: {_id: 0}}) as Promise<TaskDocument | undefined>
        const logsPromise = withLogs
            ? this.logsCollection.find({ taskUuid: uuid, level: { $in: logLevels } }, {sort:{ timestamp: 1 }}).toArray()
            : Promise.resolve(undefined)

        const [task, logs] = await Promise.all([taskPromise, logsPromise])

        if (!task) {
            throw new Error('Task not found')
        }

        return {
            ...task,
            ...logs && {logs: logs.map(log => omit(log, 'taskUuid', '_id'))}
        }
    }

    public async prioritizeTask(uuid: string, priority: number) {
        const [updated, taskExists] = await Promise.all([
            // Update priority if task exists and is queued
            this.tasksCollection.updateOne({ uuid, status: 'queued' }, { $set: { priority } }),
            // Assert task exists
            this.tasksCollection.has({ uuid })
        ])

        if (!taskExists) {
            throw new Error('Task not found')
        }

        if (!updated) {
            return
        }

        this.emit('task.prioritized', uuid, priority)
        this.emit(`task.${uuid}.prioritized`, priority)

        this.runNexts()
    }

    public async abortTask(uuid: string, reason?: string) {
        const task = await this.tasksCollection.findOne({ uuid }) as TaskDocument | undefined

        if (!task) {
            throw new Error('Task not found')
        }

        if (!['queued', 'running'].includes(task.status)) {
            return
        }

        const reasonErr = new AbortError(reason)

        this.logger.info('Aborting task', { task: {uuid: task.uuid, id: task.id}, events: { abort: 1 } })
        /**
         * warning risk of concurrent read/write (updating running)
         */

        if (task.status === 'queued') {
            await this.tasksCollection.updateOne(
                { _id: task._id },
                { $set: { status: 'aborted', endedAt: new Date, abortReason: this.errorToJson(reasonErr) }}
            )
            this.logger.info('Aborted queued task', { task: {uuid: task.uuid, id: task.id, status: 'aborted'}, events: { aborted: 1 } })
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

        const newTasks = this.tasksCollection.find(
            { status: 'queued' },
            {sort:{ priority: -1, createdAt: 1 }}
        )

        let nbQueuedTasks = 0
        const refused: string[] = []

        for await (const task of newTasks) {
            nbQueuedTasks++
            if (!this.runners[task.operation]) {
                continue
            }

            const evaluation: boolean = task.runCondition ? await this.evaluateConditionQuery({
                query: task.runCondition.query,
                context: {
                    task,
                    beforeQueuedTasksUuids: refused
                }
            }) : true

            if (evaluation) {
                await this.runTask(task)
            } else {
                refused.push(task.uuid)
            }
        }

        this.runNextsLock = false

        if (!nbQueuedTasks && this.lastQueueCount) {
            this.emit('empty-queue')
        }

        if (!this.lastQueueCount && nbQueuedTasks) {
            this.emit('queuing')
        }

        this.lastQueueCount = nbQueuedTasks

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
            { returnDocument: true }
        ) as TaskDocument

        this.emit('task.run', task.uuid)
        this.emit(`task.${task.uuid}.run`)

        if (!this.runningCount) {
            this.emit('running')
        }

        this.runningCount++

        ;(async() => {
            this.logger.info('Running task', { task: {uuid: task.uuid, id: task.id, status: 'running'}, events: { run: 1 } })

            const taskLogger = this.logger.child({ task: {uuid: task.uuid, id: task.id, status: 'running'} })

            const loggerHandler = {
                handle: async (log: any) =>  {
                    const cleanedLog = omit(log, 'taskerUuid', 'task')
                    await this.logsCollection.insert({...cleanedLog, taskUuid: task.uuid})
                    this.internalEmitter.emit('log.' + task.uuid, cleanedLog)
                    this.emit('task.log', task.uuid, cleanedLog)
                    this.emit(`task.${task.uuid}.log`, cleanedLog)
                }
            }

            taskLogger.getHandlers().push(loggerHandler)

            const onAbort = (reason?: AbortError) => {
                //taskLogger.getMetadata().status = 'aborting'
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
                    ...omit(task, '_id'),
                    logger: taskLogger,
                    abortSignal: abortController.signal
                })

                immediateAfterToDo()

                task = await this.tasksCollection.updateOne(
                    { _id: task._id },
                    { $set: {status: 'done', result, endedAt: new Date }},
                    { returnDocument: true }
                ) as TaskDocument

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
                        { returnDocument: true }
                    ) as TaskDocument
                    this.emit('task.aborted', task.uuid, abortController.signal.reason)
                    this.emit(`task.${task.uuid}.aborted`, abortController.signal.reason)
                    this.emit('task.ended', task.uuid, task.status, abortController.signal.reason)
                    this.emit(`task.${task.uuid}.ended`, task.status, abortController.signal.reason)
                } else {
                    task = await this.tasksCollection.updateOne(
                        { _id: task._id },
                        { $set: { status: 'failed', error: this.errorToJson(error as Error), endedAt: new Date }},
                        { returnDocument: true }
                    ) as TaskDocument
                    this.emit('task.failed', task.uuid, error)
                    this.emit(`task.${task.uuid}.failed`, error)
                    this.emit('task.ended', task.uuid, task.status, error)
                    this.emit(`task.${task.uuid}.ended`, task.status, error)
                }
            } finally {
                taskLogger.getHandlers().splice(taskLogger.getHandlers().indexOf(loggerHandler))
                this.logger.info('Ended task', { task: {uuid: task.uuid, id: task.id, status: task.status}, events: { ended: 1, [task.status]: 1 } })
                this.internalEmitter.emit('ended.' + task.uuid)
                this.runningCount--

                if (this.runningCount === 0) {
                    this.emit('idle')
                }

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