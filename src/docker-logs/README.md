# Docker logs

Follow docker logs :)

- [x] Follow on name pattern
- [ ] Use events instead of periodic listContainers(), and for thems, don't use since arg.
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
