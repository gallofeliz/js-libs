import { UniversalLogger } from '@gallofeliz/logger'
import cronParser, { CronDate } from 'cron-parser'
import dayjs, {OpUnitType} from 'dayjs'
import {findKey} from 'lodash'
import { v4 as uuid } from 'uuid'

export interface ScheduleFnArg {
    scheduleId: any
    triggerDate: Date
    countdown: number
    callsCount: number
    previousTriggerDate: Date | null
    nextTriggerDate?: Date
    //logger: UniversalLogger
}

export interface AddScheduleOpts {
    id: any
    fn: (arg: ScheduleFnArg) => void | Promise<void>
    schedule: string | number | Date[] // string[] with ! prefix for exclusion ?
    runOnStart?: boolean // Should in previous schedule array ; diferenciate first start than resumes ?
    roundInterval?: boolean
    jitter?: number
    startDate?: Date
    endDate?: Date
    limit?: number
    autoRemove?: boolean
    allowMultipleRuns?: boolean
}

export interface Schedule extends AddScheduleOpts {
    scheduleObjs?: ScheduleProvider<Date | CronDate>
    nextTimeout?: NodeJS.Timeout
    nextTriggerDate?: Date
    countdown: number
    callsCount: number
    previousTriggerDate: Date | null
}

export interface SchedulerOpts {
    onError?: OnError
    logger: UniversalLogger
}

export type OnError = (error: Error, scheduleId: any) => void

interface ScheduleProvider<T> {
    next: () => IteratorResult<T, T>
    prev: () => IteratorResult<T, T>
}

class DatesProvider implements ScheduleProvider<Date> {
    protected dates: Date[]
    protected currentI = -1
    constructor({dates, startDate, endDate}: {dates: Date[], startDate?: Date, endDate?: Date}) {
        const currentDate = startDate || new Date
        this.dates = dates.filter(date => date >= currentDate && (!endDate || date <= endDate)).sort()
    }

    next() {
        if (this.currentI >= 0 && !this.dates[this.currentI]) {
            return {done: true, value: null as unknown as Date}
        }
        this.currentI++

        if (!this.dates[this.currentI]) {
            return {done: true, value: null as unknown as Date}
        }

        return {done: false, value: this.dates[this.currentI]}
    }

    prev() {
        if (this.currentI < 0) {
            return {done: true, value: null as unknown as Date}
        }

        this.currentI--

        if (!this.dates[this.currentI]) {
            return {done: true, value: null as unknown as Date}
        }

        return {done: false, value: this.dates[this.currentI]}
    }
}

class IntervalProvider implements ScheduleProvider<Date> {
    protected currentDate: Date
    protected interval: number
    protected endDate?: Date

    constructor({ interval, startDate, endDate, roundInterval }: { interval: number, startDate?: Date, endDate?: Date, roundInterval?: boolean }) {
        this.currentDate = startDate || new Date

        if (roundInterval) {
            const startOf:OpUnitType|undefined = findKey({
                'day': 1000*60*60*24,
                'hour': 1000*60*60,
                'minute': 1000*60,
                'second': 1000
            }, (v) => interval >= v) as OpUnitType|undefined

            if (startOf) {
                this.currentDate = dayjs(this.currentDate).startOf(startOf).toDate()
            }
        }

        if (startDate && startDate.getTime() === this.currentDate.getTime()) {
            this.currentDate = new Date(this.currentDate.getTime() - interval)
        }

        this.interval = interval
        this.endDate = endDate
    }
    next() {
        const next = new Date(this.currentDate.getTime() + this.interval)
        if (this.endDate && next > this.endDate) {
            return {done:true, value: next}
        }
        this.currentDate = next
        return {done:false, value: next}
    }
    prev() {
        const prev = new Date(this.currentDate.getTime() - this.interval)
        this.currentDate = prev
        return {done:false, value: prev}
    }
}

export class Scheduler {
    protected schedules: Record<any, Schedule> = {}
    protected started = false
    protected onError?: OnError
    protected logger: UniversalLogger

