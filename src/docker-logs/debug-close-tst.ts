import { DockerLogs } from '.'

const service = new DockerLogs;

service.watch({
    namePattern: 'debug',
    onLog(log) {
        console.log('debug is', JSON.stringify(log, undefined, 4))
    },
})


/*
sudo docker run --name debug -d --init node:18-alpine -e 'setInterval(() => { console.log("bla blabla debug") }, 1000)'

sudo docker stop debug

sudo docker start debug

sudo docker stop debug

sudo docker rm debug

*/

