import createLogger from '../src/logger'
import {Job, JobsManager} from '../src/jobs'

const logger = createLogger('info')

const job1 = new Job({
    trigger: 'manual',
    operation: 'doTheJob',
    subjects: {a: '1', b: 'yes'},
    priority: 'normal',
    logger,
    async fn(job) {
        job.getLogger().info('Doing job1')

        await new Promise(resolve => setTimeout(resolve, 5000))

        return 47
    }
})

const job2 = new Job({
    trigger: 'manual',
    operation: 'doTheJob',
    subjects: {a: '2', b: 'yes'},
    priority: 'normal',
    logger,
    async fn(job) {
        job.getLogger().info('Doing job2')

        await new Promise(resolve => setTimeout(resolve, 2000))

        return 48
    }
})

const jobManager = new JobsManager(logger)

;
(async () => {
    jobManager.addJob(job1)
    jobManager.addJob(job2)
    jobManager.start()

    console.log(await job1.getSummary())
    console.log(await job2.getSummary())

    console.log(jobManager.getJob(job2.getUuid()) === job2)
    console.log(jobManager.getJobs())
    console.log(jobManager.getJobs(false))
    console.log('search without criteria', jobManager.searchJobs({}))
    console.log('search with criteria', jobManager.searchJobs({operation: 'doTheJob', someSubjects: {a: '2'}}))

    job1.getResult().then(r => console.log('job1 result ' + r))
    job2.getResult().then(r => console.log('job2 result ' + r))
})()