    public constructor({onError, logger}: SchedulerOpts) {
        this.onError = onError
        this.logger = logger/*.child({
            schedulerUuid: uuid()
        })*/
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
        this.logger.info('Starting scheduler')

        Object.values(this.schedules).forEach(schedule => {
            if (typeof schedule.schedule === 'number') {
                schedule.scheduleObjs = new IntervalProvider({
                    interval: schedule.schedule,
                    startDate: schedule.startDate,
                    endDate: schedule.endDate,
                    roundInterval: schedule.roundInterval ?? true
                })
            } else if (Array.isArray(schedule.schedule)) {
                schedule.scheduleObjs = new DatesProvider({
                    dates: schedule.schedule,
                    startDate: schedule.startDate,
                    endDate: schedule.endDate
                })
            } else {
                schedule.scheduleObjs = cronParser.parseExpression(schedule.schedule, {
                    iterator: true,
                    currentDate: schedule.startDate
                        ? (schedule.startDate > new Date ? schedule.startDate : new Date)
                        : undefined,
                    endDate: schedule.endDate
                })
            }

            this.scheduleNext(schedule, true)
        })
    }

    public getNextTriggerDate(id: any): Date | null {
        const schedule = this.schedules[id]

        if (!schedule) {
            throw new Error('Schedule not found')
        }

        return schedule.nextTriggerDate || null
    }

    public stop() {
        if (!this.started) {
            return
        }

        this.logger.info('Stopping scheduler')

        Object.values(this.schedules).forEach(schedule => {
            clearTimeout(schedule.nextTimeout)
            delete schedule.nextTimeout
            delete schedule.nextTriggerDate
            delete schedule.scheduleObjs
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
            callsCount: 0,
            previousTriggerDate: null
        }

        this.schedules[addSchedule.id] = schedule

        this.logger.info('Adding schedule', { scheduleId: addSchedule.id })

        if (this.started) {
            this.scheduleNext(schedule)
        }
    }

    public removeSchedule(id: any): void {
        if (!this.schedules[id]) {
            throw new Error('Schedule does not exist')
        }

        this.logger.info('Removing schedule', { scheduleId: id })

        clearTimeout(this.schedules[id].nextTimeout)

        delete this.schedules[id]
    }

    protected scheduleNext(schedule: Schedule, isStart: boolean = false) {
        if (schedule.nextTimeout || !this.started || !schedule.scheduleObjs) {
            throw new Error('Unexpected')
        }

        let { value: nextDate, done: noMore } =
            isStart && schedule.runOnStart
            ? { value: new Date, done: false }
            : schedule.scheduleObjs.next()

        if (schedule.countdown === 0) {
            noMore = true
        }

        if (noMore) {
            this.logger.info('Schedule no more', { scheduleId: schedule.id })

            if (schedule.autoRemove) {
                this.removeSchedule(schedule.id)
            }
            return
        }

        schedule.nextTriggerDate = nextDate instanceof Date ? nextDate : nextDate.toDate()

        const timeoutMs = Math.max(
            (schedule.jitter ? Math.round(Math.random() * schedule.jitter * 2 - schedule.jitter) : 0)
            + nextDate.getTime() - (new Date).getTime(),
            0
        )

        this.logger.info('Schedule computed scheduled run', { scheduleId: schedule.id, scheduledDate: schedule.nextTriggerDate })

        schedule.nextTimeout = setTimeout(
            async () => {
                const runLogger = this.logger.child({ scheduleId: schedule.id, scheduleRunUuid: uuid() })
                schedule.countdown--
                schedule.callsCount++
                const arg: ScheduleFnArg = {
                    scheduleId: schedule.id,
                    triggerDate: schedule.nextTriggerDate as Date,
                    countdown: schedule.countdown,
                    callsCount: schedule.callsCount,
                    previousTriggerDate: schedule.previousTriggerDate
                    //logger: runLogger
                }
                delete schedule.nextTimeout
                schedule.previousTriggerDate = schedule.nextTriggerDate as Date
                delete schedule.nextTriggerDate
                runLogger.info('Running schedule', { scheduleRunStatus: 'running' })

                if (schedule.allowMultipleRuns) {
                    this.scheduleNext(schedule)
                    arg.nextTriggerDate = schedule.nextTriggerDate
                }

                try {
                    await schedule.fn(arg)
                    runLogger.info('Schedule run done', { scheduleRunStatus: 'done' })
                } catch (e) {
                    if (this.onError) {
                        runLogger.info('Schedule run failed', { scheduleRunStatus: 'failed' })
                        try {
                            this.onError(e as Error, schedule.id)
                        } catch (error) {
                            this.logger.error('onError callback emitted error', {error})
                        }
                    } else {
                        runLogger.error('Schedule run failed', { scheduleRunStatus: 'failed', error: e })
                        // TODO throw error to avoid false working code
                    }
                }
                if (!schedule.allowMultipleRuns) {
                    this.scheduleNext(schedule)
                }
            },
            timeoutMs
        )
    }
}
