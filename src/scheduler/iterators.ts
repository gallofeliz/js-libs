import { sortBy, findKey } from 'lodash'
import dayjs, {OpUnitType} from 'dayjs'
import cronParser from 'cron-parser'

export type DatesIteratorResult = IteratorResult<Date> //{ done: false, value: Date } | { done: true }

export interface DatesIterator {
    next: () => DatesIteratorResult
    prev: () => DatesIteratorResult
}

export class NativeDatesIterator implements DatesIterator {
    protected dates: Date[]
    protected currentI = -1
    constructor({dates}: {dates: Date[]}) {
        this.dates = sortBy(dates)
    }

    next() {
        if (this.currentI >= 0 && !this.dates[this.currentI]) {
            return {done: true} as DatesIteratorResult
        }
        this.currentI++

        if (!this.dates[this.currentI]) {
            return {done: true} as DatesIteratorResult
        }

        return {done: false, value: this.dates[this.currentI]}
    }

    prev() {
        if (this.currentI < 0) {
            return {done: true} as DatesIteratorResult
        }

        this.currentI--

        if (!this.dates[this.currentI]) {
            return {done: true} as DatesIteratorResult
        }

        return {done: false, value: this.dates[this.currentI]}
    }
}

export class IntervalDatesIterator implements DatesIterator {
    protected currentDate: Date
    protected interval: number
    protected endDate?: Date

    constructor(
        { interval, startDate, endDate, roundInterval }:
        { interval: number, startDate?: Date, endDate?: Date, roundInterval?: boolean }
    ) {
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

export class CronDatesIterator implements DatesIterator {
    protected cron

    constructor(
        {cron, startDate, endDate}:
        {cron: string, startDate?: Date, endDate?: Date}
    ) {
        this.cron = cronParser.parseExpression(cron, {
            iterator: true,
            currentDate: startDate,
            endDate: endDate
        })
    }

    next() {
        if (!this.cron.hasNext()) {
            return {done: true}  as DatesIteratorResult
        }

        const v = this.cron.next()
        return {done: false, value: v.value.toDate()}
    }

    prev() {
        if (!this.cron.hasPrev) {
            return {done: true} as DatesIteratorResult
        }

        const v = this.cron.prev()
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

        return {done: true} as DatesIteratorResult
    }

    prev() {
        return this.next()
    }
}

export class AggregateIterator implements Iterator<Date> {
    protected iterators: DatesIterator[]

    constructor({iterators}: {iterators: DatesIterator[]}) {
        this.iterators = iterators
    }

    /*
    * Alternative to avoid prev() is to keep vals and call only next() on consumed iterators
    */
    next() {
        const vals = this.iterators.map(i => i.next())

        vals.forEach((val, index) => {
            if (!val.done) {
                if (!(val.value instanceof Date) || isNaN(val.value.getTime())) {
                    throw new Error('Invalid Date from iterator n°' + index)
                }
            }
        })

        const smallestVal = sortBy(vals.filter(v => !v.done), 'value')[0]

        if (!smallestVal) {
            return {done: true} as IteratorResult<Date>
        }

        vals.forEach((val, index) => {
            if (val.done || val.value.getTime() === smallestVal.value.getTime()) {
                return
            }
            this.iterators[index].prev()
        })

        return {done: false, value: smallestVal.value}
    }
}
