import { DockerLogs } from '.'
import { createLogger } from '@gallofeliz/logger'
import chalk from 'chalk'

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

dockerLogs.watch({
    namePattern: ['*'],
    stream: 'both',
    onLog(log) {
        const superName = (log.container.name + ' '.repeat(30)).substring(0, 30)

        if (!colors[log.container.name]) {
            colors[log.container.name] = chalk.rgb(rdClr(), rdClr(), rdClr())
        }

        const llog = colors[log.container.name](superName+ '  | ') + log.date + ' ' + log.message

        if (log.stream === 'stdout') {
            console.log(llog)
        } else {
            console.error(llog)
        }
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