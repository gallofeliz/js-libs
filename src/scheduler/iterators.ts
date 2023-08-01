import { sortBy, findKey } from 'lodash'
import dayjs, {OpUnitType} from 'dayjs'
import { parse, toMilliseconds, apply, negate } from 'duration-fns'
import cronParser from 'cron-parser'

export type DatesIterator = Iterator<Date>

export class NativeDatesIterator implements DatesIterator {
    protected dates: Date[]
    protected currentI = -1
    constructor({dates}: {dates: Date[]}) {
        this.dates = sortBy(dates)
    }

    next() {
        if (this.currentI >= 0 && !this.dates[this.currentI]) {
            return {done: true} as IteratorResult<Date>
        }
        this.currentI++

        if (!this.dates[this.currentI]) {
            return {done: true} as IteratorResult<Date>
        }

        return {done: false, value: this.dates[this.currentI]}
    }
}

export interface ObjInterval {
    years?: number
    months?: number
    weeks?: number
    days?: number
    hours?: number
    minutes?: number
    seconds?: number
    milliseconds?: number
}

export type Interval = ObjInterval | string | number

export class IntervalDatesIterator implements DatesIterator {
    protected currentDate: Date
    protected interval: ObjInterval
    protected endDate?: Date
    protected countDown: number

    constructor(
        { interval, startDate, endDate, roundInterval, limit }:
        { interval: Interval, startDate?: Date, endDate?: Date, roundInterval?: boolean, limit?: number }
    ) {
        this.countDown = limit || Infinity
        this.currentDate = startDate || new Date

        if (typeof interval === 'string') {
            this.interval = parse(interval)
        } else if (typeof interval === 'number') {
            this.interval = { milliseconds: interval }
        } else {
            this.interval = interval
        }

        if (roundInterval) {
            const startOf:OpUnitType|undefined = findKey({
                'day': 1000*60*60*24,
                'hour': 1000*60*60,
                'minute': 1000*60,
                'second': 1000
            }, (v) => toMilliseconds(this.interval) >= v) as OpUnitType|undefined

            if (startOf) {
                this.currentDate = dayjs(this.currentDate).startOf(startOf).toDate()
            }
        }

        if (startDate && startDate.getTime() === this.currentDate.getTime()) {
            this.currentDate = apply(this.currentDate.getTime(), negate(this.interval))
        }

        this.endDate = endDate
    }
    next() {
        if (this.countDown === 0) {
            return {done: true} as IteratorResult<Date>
        }

        const next = apply(this.currentDate.getTime(), this.interval)
        if (this.endDate && next > this.endDate) {
            return {done:true} as IteratorResult<Date>
        }
        this.currentDate = next
        this.countDown--
        return {done:false, value: next}
    }
}

export class CronDatesIterator implements DatesIterator {
    protected cron
    protected countDown: number

    constructor(
        {cron, startDate, endDate, limit}:
        {cron: string, startDate?: Date, endDate?: Date, limit?: number}
    ) {
        this.cron = cronParser.parseExpression(cron, {
            iterator: true,
            currentDate: startDate,
            endDate: endDate
        })

        this.countDown = limit || Infinity
    }

    next() {
        if (this.countDown === 0 || !this.cron.hasNext()) {
            return {done: true} as IteratorResult<Date>
        }

        const v = this.cron.next()
        this.countDown--
        return {done: false, value: v.value.toDate()}
    }
}

export class NowOnlyIterator implements DatesIterator {
    protected done = false

    next() {
        if (!this.done) {
            this.done = true
            return {done: false, value: new Date}
        }

        return {done: true} as IteratorResult<Date>
    }

    prev() {
        return this.next()
    }
}

export class AggregateIterator implements Iterator<Date> {
    protected iterators: DatesIterator[]
    protected state: IteratorResult<Date>[] = []
    protected countDown: number

    constructor({iterators, limit}: {iterators: DatesIterator[], limit?: number}) {
        this.iterators = iterators
        this.countDown = limit || Infinity
    }

    next() {
        if (this.countDown === 0) {
            return {done: true} as IteratorResult<Date>
        }
        if (this.state.length === 0) {
            this.state = this.iterators.map(it => it.next())
        }

        this.state.forEach((val, index) => {
            if (!val.done) {
                if (!(val.value instanceof Date) || isNaN(val.value.getTime())) {
                    throw new Error('Invalid Date from iterator n°' + index)
                }
            }
        })

        const smallestVal = sortBy(this.state.filter(v => !v.done), 'value')[0]

        if (!smallestVal) {
            return {done: true} as IteratorResult<Date>
        }

        const date = smallestVal.value

        this.state.forEach((val, index) => {
            if (val.done || val.value.getTime() > date.getTime()) {
                return
            }

            this.state[index] = this.iterators[index].next()
        })

        this.countDown--

        return {done: false, value: date}
    }
}
