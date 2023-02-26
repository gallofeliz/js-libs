# Timer

Timer component:
- [X] Start/stoppable
- [X] Fn callback
- [X] resetable (the counter)
- [X] Max delay
- [X] Abortable
- [ ] Error handling (callback/log/event)
- [ ] Events

```typescript
import { Timer } from '@gallofeliz/timer'

const timer = new Timer({
    fn() {
        console.log('Do the job !')
    },
    delay: 100,
    maxDelayUntilStop: 250
})

const abortController = new AbortController
timer.start(abortController.signal)

await setTimeout(50)

timer.reset()

// Here if I do too much reset(), the timer will trigger timeout after 250ms that is the max
// But if abort the AbortController or call timer.stop(), the timer stop and the job will not been done !

await setTimeout(110)

console.log('Job done !')
```
