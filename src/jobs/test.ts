import createLogger from '../src/logger'
import {Job,/*, JobsManager*/ JobsRunner, InMemoryJobsCollection, FilePersistedJobsCollection} from '../src/jobs'
import { once } from 'events'

import Datastore from 'nedb'

const logger = createLogger('info')

const jobRunner = new JobsRunner({logger, concurrency: 2})

class MyError extends Error {
    protected a: string

    constructor(message: string, a: string) {
        super(message)
        this.name = 'MyError'
        this.a = a
    }
}

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

            const e = new MyError('Boooom', 'a value')
            ;(e as any).b = 'b value'

            throw e
        }
    })

    //const db = new Datastore({filename: './test.db', autoload: true})
    //const neDBPersisteJobsCollection = new NeDBPersisteJobsCollection(db)

    const coll = new FilePersistedJobsCollection('/tmp/test.db')

    joby.run()
    await joby.toPromise().catch(e => {})
    console.log(joby)
    console.log(Job.fromJSON(joby.toJSON()))

    //await coll.insert(joby)

    //console.log((await coll.findOne({'id.operation': 'special'})))
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
