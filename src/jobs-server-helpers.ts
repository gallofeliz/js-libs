import { Job } from './jobs'
import { Request, Response } from 'express'

export function realtimeLogs({job, req, res, fromBeginning = true}: {job: Job, req: Request, res: Response, fromBeginning?: boolean}) {
    res.set('Content-Type', 'application/x-ndjson')

    if (fromBeginning) {
        job.getRunLogs().forEach(runLog => res.write(JSON.stringify(runLog) + '\n'))
    }

    if (['success', 'failure', 'aborted', 'canceled'].includes(job.getState())) {
        return res.end()
    }

    job.on('log', (runLog) => {
        res.write(JSON.stringify(runLog) + '\n')
    })

    const close = () => {
        res.end()
        req.off('close', close)
    }

    req.once('close', close)
    job.once('canceled', close)
    job.once('ended', close)
}
