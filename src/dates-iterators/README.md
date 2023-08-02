# Dates Iterators

Various iterators to iterate over dates with various logics. Next method accepts date to jump to (only to the futur). prev() has been removed, only iterate to the futur is possible.

```typescript
// The simplest

const iterator = new NativeDatesIterator({
    dates: [
        new Date('2023-09-01T19:00:00+02:00'),
        new Date('2023-08-15T00:00:00+02:00'),
        new Date('2023-09-15T12:00:00+02:00')
    ]
})

iterator.next() // {done: false, value: Date(2023-08-15T00:00:00+02:00)}
iterator.next(new Date('2023-09-05')) // {done: false, value: Date(2023-09-15T12:00:00+02:00)}
iterator.next() {done: true}

// Nexts are without call examples but still the same logic

new IntervalDatesIterator({
    interval: 1000 * 60 * 60 * 24, // Every milliseconds, like a setInterval
    roundInterval: true, // Optional
    startDate: new Date('2023-09-01T00:00:00+02:00'),
    endDate: new Date('2023-09-30T00:00:00+02:00'), // Optional
    limit: 10 // Optional
})

new IntervalDatesIterator({
    interval: 'P1M1W', // Every 1 Month, 1 Week. For example 2023-01-01T12:00:00 -> 2023-02-01T12:00:00 for P1M.
    // Same options than above
})

new IntervalDatesIterator({
    interval: { months: 1, weeks: 1 }, // equiv to above
    // Same options than above
})

new CronDatesIterator({
    cron: '0 17 */7 * *', // You know it. Last supplement is for seconds (optional)
    startDate: new Date('2023-09-01T00:00:00+02:00'),
    endDate: new Date('2023-09-30T00:00:00+02:00'), // Optional
    limit: 10 // Optional
})

new AggregateIterator({
    iterators: [
        new CronDatesIterator(...),
        new NativeDatesIterator(...),
        ...
    ],
    limit: 10 // Optional
})

// You also can iterate with for or convert to Array, but take care to Infinity generations (each minute for example without limit nor endDate)

for (const date of new XxIterator(...)) {
    console.log(date)
}

// Bad idea without limit or endDate (except for NativeDatesIterator) or for big iterations (memory)
console.log(...new XxIterator(...))
```

The AggregateIterator allows you to iterate over dates mixing various logics, for example you want each day more specifics days. No limitations with the mix ...
