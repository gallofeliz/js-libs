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

        tasker.assignRunner('sum', async ({inputData, logger, abortSignal}) => {

            let aborted = false

            abortSignal.addEventListener('abort', () => {
                aborted = true
            })

            await new Promise(resolve => setTimeout(resolve, 100))

            if (aborted) {
                throw abortSignal.reason
            }

            logger.info('Sum', {inputData})

            await new Promise(resolve => setTimeout(resolve, 100))

            logger.info('Ended')

            return inputData[0] + inputData[1]
        })

        const taskUuid = await tasker.addTask({
            operation: 'sum',
            inputData: [5, 4]
        })

        ;(async () => {
            for await (const log of await tasker.listenTaskLogs(taskUuid)) {
                if (log) {
                    console.log('listenTaskLogs receives', log)
                }
            }
        })()

        tasker.waitForTaskOutputData(taskUuid).then(outputData => {
            console.log('waitForTaskOutputData returns', outputData)
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

    it.only('test2', async() => {
        const tasker = new Tasker({
            persistDir: '/tmp',
            logger: createLogger(),
            runners: {
                'read-book': async ({logger, inputData, priority}) => {
                    console.log('>>>>>>>>>>>>>>>>> READ', priority)
                    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 100))
                },
                'write-book': async ({logger, inputData, priority}) => {
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
                inputData: {
                    book: book,
                    reader: 'reader1',
                    lock: 'inclusive'
                },
                priority,
                runConditions: [
                    {
                        type: 'concurrency',
                        scope: 'running',
                        query: { 'inputData.lock': 'inclusive', 'inputData.book': book },
                        limit: 1
                    },
                    {
                        type: 'concurrency',
                        scope: 'running',
                        query: { 'inputData.lock': 'exclusive', 'inputData.book': book },
                        limit: 0
                    },
                    {
                        type: 'concurrency',
                        scope: 'before-queued',
                        query: { 'inputData.book': book, 'inputData.lock': 'exclusive' },
                        limit: 0
                    }
                ]
            })
        }

        function writeBook(book: string, priority: number) {
            tasker.addTask({
                operation: 'write-book',
                inputData: {
                    book: book,
                    reader: 'reader1',
                    lock: 'exclusive'
                },
                priority,
                runConditions: [
                    {
                        type: 'concurrency',
                        scope: 'running',
                        query: { 'inputData.book': book },
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

        await new Promise(resolve => setTimeout(resolve, 40000))

    }).timeout(60000)
})
