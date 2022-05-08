import createLogger from '../src/logger'
import {Job,/*, JobsManager*/ JobsRunner, InMemoryJobsCollection} from '../src/jobs'
import { once } from 'events'

import Datastore from 'nedb'

const logger = createLogger('info')

const jobRunner = new JobsRunner({logger, concurrency: 2})

;(async () => {

    const joby = new Job({
        logger,
        id: {operation: 'special'},
        duplicable: true,
        priority: 'normal',
        async fn({logger}) {
            await new Promise(resolve => setTimeout(resolve, 10))

            const originalError = new Error('Http Error')
            logger.warning('Partner error', {originalError})


            throw new Error('BADABOOOOM')
        }
    })

    //const db = new Datastore({filename: './test.db', autoload: true})
    //const neDBPersisteJobsCollection = new NeDBPersisteJobsCollection(db)

    const coll = new InMemoryJobsCollection

    coll.insert(joby)

    console.log((await coll.find({runState: 'ready'})))
})()

;(async () => {
    return
    function createJob() {
        const identity = Math.random()
        const priority = (() => {
            const prio = ['immediate', 'normal', 'superior']
            return prio[Math.floor(Math.random() * prio.length)]
        })()

        return new Job({
            id: identity,
            priority: 'normal',
            logger,
            async fn({logger}) {
                logger.info('I am ' + identity)

                await new Promise(resolve => setTimeout(resolve, 1000))

                return 'RESULT' + identity
            }
        })
    }

    setInterval(async () => {

        if (Math.floor(Math.random() * 10) !== 0) {
            return
        }

        try {
            const result = await jobRunner.run(createJob(), true)

            console.log('The result is ', result)

        } catch (e) {
            console.error('An error occured : ', e)
        }
    }, 50)

    setTimeout(() => {
        console.log('Starting jobRunner')
        jobRunner.start()
    }, 5000)

    setTimeout(() => {
        console.log({ queue: jobRunner.getQueuingJobs(), running: jobRunner.getRunningJobs() })
        console.log('Stopping jobRunner')
         jobRunner.stop(true, true)
         setTimeout(() => {
             console.log({ queue: jobRunner.getQueuingJobs(), running: jobRunner.getRunningJobs() })
         }, 200)
    }, 10000)

})()
