import Dockerode from 'dockerode'
import { isMatch } from 'matcher'

//docker events for containers events + events on logs

export interface DockerLog {
    stream: 'stdout' | 'stderr'
    date: Date
    message: string
    container: {
        name: string
        id: string
    }
}

export interface DockerLogWatchOpts {
    namePattern: string
    onLog: (log: DockerLog) => void
    abortSignal?: AbortSignal
}

const trippleNull = Buffer.alloc(3) // like me ahahah

export class DockerLogs {
    protected dockerode?: Dockerode
    protected watches: any[] = []
    protected refreshInterval?: NodeJS.Timer
    protected containers: Record<string, any> = {}
    protected lastRefresh = new Date

    protected getDockerode() {
        if (!this.dockerode) {
            this.dockerode = new Dockerode()
        }
        return this.dockerode
    }

    protected async getContainersList(namePatterns: string[]) {
        const allContainers = await this.getDockerode().listContainers({
            filters: {
                status: ['running']
            }
        })

        return allContainers
            .filter(container => namePatterns.some(namePattern => isMatch(container.Names[0].substring(1), namePattern)))
    }

    protected start() {
        // We can listen events
        this.lastRefresh = new Date
        this.refreshInterval = setInterval(() => this.refresh(), 1000 * 30)
        this.refresh()
    }

    protected async refresh() {
        if (this.watches.length === 0) {
            clearInterval(this.refreshInterval)
            this.refreshInterval = undefined
        }

        const dockerContainers = this.watches.length === 0
            ? []
            : await this.getContainersList(this.watches.map(w => w.namePattern))

        Object.keys(this.containers).filter(containerId => {
            if (dockerContainers.some(c => c.Id === containerId)) {
                return
            }

            this.containers[containerId].abortController.abort()
            delete this.containers[containerId]
        })

        dockerContainers.forEach(async container => {
            if (this.containers[container.Id]) {
                return
            }

            const abortController = new AbortController

            this.containers[container.Id] = {
                name: container.Names[0].substring(1),
                abortController
            }

            this.watchContainer(container.Id, this.containers[container.Id].name, abortController.signal)
        })

        this.lastRefresh = new Date
    }

    protected async watchContainer(id: string, name: string, abortSignal: AbortSignal) {
        const outStream = await this.getDockerode().getContainer(id).logs({
            timestamps: true,
            stderr: false,
            stdout: true,
            since: this.lastRefresh.getTime() / 1000,
            abortSignal: abortSignal,
            follow: true
        })

        const errStream = await this.getDockerode().getContainer(id).logs({
            timestamps: true,
            stderr: true,
            stdout: false,
            since: this.lastRefresh.getTime() / 1000,
            abortSignal: abortSignal,
            follow: true
        })

        let outTmpLogs: any[] = []
        let errTmpLogs: any[] = []

        outStream.on('data', data => {
            const logs = this.parseLogsData(data)

            logs.forEach(log => {

                if (log.potentiallyPartial) {
                    outTmpLogs.push(log)
                    return
                } else if (outTmpLogs.length > 0) {

                    outTmpLogs.push(log)

                    log = {
                        date: outTmpLogs[0].date,
                        message: outTmpLogs.reduce((merged, log) => merged + log.message, '')
                    }

                    outTmpLogs = []

                }

                delete log.potentiallyPartial

                log.container = {
                    name,
                    id
                }
                log.stream = 'stdout'

                this.dispatchLog(log)
            })
        })

        errStream.on('data', data => {
            const logs = this.parseLogsData(data)

            logs.forEach(log => {

                if (log.potentiallyPartial) {
                    errTmpLogs.push(log)
                    return
                } else if (errTmpLogs.length > 0) {

                    errTmpLogs.push(log)

                    log = {
                        date: errTmpLogs[0].date,
                        message: errTmpLogs.reduce((merged, log) => merged + log.message, '')
                    }

                    errTmpLogs = []

                }

                delete log.potentiallyPartial

                log.container = {
                    name,
                    id
                }
                log.stream = 'stderr'

                this.dispatchLog(log)
            })
        })

        // clean events on stream end ?
        // todo : reconnect if stream close and no abort
    }

    protected dispatchLog(log: any) {
        this.watches.forEach(watch => {
            if (!isMatch(log.container.name, watch.namePattern)) {
                return
            }

            watch.onLog(log)
        })
    }

    protected parseLogsData(rawLogs: Buffer): any[] {

        if (!rawLogs.subarray(1, 4).equals(trippleNull)) {
            const [t, ...v] = rawLogs.toString().trimEnd().split(' ')

            const message = v.join(' ')

            return [{
                date: new Date(t),
                message,
                potentiallyPartial: message.length === 16384
            }]

        }

        if (rawLogs.length === 0) {
            return []
        }

        let logs = []
        let i = 0

        while(true) {
            const stream = rawLogs[i] === 1 ? 'stdout' : 'stderr'
            i++
            i = i + 3 // unused
            const size = rawLogs.readInt32BE(i)

            i = i + 4

            const msgWithTimestamp = rawLogs.subarray(i, i + size).toString().trimEnd()
            const [t, ...v] = msgWithTimestamp.split(' ')

            logs.push({
                date: new Date(t),
                stream,
                message:v.join(' '),
                potentiallyPartial: size === 16415
            })
            i = i + size

            if (i >= rawLogs.length) {
                break;
            }

        }

        return logs
    }

    public async watch({namePattern, onLog, abortSignal}: DockerLogWatchOpts) {
        const watch = {
            namePattern,
            onLog
        }

        this.watches.push(watch)

        if (!this.refreshInterval) {
            this.start()
        }/* else {
            this.refresh()
        }*/

        abortSignal?.addEventListener('abort', () => {
            this.watches.splice(this.watches.indexOf(watch), 1)
            //this.refresh()
        })
    }
}
