# Docker logs (realtime watcher)

Follow docker logs based on criteria :)

- [x] Follow on name pattern (using component matcher), stdout/stdin/both (and why not others criteria like compose project/service, labels etc)
- [x] Realtime
- [x] Docker disconnects tolerance
- [x] Very fast containers (unless others tested components, but this is thanks to a small hack)
- [ ] Possibly non-realtime logs in case of long disconnections. In case of disconnect, it reconnects requesting logs since last log to fetch missed logs. If the disconnection was some seconds, it makes sense (depending of the realtime window). Why not define a max "realtime" gap/window ?
- [ ] Optimize container stream using dual stdout/stderr when both are watched ?
- [ ] Unordered logs in some cases (very fast loggin in stdout and stderr). Example : docker run node:16-alpine sh -c 'echo OK; echo ERROR >&2; exit 1' will show in random order the messages, also in the console. Adding -t option resolves, but impact the container. Probably no fix, even with attach api.
- [ ] Using run -t outputs only in stdout. The order is respected. Note that in the console also it is to STDOUT. Probably no fix.
- [ ] Change inside code Date to Docker dates to improve the precision and avoid strange some codes
- [ ] Multiline support

## Motivations

The main goal of the tool is to read in realtime the logs of my containers and makes some metrics (errors, operations) and see them in grafana with alerts.

THIS IS NOT a tool to collect logs. I tested some tools like logspout, interesting because it can be used to collect logs AND to consume them, but the projects seems to be not maintened. Using a tool as container to collect logs or configuring the logging driver (thanks to dual-logging, you also can read log with docker daemon) is more appropriated.

## How to use

```typescript
import { DockerLogs } from '@gallofeliz/docker-logs'
import { createLogger } from '@gallofeliz/logger';

const abortController = new AbortController;

const dockerLogs = new DockerLogs({logger: createLogger({handlers: []})})

dockerLogs.watch({
    namePattern: ['*', '!*special*'],
    stream: 'both',
    onLog(log) {
        const name = log.container.compose
            ? log.container.compose.project + '/' + log.container.compose.service
            : log.container.name
        console.log(log.stream.toUpperCase(), log.date, '-', name, '-', log.message)
    },
    abortSignal: abortController.signal
})

dockerLogs.watch({
    namePattern: '*special*',
    stream: 'stderr',
    onLog(log) {
        console.log('SPECIAL STDERR', log.date, '-', log.container.name, '-', log.message)
    },
    abortSignal: abortController.signal
})

setTimeout(() => { abortController.abort() }, 30000)
```

will produce with my tests (a docker compose with a a micro script that says start, then work then crashes with badadoom to test last log on crash (bug with Docker in some versions)) :
```
STDERR 2023-07-07T23:49:05.916Z - docker-logs/test - Error: Badaboom
STDOUT 2023-07-07T23:49:06.542Z - docker-logs/test - start
SPECIAL STDERR 2023-07-07T23:49:14.062Z - very-special-container - ERRORRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR
STDOUT 2023-07-07T23:49:16.555Z - docker-logs/test - work
STDERR 2023-07-07T23:49:26.568Z - docker-logs/test - Error: Badaboom
STDOUT 2023-07-07T23:49:27.331Z - docker-logs/test - start
```

