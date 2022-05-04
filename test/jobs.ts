import createLogger from '../src/logger'
import {Job,/*, JobsManager*/ JobsRunner, JobsRegistry} from '../src/jobs'
import { once } from 'events'
const logger = createLogger('info')

const jobRunner = new JobsRunner({logger, concurrency: 2})

;(async () => {
    function createJob() {
        return new Job({
            logger,
            identity: Math.random(),
            priority: 'normal',
            async fn(){
                await new Promise(resolve => setTimeout(resolve, Math.round(Math.random() * 20000)))
            }
        })
    }

    const registry = new JobsRegistry({maxNbEnded: 50, maxEndDateDuration: '10s', logger})

    for (let i=0; i < 20; i++) {
        const job = createJob()
        job.run()
        registry.addJob(job)
    }

    await new Promise(resolve => setTimeout(resolve, 15000))

    console.log(registry.getJobs())

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
            identity: identity,
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
