import { sortBy, findKey, findLastIndex, groupBy, map, flatten, reduce } from 'lodash'
import dayjs, {OpUnitType} from 'dayjs'
import { parse, toMilliseconds, apply, negate } from 'duration-fns'
import cronParser from 'cron-parser'

export type DatesIterator = Iterator<Date, unknown, Date | undefined> & {
    [Symbol.iterator](): IterableIterator<Date>
}

interface CreateNativeDatesIteratorOpts {
    times: Array<Date>
}

interface CreateMoreThanNativeDatesIteratorOpts {
    times: Array<Date | Interval | string>
    startDate: Date
    endDate?: Date
    limit?: number
    roundInterval?: boolean
    excludedTimes?: Array<Date | Interval | string>
}

export type CreateIteratorOpts = CreateNativeDatesIteratorOpts | CreateMoreThanNativeDatesIteratorOpts

function groupByIteratorTypesForCreate(list: any[]): Record<'nativeDate' | 'interval' | 'cron', any[]> {
    return groupBy(list, (value) => {
        if (value instanceof Date) {
            return 'nativeDate'
        }
        if (
            (typeof value === 'object' && value !== null)
            || (typeof value === 'number')
            || (typeof value === 'string' && value.substring(0, 1) === 'P')
        ) {
            return 'interval'
        }
        return 'cron'
    }) as Record<'nativeDate' | 'interval' | 'cron', any[]>
}

function groupIteratorTypesToIterators(opts: CreateIteratorOpts & {group: Record<'nativeDate' | 'interval' | 'cron', any[]>}
): DatesIterator[] {
    return flatten(map(opts.group, (times, iteratorType) => {
        switch(iteratorType) {
            case 'nativeDate':
                return new NativeDatesIterator({dates: times})
            case 'interval':
                return (times as any).map((time: any) => new IntervalDatesIterator({...opts as CreateMoreThanNativeDatesIteratorOpts, interval: time as any}))
            case 'cron':
                return (times as any).map((time: any) => new CronDatesIterator({...opts as CreateMoreThanNativeDatesIteratorOpts, cron: time as any}))
            default:
                throw new Error('Invalid type')
        }
    }))
}

// Build complex iterator from simple config
export function createIterator(opts: CreateIteratorOpts): DatesIterator {
    const timesGroups = groupByIteratorTypesForCreate(opts.times)
    const excludeTimesGroups = (opts as CreateMoreThanNativeDatesIteratorOpts).excludedTimes
        ? groupByIteratorTypesForCreate((opts as CreateMoreThanNativeDatesIteratorOpts).excludedTimes as any)
        : null
    const needAggregateIterator = Object.keys(timesGroups).length > 1 || excludeTimesGroups || reduce(timesGroups, (needAggregateIterator: boolean, times, iteratorType) => {
        if(needAggregateIterator) {
            return needAggregateIterator
        }
        if (iteratorType === 'nativeDate') {
            return false
        }
        if (times.length > 1) {
            return true
        }
        return false
    }, false)

    // TODO ? Filter native dates depending of endDate ?

    const timesIterators = groupIteratorTypesToIterators({
        ...opts,
        group: timesGroups,
        limit: needAggregateIterator ? undefined : (opts as CreateMoreThanNativeDatesIteratorOpts).limit
    })

    const excludeTimesIterators = excludeTimesGroups ? groupIteratorTypesToIterators({
        ...opts,
        group: excludeTimesGroups,
        limit: undefined
    }) : []

    return needAggregateIterator
        ? new AggregateIterator({
            iterators: timesIterators,
            excludeIterators: excludeTimesIterators,
            limit: (opts as CreateMoreThanNativeDatesIteratorOpts).limit
        })
        : timesIterators[0]
}

// export class NowIterator implements DatesIterator {
//     protected countDown: number

//     constructor({limit}: {limit: number}) {
//         this.countDown = limit || Infinity
//     }

//     [Symbol.iterator]() {
//         return this
//     }

//     next() {
//         if (this.countDown === 0) {
//             return {done: true} as IteratorResult<Date>
//         }

//         this.countDown--

//         return {done: false, value: new Date}
//     }
// }

export class NativeDatesIterator implements DatesIterator {
    protected dates: Date[]
    protected currentI = -1

    constructor({dates}: {dates: Date[]}) {
        this.dates = sortBy(dates)
    }

    [Symbol.iterator]() {
        return this
    }

