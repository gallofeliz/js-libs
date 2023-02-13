import { durationToMilliSeconds, Duration } from '@gallofeliz/human-units-converter'
import cron from 'cron-parser'
import { UniversalLogger } from '@gallofeliz/logger'

/** @pattern ^[0-9* \-,/]{9,}$ */
export type Cron = string

export type Schedule = Duration | Cron

export default class FnScheduler<Identity = any> {
    protected id: Identity
    protected fn: Function
    protected schedules: Schedule[]
    protected runOnStart: boolean
    protected timeoutId: NodeJS.Timeout | null = null
    protected timeoutNextDate: Date | null = null
    protected logger: UniversalLogger

    constructor(
        {id, fn, logger, schedules, runOnStart}:
        {id?: any, fn: Function, logger: UniversalLogger, schedules: Schedule[], runOnStart: boolean}
    ) {
        this.id = id
        this.fn = fn
        this.schedules = schedules
        this.runOnStart = runOnStart
        this.logger = logger.child({ fnSchedulerId: id })
    }

    public getId() {
        return this.id
    }

    public start() {
        if (this.timeoutId) {
            return
        }

        this.run(true)
    }

    public stop() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }

        this.timeoutId = null
        this.timeoutNextDate = null
    }

    public getNextScheduledDate(): Date | null {
        return this.timeoutNextDate
    }

    protected getNextScheduleTime(): number {
        const now = (new Date).getTime()

        const nextTimes = this.schedules.map(schedule => {
            if (schedule.includes(' ')) { // Todo : Change to check cron or duration
                return cron.parseExpression(schedule).next().getTime() - now
            }

            return durationToMilliSeconds(schedule)
        })

        return nextTimes.sort()[0]
    }

    protected async run(starting = false) {
        // We also can put at the end to avoid multiple exec
        const nextTime = this.getNextScheduleTime()
        this.timeoutId = setTimeout(() => this.run(), nextTime)
        this.timeoutNextDate = new Date((new Date).getTime() + nextTime)

        if (starting && !this.runOnStart) {
            return
        }

        try {
            await this.fn()
        } catch (e) {
            // Thanks to async/await I can cheat with no promise ahah
            this.logger.error('Fn call fails', {error: e})
        }
    }
}
