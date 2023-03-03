# Scheduler

Simple scheduling

```typescript
import { Scheduler } from '@gallofeliz/scheduler'

const scheduler = new Scheduler({
    onError(error, scheduleId) { logger.error('Big error on ' + scheduleId, {error}) }
})

const triggers: Date[] = []

scheduler.addSchedule({
    id: 'mySchedule',
    fn() {
        triggers.push(new Date)
    },
    schedule: '*/2 * * * * *',
    limit: 42
})

scheduler.start() // handle AbortSignal and stop() method

console.log('Schedule next', scheduler.getNextTriggerDate('mySchedule'))
```
