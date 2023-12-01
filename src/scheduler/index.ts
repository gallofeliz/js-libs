import { CreateIteratorOpts, DatesIterator, createIterator, CreateMoreThanNativeDatesIteratorTime } from '@gallofeliz/dates-iterators'
import EventEmitter from 'events'

export interface ScheduleOpts {
    fn: (infos: ScheduleFnInfos) => void | Promise<void>
    // abortSignal
    when: CreateIteratorOpts | Array<CreateMoreThanNativeDatesIteratorTime> | string
    allowMultipleRuns?: boolean
    abortFnCallsOnAbort?: boolean
    uidGenerator?: () => string
}

export interface ScheduleFnInfos {
    triggerDate: Date
    abortSignal?: AbortSignal
    uid: string
    //countdown: number
    //callsCount: number
    //previousTriggerDate: Date | null
    //nextTriggerDate?: Date
}

export class Schedule extends EventEmitter {
    protected fn: ScheduleOpts['fn']
    protected allowMultiple: boolean
    protected datesIterator: DatesIterator
    protected fnRunning: boolean = false
    protected abortController?: AbortController
    protected abortFnCallsOnAbort?: boolean
    protected started: boolean = false
    protected nextRun?: {timeout: NodeJS.Timeout, date: Date, uid: string}
    protected uidGenerator: () => string

    public constructor(opts: ScheduleOpts) {
        super()
        this.datesIterator = createIterator(
            typeof opts.when === 'string'
                ? { times: opts.when }
                : Array.isArray(opts.when)
                    ? {times: opts.when}
                    : opts.when
        )
        this.fn = opts.fn
        this.abortFnCallsOnAbort = opts.abortFnCallsOnAbort
        this.allowMultiple = opts.allowMultipleRuns ?? false
        this.uidGenerator = opts.uidGenerator || (() => Math.random().toString())
    }

    public isStarted() {
        return this.started
    }

    public getNextTriggerDate(): Date | null {
        return this.nextRun?.date || null
    }

    public start(abortSignal?: AbortSignal) {
        if (this.started) {
            if (abortSignal) {
                throw new Error('Already started')
            }
            return
        }

        if (abortSignal?.aborted) {
            return
        }

        this.emit('start')
        this.started = true

        const abortController = this.abortController = new AbortController

        abortSignal?.addEventListener('abort', () => abortController.abort(abortSignal.reason))

        abortController.signal.addEventListener('abort', () => this.abort())

        this.next(true)
    }

    public stop() {
        this.abortController?.abort()
    }

    protected abort() {
        this.emit('stop')
        clearTimeout(this.nextRun?.timeout)
        this.started = false
        delete this.nextRun
        this.emit('ended')
    }

    protected next(jump: boolean) {
        const next = this.datesIterator.next(jump ? new Date : undefined)

        if (next.done) {
            delete this.nextRun
            this.emit('over')
            this.stop()
            return
        }

        const nextDate = next.value
        const nextUid = this.uidGenerator()
        this.emit('scheduled', {date: nextDate, uid: nextUid})

        this.nextRun = {
            timeout: setTimeout(
                () => this.runFn({triggerDate: nextDate, uid: nextUid}),
                nextDate.getTime() - (new Date).getTime()
            ),
            date: nextDate,
            uid: nextUid
        }
    }

    protected async runFn({triggerDate, uid}: {triggerDate: Date, uid: string}) {
        if (this.fnRunning && !this.allowMultiple) {
            return
        }

        this.next(false)

        const fnInfos = {
            triggerDate,
            abortSignal: this.abortFnCallsOnAbort ? this.abortController?.signal : undefined,
            uid
        }

        try {
            this.emit('fn.start', {uid})
            await this.fn(fnInfos)
            this.emit('fn.done', {uid})
        } catch (error) {
            if (!this.emit('fn.error', {error, uid})) {
                this.emit('error', new Error('Unhandled fn error on '+uid+' : ' + (error as Error).toString()))
            }
        }
    }
}

type ScheduleId = string

type ScheduleFnOptsSimple = ScheduleOpts & {abortSignal?: AbortSignal}
type ScheduleFnOptsMulti = Omit<SchedulerOpts, 'schedules'> & {schedules: SchedulerOpts['schedules']} & {abortSignal?: AbortSignal}

function isMulti(opts: ScheduleFnOptsSimple | ScheduleFnOptsMulti): opts is ScheduleFnOptsMulti {
    return (opts as ScheduleFnOptsMulti).schedules !== undefined
}

export function schedule(opts: ScheduleFnOptsSimple): Schedule
export function schedule(opts: ScheduleFnOptsMulti): Scheduler

