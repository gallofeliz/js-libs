import { AggregateIterator, CronDatesIterator, IntervalDatesIterator, NativeDatesIterator } from "./iterators";

function a() {
    const it = new IntervalDatesIterator({
        interval: 'P1M',
        roundInterval: true,
        startDate: new Date('2023-09-01T00:00:00+02:00'),
        endDate: new Date('2024-09-30T00:00:00+02:00'),
    })
    let iteration = it.next()
    let changeCountdown = 5

    while(!iteration.done) {
        console.log(iteration)
        iteration = it.next(changeCountdown-- === 0 ? new Date('2024-06-15T00:00:00+02:00') : undefined)
    }
}

a()

console.log('')

function b() {
    const it = new AggregateIterator({
        iterators: [
            new NativeDatesIterator({
                dates: [
                    new Date('2023-09-02T00:00:00+02:00'),
                    new Date('2023-08-15T00:00:00+02:00'),
                    new Date('2023-09-15T12:00:00+02:00')
                ]
            }),
            new NativeDatesIterator({
                dates: [
                    new Date('2023-09-02T00:00:00+02:00'),
                    new Date('2023-09-25T12:00:00+02:00'),
                    new Date('2023-09-17T00:00:00+02:00')
                ]
            }),
            new IntervalDatesIterator({
                interval: 1000 * 60 * 60 * 24,
                roundInterval: true,

                startDate: new Date('2023-09-01T00:00:00+02:00'),
                endDate: new Date('2023-09-30T00:00:00+02:00'),
            }),
            new CronDatesIterator({
                cron: '0 17 */7 * *',
                startDate: new Date('2023-09-01T00:00:00+02:00'),
                endDate: new Date('2023-09-30T00:00:00+02:00')
            })
        ],
        limit: 30
    })

    let iteration = it.next()
    let changeCountdown = 5

    while(!iteration.done) {
        console.log(iteration)
        iteration = it.next(changeCountdown-- === 0 ? new Date('2023-09-10T07:00:00+02:00') : undefined)
    }
}

b()
