import { AggregateIterator, CronDatesIterator, IntervalDatesIterator, NativeDatesIterator, NowOnlyIterator } from "./iterators";

const nativeDatesIterator = new NativeDatesIterator({
    dates: [
        new Date('2023-09-02T00:00:00+02:00'),
        new Date('2023-08-15T00:00:00+02:00'),
        new Date('2023-09-15T12:00:00+02:00')
    ]
})

const nativeDatesIterator2 = new NativeDatesIterator({
    dates: [
        new Date('2023-09-02T00:00:00+02:00'),
        new Date('2023-09-25T12:00:00+02:00'),
        new Date('2023-09-17T00:00:00+02:00')
    ]
})

const intervalDatesIterator = new IntervalDatesIterator({
    interval: 1000 * 60 * 60 * 24,
    roundInterval: true,

    startDate: new Date('2023-09-01T00:00:00+02:00'),
    endDate: new Date('2023-09-30T00:00:00+02:00'),
})

const cronDatesIterator = new CronDatesIterator({
    cron: '0 17 */7 * *',
    startDate: new Date('2023-09-01T00:00:00+02:00'),
    endDate: new Date('2023-09-30T00:00:00+02:00')
})

const nowOnlyIterator = new NowOnlyIterator

const it = new AggregateIterator({iterators: [
    nativeDatesIterator,
    nativeDatesIterator2,
    intervalDatesIterator,
    cronDatesIterator,
    nowOnlyIterator
]})

let iteration = it.next()

while(!iteration.done) {
    console.log(iteration)
    iteration = it.next()
}

