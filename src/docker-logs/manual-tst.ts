import { DockerLogs } from '.'

const service = new DockerLogs;

const abortController = new AbortController

service.watch({
    namePattern: 'tar*an',
    onLog(log) {
        console.log('tar*an is', JSON.stringify(log, undefined, 4))
    },
    abortSignal: abortController.signal
})


service.watch({
    namePattern: 'bana*',
    onLog(log) {
        console.log('bana*', JSON.stringify(log, undefined, 4))
    },
    abortSignal: abortController.signal
})
/*
sudo docker run --name tarzan --rm --init node:18-alpine -e 'setInterval(() => { console.log("bla blabla tarzan") }, 1000)'
sudo docker run --name banana --rm --init node:18-alpine -e 'setInterval(() => { console.log("bla blabla banana") }, 1000)'
sudo docker run --name fantomas --rm --init node:18-alpine -e 'setInterval(() => { console.log("bla blabla fantomas (should not see me)") }, 1000)'
sudo docker run --name tarzan --rm -it --init node:18-alpine -e 'setInterval(() => { console.log("bla blabla") }, 1000)'
sudo docker run --name tarzan --rm -it --init node:18-alpine -e '(async () => { for (let i = 1000; i < 10000; i++) process.stdout.write(i + " "); process.stdout.write("\n") ; await new Promise(resolve => setTimeout(resolve, 15000)) })()'
sudo docker run --name tarzan --rm --init node:18-alpine -e '(async () => { for (let i = 1000; i < 10000; i++) process.stdout.write(i + " "); process.stdout.write("\n") ; await new Promise(resolve => setTimeout(resolve, 15000)) })()'
*/

setTimeout(() => abortController.abort(), 30000)