export function schedule(opts: ScheduleFnOptsSimple | ScheduleFnOptsMulti) {
    if (isMulti(opts)) {
        const scheduler = new Scheduler(opts)

        scheduler.start(opts.abortSignal)

        return scheduler
    }

    const schedule = new Schedule(opts)

    schedule.start(opts.abortSignal)

    return schedule
}

interface SchedulerOpts {
    schedules?: Record<ScheduleId, ScheduleOpts>
    onError?: ({error, id, uid} : {error: Error, id: ScheduleId, uid: string}) => void
}

export class Scheduler extends EventEmitter {
    protected schedules: Record<ScheduleId, Schedule> = {}
    protected started: boolean = false
    protected abortController?: AbortController
    protected onError?: SchedulerOpts['onError']

    public constructor(opts: SchedulerOpts = {}) {
        super()
        Object.keys(opts.schedules || {})
            .forEach(schedId => this.schedule({id: schedId, ...opts.schedules![schedId]}))

        this.onError = opts.onError
    }

    public schedule({id, ...opts}: ScheduleOpts & { id: ScheduleId }) {
        if(this.has(id)) {
            throw new Error('Schedule already exists')
        }

        this.schedules[id] = new Schedule(opts)
        this.emit('schedule', {id})

        this.attachEvents(id)

        if (this.started) {
            this.schedules[id].start(this.abortController!.signal)
        }
    }

    protected attachEvents(id: ScheduleId) {
        const sched = this.get(id)

        sched.on('start', () => {
            this.emit('schedule.start', {id})
            this.emit('schedule['+id+'].start')
        })

        sched.on('stop', () => {
            this.emit('schedule.stop', {id})
            this.emit('schedule['+id+'].stop')
        })

        sched.on('over', () => {
            this.emit('schedule.over', {id})
            this.emit('schedule['+id+'].over')
        })

        sched.on('fn.start', ({uid}) => {
            this.emit('schedule.fn.start', {id, uid})
            this.emit('schedule['+id+'].fn.start', {uid})
        })

        sched.on('fn.done', ({uid}) => {
            this.emit('schedule.fn.done', {id, uid})
            this.emit('schedule['+id+'].fn.done', {uid})
        })

        sched.on('fn.error', ({error, uid}) => {
            const hasGlobalErrListener = this.emit('schedule.fn.error', {id, error, uid})
            const hasByIdErrListener = this.emit('schedule['+id+'].fn.error', {error, uid})

            this.onError && this.on('schedule.error', ({error, id}) => this.onError!({error, id, uid}))

            if (!hasGlobalErrListener && !hasByIdErrListener && /*!sched.hasErrorHandler() &&*/ !this.onError) {
                throw error
            }
        })

        // todo remove events ? #see https://nodejs.org/api/events.html#eventsonemitter-eventname-options
        // AbortSignal to remove event listener (cool !)
    }

    protected has(id: ScheduleId) {
        return this.schedules[id] !== undefined
    }

    protected get(id: ScheduleId) {
        const sched = this.schedules[id]

        if (!sched) {
            throw new Error('Schedule not found')
        }

        return sched
    }

    public list() {
        return Object.keys(this.schedules)
    }

    public unschedule(id: ScheduleId) {
        this.get(id).stop()
        this.emit('unschedule', {id})
        delete this.schedules[id]
    }

    public getNextTriggerDate(id: ScheduleId): Date | null {
        return this.get(id).getNextTriggerDate()
    }

    public isStarted() {
        return this.started
    }

    public start(abortSignal?: AbortSignal) {
        if (this.started) {
            if (abortSignal) {
                throw new Error('Already started')
            }
            return
        }

        if (abortSignal?.aborted) {
            return
        }

        const abortController = new AbortController
        this.started = true
        this.emit('start')
        this.abortController = abortController

        abortSignal?.addEventListener('abort', () => {
            abortController.abort(abortSignal.reason)
        })

        abortController.signal.addEventListener('abort', () => {
            this.emit('stop')
            this.started = false
        })

        Object.values(this.schedules).forEach(sched => sched.start(abortController.signal))
    }

    public stop() {
        this.abortController?.abort()
    }
}









/*
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
    abortSignal?: AbortSignal
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
    protected abortSignal?: AbortSignal

    public constructor({onError, logger}: SchedulerOpts) {
        this.onError = onError
        this.logger = logger/*.child({
            schedulerUuid: uuid()
        })*-/
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
        this.abortSignal = abortSignal
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
        delete this.abortSignal
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
                    previousTriggerDate: schedule.previousTriggerDate,
                    abortSignal: this.abortSignal
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
*/