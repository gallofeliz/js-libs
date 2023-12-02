import { CreateIteratorOpts, DatesIterator, createIterator, CreateMoreThanNativeDatesIteratorTime } from '@gallofeliz/dates-iterators'
import EventEmitter from 'events'

export type ScheduleOpts = CreateIteratorOpts | Array<CreateMoreThanNativeDatesIteratorTime> | string

export interface ScheduleLapInfos {
    triggerDate: Date
    abortSignal?: AbortSignal
    //countdown: number
    //callsCount: number
    //previousTriggerDate: Date | null
    //nextTriggerDate?: Date
}

export class Schedule extends EventEmitter {
    protected datesIterator: DatesIterator
    protected abortController?: AbortController
    protected started: boolean = false
    protected nextRun?: {timeout: NodeJS.Timeout, date: Date}

    public constructor(when: ScheduleOpts) {
        super()
        this.datesIterator = createIterator(
            typeof when === 'string'
                ? { times: when }
                : Array.isArray(when)
                    ? {times: when}
                    : when
        )
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
        this.emit('scheduled', {date: nextDate})

        this.nextRun = {
            timeout: setTimeout(
                () => this.run({triggerDate: nextDate}),
                nextDate.getTime() - (new Date).getTime()
            ),
            date: nextDate
        }
    }

    protected async run({triggerDate}: {triggerDate: Date}) {
        this.next(false)

        const fnInfos: ScheduleLapInfos = {
            triggerDate,
            abortSignal: this.abortController?.signal
        }

        this.emit('lap', fnInfos)
    }
}

export type ScheduleFnOpts = {
    when: ScheduleOpts
    onLap?: (lapInfos: ScheduleLapInfos) => void
} & ({
    autoStart?: false
} | {
    autoStart: true
    abortSignal?: AbortSignal
})

export function schedule(opts: ScheduleFnOpts) {
    const schedule = new Schedule(opts.when)

    if (opts.onLap) {
        schedule.on('lap', opts.onLap)
    }

    if (opts.autoStart) {
        schedule.start(opts.abortSignal)
    }

    return schedule
}

/*
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

            if (!hasGlobalErrListener && !hasByIdErrListener && !this.onError) {
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


*/
