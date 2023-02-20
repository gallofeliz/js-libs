import { createLogger } from '@gallofeliz/logger'
import { Tasker } from '.'

describe('Tasker', () => {
    it('test', async() => {
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

            return inputData[0] + inputData[1]
        })

        const taskUuid = await tasker.addTask({
            operation: 'sum',
            inputData: [5, 4]
        })

        tasker.waitForTaskOutputData(taskUuid).then(outputData => {
            console.log('waitForTaskOutputData returns', outputData)
        }).catch(error => {
            console.log('waitForTaskOutputData throws', error)
        })

        tasker.start()

        setTimeout(() => tasker.abortTask(taskUuid, 'Pas envie'), 50)

        await new Promise(resolve => setTimeout(resolve, 200))

        console.log(await tasker.getTask(taskUuid))
    })
})