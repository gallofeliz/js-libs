# Scheduler

This is not a tasker. To handle complex job management, see @gallofeliz/tasker

"when" uses @gallofeliz/dates-iterators

```typescript
// Simple Schedule

schedule({
    fn(infos) {
        console.log('Do job')
    },
    when: {
        times: ['PT2S'],
        limit: 5
    }
})

// Scheduler

const scheduler = new Scheduler({
    onError(error, id) {
        console.log('error on', id, error)
    }
})

scheduler.schedule({
    id: 'test1',
    fn() {
        console.log('Do job 1')
    },
    when: ['PT1S']
})

scheduler.start(abortSignal)
```
