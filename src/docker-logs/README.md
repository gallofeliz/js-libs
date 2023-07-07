# Docker logs

Follow docker logs :)

- [x] Follow on name pattern, stdout/stdin/both
- [x] Realtime
- [ ] Handle streams disconnections (incl Docker stop etc)

## How to use

```typescript
const dockerLogs = new DockerLogs

dockerLogs.watch({
    namePattern: '*pattern*',
    abortSignal,
    onLog(log) {
        console.log(`
            I received a log of ${log.container.id}, the stream is ${log.stream},
            the date is ${log.date}, the message is ${log.message}
        `)
    })
})
```
