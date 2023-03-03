# Scheduler

Simple scheduling:
- [X] Schedule cron
- [X] Get next scheduled date
- [X] Start/Stoppable
- [X] Inject exact Date to fn() and others properties
- [ ] Array schedule ?
- [ ] Schedule cron + dates + others formats
- [ ] Excludes ?
- [ ] Jitter and roundInterval (like https://github.com/influxdata/telegraf/blob/master/docs/CONFIGURATION.md)
- [ ] Run on startup (once ? Each time ?)

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
