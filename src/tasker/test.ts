import { createLogger } from '@gallofeliz/logger'
import { unlink } from 'fs/promises'
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

    it('test1', async() => {
        const tasker = new Tasker({
            persistDir: '/tmp',
            logger: createLogger()
        })

        tasker.assignRunner('sum', async ({data, logger, abortSignal}) => {

            let aborted = false

            abortSignal.addEventListener('abort', () => {
                aborted = true
            })

            await new Promise(resolve => setTimeout(resolve, 100))

            if (aborted) {
                throw abortSignal.reason
            }

            logger.info('Sum', {data})

            await new Promise(resolve => setTimeout(resolve, 100))

            logger.info('Ended')

            return data[0] + data[1]
        })

        const taskUuid = await tasker.addTask({
            operation: 'sum',
            data: [5, 4]
        })

        ;(async () => {
            for await (const log of await tasker.listenTaskLogs(taskUuid)) {
                if (log) {
                    console.log('listenTaskLogs receives', log)
                }
            }
        })()

        tasker.waitForTaskOutputData(taskUuid).then(result => {
            console.log('waitForTaskOutputData returns', result)
        }).catch(error => {
            console.log('waitForTaskOutputData throws', error)
        })

        tasker.start()

        //setTimeout(() => tasker.abortTask(taskUuid, 'Pas envie'), 50)

        await new Promise(resolve => setTimeout(resolve, 250))

        console.log('task', await tasker.getTask(taskUuid))

        ;(async () => {
            for await (const log of await tasker.listenTaskLogs(taskUuid, { fromBeginning: true })) {
                if (log) {
                    console.log('listenTaskLogs received from beginning', log)
                }
            }
        })()

        await new Promise(resolve => setTimeout(resolve, 250))

        console.log('has listeners (dirty, should not)', (tasker as any).internalEmitter.eventNames().length !== 0)

    }).timeout(5000)

    it('test2', async() => {
        const tasker = new Tasker({
            persistDir: '/tmp',
            logger: createLogger(),
            runners: {
                'read-book': async ({logger, data, priority}) => {
                    console.log('>>>>>>>>>>>>>>>>> READ', priority)
                    logger.info('I will read book')
                    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 100))
                },
                'write-book': async ({logger, data, priority}) => {
                    console.log('>>>>>>>>>>>>>>>>> WRITE', priority)
                    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 100))
                }
            }
        })

        /**
         * Read Book for same book max 2 in same time inclusive lock
         * Write Book exclusive lock scoped book
        */
        function readBook(book: string, priority: number) {
            tasker.addTask({
                operation: 'read-book',
                data: {
                    book: book,
                    reader: 'reader1',
                    lock: 'inclusive'
                },
                priority,
                concurrency: [
                    {
                        scope: 'running',
                        query: { 'data.lock': 'inclusive', 'data.book': book },
                        limit: 1
                    },
                    {
                        scope: 'running',
                        query: { 'data.lock': 'exclusive', 'data.book': book },
                        limit: 0
                    },
                    {
                        scope: 'before-queued',
                        query: { 'data.book': book, 'data.lock': 'exclusive' },
                        limit: 0
                    }
                ]
            })
        }

        function writeBook(book: string, priority: number) {
            tasker.addTask({
                operation: 'write-book',
                data: {
                    book: book,
                    reader: 'reader1',
                    lock: 'exclusive'
                },
                priority,
                concurrency: [
                    {
                        scope: 'running',
                        query: { 'data.book': book },
                        limit: 0
                    }
                ]
            })
        }

        readBook('book1', 100)
        writeBook('book1', 99)
        writeBook('book1', 98)
        readBook('book1', 97)
        readBook('book1', 96)
        readBook('book1', 95)
        writeBook('book1', 94)

        tasker.start()

        setTimeout(async () => {
            console.log('findTasks', await tasker.findTasks({ status: 'running' }, {withLogs: true}))
        }, 2000)

        await new Promise(resolve => setTimeout(resolve, 40000))

    }).timeout(60000)
})
