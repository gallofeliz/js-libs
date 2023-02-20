import { createLogger } from '@gallofeliz/logger'
import { Tasker } from '.'

describe('Tasker', () => {
    it('test', async() => {
        const tasker = new Tasker({
            persistDir: '/tmp',
            logger: createLogger()
        })

        tasker.assignRunner('sum', async ({inputData, logger}) => {

            logger.info('Sum', {inputData})

            return inputData[0] + inputData[1]
        })

        const taskUuid = await tasker.addTask({
            operation: 'sum',
            inputData: [5, 4]
        })

        tasker.start()

        await new Promise(resolve => setTimeout(resolve, 100))

        console.log(await tasker.getTask(taskUuid))
    })
})