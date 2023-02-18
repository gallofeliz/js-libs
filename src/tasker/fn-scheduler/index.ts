import cron from 'cron-parser'
import { UniversalLogger } from '@gallofeliz/logger'
import { v4 as uuid } from 'uuid'

/** @pattern ^[0-9* \-,/]{9,}$ */
export type Cron = string

export type Schedule = number | Cron

export interface FnSchedulerOpts {
    id?: any,
    fn: Function,
    logger: UniversalLogger,
    schedules: Schedule[],
    runOnStart?: boolean
    repeatNb?: number
}

export function schedule({abortSignal, ...opts}: FnSchedulerOpts & {abortSignal?: AbortSignal}) {
    const fnScheduler = new FnScheduler(opts)

    fnScheduler.start(abortSignal)

    return fnScheduler
}

export class FnScheduler<Identity = any> {
    protected id: Identity
    protected fn: Function
    protected schedules: Schedule[]
    protected repeatNb: number
    protected repeatCurrent: number = 0
    protected runOnStart: boolean
    protected timeoutId: NodeJS.Timeout | null = null
    protected timeoutNextDate: Date | null = null
    protected logger: UniversalLogger
    protected status: 'started' | 'stopped' | 'ended' = 'stopped'

    constructor({id, fn, logger, schedules, runOnStart = false, repeatNb = Infinity}: FnSchedulerOpts) {
        if (Number.isNaN(repeatNb) || repeatNb < 1) {
            throw new Error('Invalid repeatNb')
        }

        this.id = id || uuid()
        this.fn = fn
        this.schedules = schedules
        this.runOnStart = runOnStart
        this.logger = logger.child({ fnSchedulerId: id })
        this.repeatNb = repeatNb

        this.computeStatus()
    }

    public getId() {
        return this.id
    }

    public start(abortSignal?: AbortSignal) {
        abortSignal?.addEventListener('abort', () => this.stop())

        if (this.getStatus() !== 'stopped') {
            return
        }

        this.status = 'started'
        this.run(true)
    }

    public getStatus() {
        this.computeStatus()
        return this.status
    }

    protected computeStatus() {
        const nextTime = this.getNextScheduleTime()

        if (!nextTime) {
            this.stop(false)
            this.status = 'ended'
        }
    }

    public stop(abortCurrentFn?: boolean) {
        if (this.getStatus() !== 'started') {
            return
        }

        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }

        this.timeoutId = null
        this.timeoutNextDate = null
        this.status = 'stopped'
    }

    public getNextScheduledDate(): Date | null {
        return this.timeoutNextDate
    }

    protected getNextScheduleTime(): number {
        const now = (new Date).getTime()

        const nextTimes = this.schedules.map(schedule => {
            if (typeof schedule !== 'number') { // Todo : Change to check cron or duration
                return cron.parseExpression(schedule).next().getTime() - now
            }

            return schedule
        })

        return nextTimes.sort()[0]
    }

    protected async run(starting = false) {
        // We also can put at the end to avoid multiple exec
        const nextTime = this.getNextScheduleTime()

        if (!nextTime) {
            this.stop(false)
            this.status = 'ended'
            return
        }

        this.timeoutId = setTimeout(() => this.run(), nextTime)
        this.timeoutNextDate = new Date((new Date).getTime() + nextTime)

        if (starting && !this.runOnStart) {
            return
        }

        this.repeatCurrent++

        if (this.repeatCurrent >= this.repeatNb) {
            this.stop(false)
            this.status = 'ended'
        }

        try {
            await this.fn()
        } catch (e) {
            // Thanks to async/await I can cheat with no promise ahah
            this.logger.error('Fn call fails', {error: e})
        }
    }
}