    next(date?: Date) {
        if (this.currentI >= 0 && !this.dates[this.currentI]) {
            return {done: true} as IteratorResult<Date>
        }

        if (date && date > this.dates[this.currentI]) {
            const foundIndex = findLastIndex(this.dates, ourDate => ourDate > date)
            this.currentI = foundIndex !== -1 ? foundIndex : this.dates.length
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
    protected roundInterval: boolean

    constructor(
        { interval, startDate, endDate, roundInterval, limit }:
        { interval: Interval, startDate: Date, endDate?: Date, roundInterval?: boolean, limit?: number }
    ) {
        this.countDown = limit || Infinity
        this.roundInterval = roundInterval ?? false

        if (typeof interval === 'string') {
            this.interval = parse(interval)
        } else if (typeof interval === 'number') {
            this.interval = { milliseconds: interval }
        } else {
            this.interval = interval
        }

        this.currentDate = this.computeCurrentDate(startDate)

        this.endDate = endDate
    }

    protected computeCurrentDate(date: Date) {
        let currentDate = date

        if (this.roundInterval) {
            const startOf:OpUnitType|undefined = findKey({
                'month': 1000*60*60*24*30,
                'week': 1000*60*60*24*7,
                'day': 1000*60*60*24,
                'hour': 1000*60*60,
                'minute': 1000*60,
                'second': 1000
            }, (v) => toMilliseconds(this.interval) >= v) as OpUnitType|undefined

            if (startOf) {
                currentDate = dayjs(currentDate).startOf(startOf).toDate()
            }
        }

        if (date.getTime() === currentDate.getTime()) {
            currentDate = apply(currentDate.getTime(), negate(this.interval))
        }

        return currentDate
    }

    [Symbol.iterator]() {
        return this
    }

    next(date?: Date) {
        if (this.countDown === 0) {
            return {done: true} as IteratorResult<Date>
        }

        if (date && date > this.currentDate) {
            this.currentDate = this.computeCurrentDate(date)
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
    protected endDate?: Date
    protected expression: string
    protected lastVal?: Date

    constructor(
        {cron, startDate, endDate, limit}:
        {cron: string, startDate: Date, endDate?: Date, limit?: number}
    ) {
        this.endDate = endDate
        this.expression = cron
        this.cron = this.computeCron(startDate)
        this.countDown = limit || Infinity
    }

    computeCron(date: Date) {
        return cronParser.parseExpression(this.expression, {
            iterator: true,
            // To avoid accidents, we can handle endDate ourself
            currentDate: this.endDate ? (date > this.endDate ? this.endDate : date) : date,
            endDate: this.endDate
        })
    }

    [Symbol.iterator]() {
        return this
    }

    next(date?: Date) {
        if (this.countDown === 0) {
            return {done: true} as IteratorResult<Date>
        }

        if (date && (!this.lastVal || date > this.lastVal)) {
            this.cron = this.computeCron(date)
        }

        if (!this.cron.hasNext()) {
            return {done: true} as IteratorResult<Date>
        }

        const v = this.cron.next()
        this.countDown--
        this.lastVal = v.value.toDate()
        return {done: false, value: this.lastVal}
    }
}

export class SimpleAggregateIterator implements DatesIterator {
    protected iterators: DatesIterator[]
    protected state: IteratorResult<Date>[] = []
    protected countDown: number

    constructor({iterators, limit}: {iterators: DatesIterator[], limit?: number}) {
        this.iterators = iterators
        this.countDown = limit || Infinity
    }

    [Symbol.iterator]() {
        return this
    }

    next(date?: Date) {
        if (this.countDown === 0) {
            return {done: true} as IteratorResult<Date>
        }

        if (this.state.length === 0) {
            this.state = this.iterators.map(it => it.next(date))
        } else if (date) {
            this.state.forEach((val, index) => {
                if (val.done) {
                    return
                }
                if (val.value < date) {
                    this.state[index] = this.iterators[index].next(date)
                }
            })
        }

        this.state.forEach((val, index) => {
            if (val.done) {
                return
            }
            if (!(val.value instanceof Date) || isNaN(val.value.getTime())) {
                throw new Error('Invalid Date from iterator n°' + index)
            }
        })

        const smallestVal = sortBy(this.state.filter(v => !v.done), 'value')[0]

        if (!smallestVal) {
            return {done: true} as IteratorResult<Date>
        }

        const smallestDate = smallestVal.value

        this.state.forEach((val, index) => {
            if (val.done || val.value.getTime() > smallestDate.getTime()) {
                return
            }

            this.state[index] = this.iterators[index].next()
        })

        this.countDown--

        return {done: false, value: smallestDate}
    }
}

export class ExcludableAggregateIterator implements DatesIterator {
    protected aggregateIterators: SimpleAggregateIterator
    protected excludeAggregateIterators: SimpleAggregateIterator
    protected countDown: number
    protected currentExcludeValue?: IteratorResult<Date>

    constructor(
        {iterators, limit, excludeIterators}:
        {iterators: DatesIterator[], excludeIterators?: DatesIterator[], limit?: number}
    ) {
        this.aggregateIterators = new SimpleAggregateIterator({iterators: iterators})
        this.excludeAggregateIterators = new SimpleAggregateIterator({iterators: excludeIterators || []})
        this.countDown = limit || Infinity
    }

    [Symbol.iterator]() {
        return this
    }

    next(date?: Date): IteratorResult<Date> {
        if (this.countDown === 0) {
            return {done: true} as IteratorResult<Date>
        }

        const value = this.aggregateIterators.next(date)

        if (value.done) {
            return value
        }

        if (!this.currentExcludeValue) {
            this.currentExcludeValue = this.excludeAggregateIterators.next(date)
        } else if (date) {
            if (!this.currentExcludeValue.done && this.currentExcludeValue.value < date) {
                this.currentExcludeValue = this.excludeAggregateIterators.next(date)
            }
        }

        while (!this.currentExcludeValue!.done && this.currentExcludeValue!.value < value.value) {
            this.currentExcludeValue = this.excludeAggregateIterators.next()
        }

        if (!this.currentExcludeValue!.done && this.currentExcludeValue!.value.getTime() === value.value.getTime()) {
            return this.next()
        }

        this.countDown--

        return value
    }
}


export const AggregateIterator = ExcludableAggregateIterator
