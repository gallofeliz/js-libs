import { DockerLogs, DockerLog } from '.'
import { createLogger } from '@gallofeliz/logger'
import chalk from 'chalk'
import { Writable } from 'stream'

const abortController = new AbortController;

const dockerLogs = new DockerLogs({logger: createLogger({
    handlers: []
})})

// dockerLogs.watch({
//     namePattern: ['*', '!*special*'],
//     stream: 'both',
//     onLog(log) {
//         const name = log.container.compose
//             ? log.container.compose.project + '/' + log.container.compose.service
//             : log.container.name
//         console.log(log.stream.toUpperCase(), log.date, '-', name, '-', log.message)
//     },
//     abortSignal: abortController.signal
// })

const colors: any = {
}

const rdClr = () => Math.floor(Math.random() * 255);

const onLog = (log: DockerLog) => {

    const name = log.container.compose
        ? log.container.compose.project + '/' + log.container.compose.service
        : log.container.name

    const superName = (name + ' '.repeat(30)).substring(0, 30)

    if (!colors[log.container.name]) {
        colors[log.container.name] = chalk.rgb(rdClr(), rdClr(), rdClr())
    }

    const llog = colors[log.container.name](superName+ '  | ') + log.date + ' ' + log.message

    if (log.stream === 'stdout') {
        console.log(llog)
    } else {
        console.error(llog)
    }
}

(async () => {
    for await (const log of dockerLogs.watch({
        stream: 'both',
        abortSignal: abortController.signal
    })) {
        onLog(log)
    }
})()

const stream = dockerLogs.watch({
    stream: 'both',
    abortSignal: abortController.signal
})

const formatLogStream = new Writable({
    objectMode: true,
    write(log: DockerLog, _, cb) {
        onLog(log)
        cb()
    }
})

//stream.on('data', onLog)
stream.pipe(formatLogStream)

dockerLogs.watch({
    stream: 'both',
    onLog,
    abortSignal: abortController.signal
})

dockerLogs.watch({
    containerMatches: {
        compose: {
            service: '*test*'
        }
        //'compose.service': '*test*'
    },
    stream: 'both',
    onLog(log: DockerLog) {
        console.log(log)
    },
    abortSignal: abortController.signal
})

// dockerLogs.watch({
//     namePattern: '*special*',
//     stream: 'stderr',
//     onLog(log) {
//         console.log('SPECIAL STDERR', log.date, '-', log.container.name, '-', log.message)
//     },
//     abortSignal: abortController.signal
// })

setTimeout(() => { abortController.abort() }, 30000)
// sudo docker run --name very-special-container --rm node:16-alpine sh -c 'echo 'Hello'; echo ERRORRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR >&2; exit 1'