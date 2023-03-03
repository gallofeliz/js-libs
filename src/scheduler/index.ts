import cronParser from 'cron-parser'

export interface AddScheduleOpts {
    id: any
    fn: () => void | Promise<void>
    schedule: string // string[] with ! prefix for exclusion ?
    startDate?: Date
    endDate?: Date
    limit?: number
}

export interface Schedule {
    id: any
    fn: () => void | Promise<void>
    schedule: cronParser.CronExpression<true>
    nextTimeout?: NodeJS.Timeout
    nextTriggerDate?: Date
    countdown: number
}

export interface SchedulerOpts {
    onError?: OnError
}

export type OnError = (error: Error, scheduleId: any) => void

export class Scheduler {
    protected schedules: Record<any, Schedule> = {}
    protected started = false
    protected onError?: OnError

    public constructor({onError}: SchedulerOpts = {}) {
        this.onError = onError
    }

    public isStarted() {
        return this.started
    }

    public start(abortSignal?: AbortSignal) {
        if (abortSignal?.aborted) {
            return
        }
        abortSignal?.addEventListener('abort', () => this.stop())

        if (this.started) {
            return
        }

        this.started = true

        Object.values(this.schedules).forEach(schedule => this.scheduleNext(schedule))
    }

    public getNextTriggerDate(id: any): Date | null {
        const schedule = this.schedules[id]

        if (!schedule) {
            throw new Error('Schedule not found')
        }

        return schedule.nextTriggerDate || null
    }

    public stop() {
        Object.values(this.schedules).forEach(schedule => {
            clearTimeout(schedule.nextTimeout)
            delete schedule.nextTimeout
            delete schedule.nextTriggerDate
        })
        this.started = false
    }

    public async addSchedule(addSchedule: AddScheduleOpts): Promise<void> {
        if (this.schedules[addSchedule.id]) {
            throw new Error('Schedule already exists')
        }

        const schedule = {
            ...addSchedule,
            countdown: addSchedule.limit ? addSchedule.limit : Infinity,
            schedule: cronParser.parseExpression(addSchedule.schedule, {
                iterator: true,
                currentDate: addSchedule.startDate,
                endDate: addSchedule.endDate
            })
        }

        this.schedules[addSchedule.id] = schedule

        if (this.started) {
            this.scheduleNext(schedule)
        }
    }

    protected scheduleNext(schedule: Schedule) {
        if (schedule.nextTimeout || !this.started) {
            throw new Error('Unexpected')
        }

        let { value: nextDate, done: noMore } = schedule.schedule.next()

        if (schedule.countdown === 0) {
            noMore = true
        }

        if (noMore) {
            return
        }

        schedule.nextTriggerDate = nextDate.toDate()

        schedule.nextTimeout = setTimeout(
            async () => {
                delete schedule.nextTimeout
                delete schedule.nextTriggerDate
                schedule.countdown--
                try {
                    await schedule.fn()
                } catch (e) {
                    if (!this.onError) {
                        throw e
                    }
                    this.onError(e as Error, schedule.id)
                }
                this.scheduleNext(schedule)
            },
            nextDate.getTime() - (new Date).getTime()
        )
    }
}
