import { createLogger } from '@gallofeliz/logger'
import { once } from 'events'
//import { strictEqual } from 'assert'
//import { unlink } from 'fs/promises'
import { Tasker } from '.'

describe('Tasker', () => {
    // beforeEach(async () => {
    //     try {
    //         await unlink('/tmp/tasks2.db')
    //     } catch (e) {
    //         if ((e as any).code !== 'ENOENT') {
    //             throw e
    //         }
    //     }
    // })

    it.only('test42', async () => {
        const tasker = new Tasker({
            persistDir: null,
            logger: createLogger(),
            archivingFrequency: 100,
            runners: {
                'read-book': async ({logger, data, id, priority}) => {
                    process.stdout.write('\n')
                    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> READ', new Date, id, priority)
                    logger.info('I am reading the book')
                    process.stdout.write('\n')
                    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 100))
                },
                'write-book': async ({logger, data, id, priority}) => {
                    process.stdout.write('\n')
                    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> WRITE', new Date, id, priority)
                    process.stdout.write('\n')
                    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 100))
                }
            }
        })

        tasker.start()

        async function addTask(operation: string, book: string, exclusiveLock: boolean) {
            try {
                return await tasker.addTask({
                    id: {
                        book,
                        exclusiveLock
                    },
                    operation,
                    addCondition: { query: '$not($hasTask({ "operation": addOpts.operation, "id": addOpts.id, "status": "queued" }))' },
                    runCondition: { query:
                        exclusiveLock
                            ? `
                                $not($hasTask({ "id.book": task.id.book, "status": "running" }))
                                and
                                $not($countTasks({"status": "running"}) > 1)
                            `
                            : `
                                $not($hasTask({ "id.book": task.id.book, "id.exclusive": true, "status": "running" }))
                                and
                                /*$not($countTasks({ "id.book": task.id.book, "status": "running" }) > 1)*/
                                $not($countTasks({"status": "running"}) > 1)
                                and
                                $not($hasTask({"id.book": task.id.book, "uuid": { "$in": beforeQueuedTasksUuids }, "id.exclusiveLock": true, "status": "queued" }))

                            `}
                })

            } catch (e) {
                if ((e as any).code !== 'SKIPPED_ADD_TASK') {
                    throw e
                }
            }

        }

        await addTask('read-book', 'book1', false)
        await new Promise(resolve => setTimeout(resolve, 500))
        await addTask('read-book', 'book1', false)
        await new Promise(resolve => setTimeout(resolve, 500))
        await addTask('write-book', 'book1', true)
        await new Promise(resolve => setTimeout(resolve, 500))
        await addTask('read-book', 'book2', false)
        await new Promise(resolve => setTimeout(resolve, 500))
        await addTask('read-book', 'book1', false)

        await addTask('read-book', 'book10', false)
        await addTask('read-book', 'book11', false)
        await addTask('read-book', 'book12', false)
        await addTask('read-book', 'book13', false)
        await addTask('read-book', 'book14', false)
        await addTask('read-book', 'book15', false)
        const taskUuid = await addTask('read-book', 'book16', false)

        await Promise.all([
            once(tasker, 'idle'),
            once(tasker, 'empty-queue')
        ])

        console.log(await tasker.getTask(taskUuid as string, {withLogs: true}))


        tasker.stop()
    }).timeout(60000)

    // it('test3', async () => {
    //     const tasker = new Tasker({
    //         persistDir: null,
    //         logger: createLogger(),
    //         archivingFrequency: 100
    //     })

    //     tasker.assignRunner('sum', async ({logger}) => {
    //         logger.info('hello')
    //     })

    //     tasker.start()

    //     tasker.addTask({
    //         id: 'sum',
    //         operation: 'sum'
    //     })

    //     tasker.addTask({
    //         id: 'sum archiving 300',
    //         operation: 'sum',
    //         archiving: {
    //             duration: 300
    //         }
    //     })

    //     tasker.addTask({
    //         id :' sum archiving 50',
    //         operation: 'sum',
    //         archiving: {
    //             duration: 50
    //         }
    //     })

    //     await new Promise(resolve => setTimeout(resolve, 200))

    //     const tasks = await tasker.findTasks({})

    //     console.log(tasks.length)

    //     strictEqual(tasks.length, 2)

    //     tasker.stop()


    // })

    // it('test1', async() => {
    //     const tasker = new Tasker({
    //         persistDir: '/tmp',
    //         logger: createLogger()
    //     })

    //     tasker.assignRunner('sum', async ({data, logger, abortSignal}) => {

    //         let aborted = false

    //         abortSignal.addEventListener('abort', () => {
    //             aborted = true
    //         })

    //         await new Promise(resolve => setTimeout(resolve, 100))

    //         if (aborted) {
    //             throw abortSignal.reason
    //         }

    //         logger.info('Sum', {data})

    //         await new Promise(resolve => setTimeout(resolve, 100))

    //         logger.info('Ended')

    //         return data[0] + data[1]
    //     })

    //     const taskUuid = await tasker.addTask({
    //         id: 'sum 5 and 4',
    //         operation: 'sum',
    //         data: [5, 4]
    //     })

    //     ;(async () => {
    //         for await (const log of await tasker.listenTaskLogs(taskUuid)) {
    //             if (log) {
    //                 console.log('listenTaskLogs receives', log)
    //             }
    //         }
    //     })()

    //     tasker.waitForTaskOutputData(taskUuid).then(result => {
    //         console.log('waitForTaskOutputData returns', result)
    //     }).catch(error => {
    //         console.log('waitForTaskOutputData throws', error)
    //     })

    //     tasker.start()

    //     //setTimeout(() => tasker.abortTask(taskUuid, 'Pas envie'), 50)

    //     await new Promise(resolve => setTimeout(resolve, 250))

    //     console.log('task', await tasker.getTask(taskUuid))

    //     ;(async () => {
    //         for await (const log of await tasker.listenTaskLogs(taskUuid, { fromBeginning: true })) {
    //             if (log) {
    //                 console.log('listenTaskLogs received from beginning', log)
    //             }
    //         }
    //     })()

    //     await new Promise(resolve => setTimeout(resolve, 250))

    //     console.log('has listeners (dirty, should not)', (tasker as any).internalEmitter.eventNames().length !== 0)

    // }).timeout(5000)

    // it('test2', async() => {
    //     const tasker = new Tasker({
    //         persistDir: '/tmp',
    //         logger: createLogger(),
    //         runners: {

    //         }
    //     })

    //     /**
    //      * Read Book for same book max 2 in same time inclusive lock
    //      * Write Book exclusive lock scoped book
    //     */
    //     function readBook(book: string, priority: number) {
    //         tasker.addTask({
    //             id: 'read-book reader1',
    //             operation: 'read-book',
    //             data: {
    //                 book: book,
    //                 reader: 'reader1',
    //                 lock: 'inclusive'
    //             },
    //             priority,
    //             concurrency: [
    //                 {
    //                     scope: 'running',
    //                     query: { 'data.lock': 'inclusive', 'data.book': book },
    //                     limit: 1
    //                 },
    //                 {
    //                     scope: 'running',
    //                     query: { 'data.lock': 'exclusive', 'data.book': book },
    //                     limit: 0
    //                 },
    //                 {
    //                     scope: 'before-queued',
    //                     query: { 'data.book': book, 'data.lock': 'exclusive' },
    //                     limit: 0
    //                 }
    //             ]
    //         })
    //     }

    //     function writeBook(book: string, priority: number) {
    //         tasker.addTask({
    //             id: 'write-book reader1',
    //             operation: 'write-book',
    //             data: {
    //                 book: book,
    //                 reader: 'reader1',
    //                 lock: 'exclusive'
    //             },
    //             priority,
    //             concurrency: [
    //                 {
    //                     scope: 'running',
    //                     query: { 'data.book': book },
    //                     limit: 0
    //                 }
    //             ]
    //         })
    //     }

    //     readBook('book1', 100)
    //     writeBook('book1', 99)
    //     writeBook('book1', 98)
    //     readBook('book1', 97)
    //     readBook('book1', 96)
    //     readBook('book1', 95)
    //     writeBook('book1', 94)

    //     tasker.start()

    //     setTimeout(async () => {
    //         console.log('findTasks', await tasker.findTasks({ status: 'running' }, {withLogs: true}))
    //     }, 2000)

    //     await new Promise(resolve => setTimeout(resolve, 40000))

    // }).timeout(60000)
})
