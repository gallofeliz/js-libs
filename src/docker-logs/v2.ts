import Dockerode from 'dockerode'
import { isMatch } from 'matcher'

interface ContainerState {
    id: string
    name: string
    running: boolean
    runningEventAt?: Date
    destroyed: boolean
    stdoutAbortController?: AbortController
    stderrAbortController?: AbortController
}

interface DockerLogWatchOpts {
    namePattern: string
    stream: 'stdout' | 'stderr' | 'both'
    onLog: (log: DockerLog) => void
    abortSignal?: AbortSignal
}

export interface DockerLog {
    stream: 'stdout' | 'stderr'
    date: Date
    message: string
    container: {
        name: string
        id: string
    }
}

const trippleNull = Buffer.alloc(3) // like me ahahah

class DockerLogs {
    protected dockerode = new Dockerode
    protected containersState: ContainerState[] = []
    protected watches: DockerLogWatchOpts[] = []
    protected started = false
    protected abortController?: AbortController

    public async watch(watch: DockerLogWatchOpts) {
        this.watches.push(watch)

        if (!this.started) {
            this.start()
        } else {
            this.containersState.forEach(containerState => this.handleContainerStateChanges(containerState))
        }

        watch.abortSignal?.addEventListener('abort', () => {
            this.watches.splice(this.watches.indexOf(watch), 1)
            this.containersState.forEach(containerState => this.handleContainerStateChanges(containerState))

            if (this.watches.length === 0) {
                this.abortController?.abort()
            }
        })
    }

    protected async start() {

        if (this.started) {
            return
        }

        this.abortController = new AbortController

        this.abortController.signal.addEventListener('abort', () => {
            [...this.containersState].forEach(containerState => {
                containerState.destroyed = true
                this.handleContainerStateChanges(containerState)
            })
        })

        let containersListDone = false
        let tmpEvents: any = []

        await this.listenToContainersEvents(event => {
            if (containersListDone) {
                this.handleEvent(event)
            } else {
                tmpEvents.push(event)
            }
        })

        const eventDate = new Date;
        const containers = await this.listRunningContainers();

        for (const container of containers) {
            const containerState:ContainerState = {
                id: container.id,
                name: container.name,
                running: true,
                destroyed: false,
                runningEventAt: eventDate
            }

            this.containersState.push(containerState)

            this.handleContainerStateChanges(containerState)
        }

        containersListDone = true

        for (const event of tmpEvents) {
            this.handleEvent(event)
        }

        tmpEvents = []
    }

    protected handleEvent(event: DockerEvent) {
        let containerState = this.containersState.find(cS => cS.id === event.id)

        if (!containerState) {
            containerState = {
                id: event.id,
                name: event.name,
                running: false,
                runningEventAt: event.date,
                destroyed: false
            }

            this.containersState.push(containerState)
        }

        //console.log('debug', event)

        switch(event.action) {
            case 'start':
                containerState.running = true
                break;
            case 'die':
                containerState.running = false
            case 'destroy':
                containerState.running = false
                containerState.destroyed = true
                break
            default:
                // No se
        }

        this.handleContainerStateChanges(containerState)
    }

    protected async handleContainerStateChanges(containerState: ContainerState) {
        let toWatchStdout = false
        let toWatchStdErr = false
        let toDestroy = false

        if (containerState.destroyed) {
            toDestroy = true
        } else if (containerState.running === false) {
        } else {
            // To do put in containerStateChanges the watchers to improve perfs (reduce dispatch footprint)
            toWatchStdout = this.watches
                .some(watch => ['both', 'stdout'].includes(watch.stream) && isMatch(containerState.name, watch.namePattern))

            toWatchStdErr = this.watches
                .some(watch => ['both', 'stderr'].includes(watch.stream) && isMatch(containerState.name, watch.namePattern))
        }

        if (toWatchStdout && !containerState.stdoutAbortController) {
            this.listenContainer(containerState, 'stdout')
        }

        if (toWatchStdErr && !containerState.stderrAbortController) {
            this.listenContainer(containerState, 'stderr')
        }

        if (!toWatchStdout && containerState.stdoutAbortController) {
            containerState.stdoutAbortController.abort()
            delete containerState.stdoutAbortController
        }

        if (!toWatchStdErr && containerState.stderrAbortController) {
            containerState.stderrAbortController.abort()
            delete containerState.stderrAbortController
        }

        if (toDestroy) {
            this.containersState.splice(this.containersState.indexOf(containerState), 1)
        }

    }

    protected async listenContainer(containerState: ContainerState, stream: 'stdout' | 'stderr') {
        const abortController = new AbortController

        containerState[stream === 'stdout' ? 'stdoutAbortController' : 'stderrAbortController'] = abortController

        let sstream
        try {

            sstream = await this.dockerode.getContainer(containerState.id).logs({
                timestamps: true,
                stderr: stream === 'stderr',
                stdout: stream === 'stdout',
                since: containerState.runningEventAt!.getTime() / 1000,
                abortSignal: abortController.signal,
                follow: true
            })

        } catch (e) {
            if (abortController.signal.aborted) {
                return
            }

            throw e
        }

        let outTmpLogs: any[] = []

        sstream.on('data', data => {
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
                    name: containerState.name,
                    id: containerState.id
                }
                log.stream = stream

                this.dispatchLog(log)
            })
        })


        sstream.once('end', () => {

            containerState.runningEventAt = new Date
            abortController.abort()
            delete containerState[stream === 'stdout' ? 'stdoutAbortController' : 'stderrAbortController']
            this.handleContainerStateChanges(containerState)
        })
    }

    protected dispatchLog(log: DockerLog) {
        this.watches.forEach(watch => {
            if (watch.stream !== 'both' && watch.stream !== log.stream) {
                return
            }

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

    protected async listRunningContainers() {
        const dockerContainers = await this.dockerode.listContainers({all: false})

        return dockerContainers.map(c => ({
            name: c.Names[0].substring(1),
            id: c.Id,
            status: c.State
        }))
    }

    protected async listenToContainersEvents(cb: (event: DockerEvent) => void) {
        const stream = await this.dockerode.getEvents({
            filters: {
                type: ['container']
            },
            abortSignal: this.abortController?.signal
        })

        stream.once('end', () => {
            throw new Error('Unexpected')
        })

        stream.on('data', (data) => {
            const dEvent = JSON.parse(data.toString())
            cb({
                name: dEvent.Actor.Attributes.name,
                id: dEvent.id,
                action: dEvent.Action,
                date: new Date(dEvent.timeNano / 1000 / 1000)
            })
        })
    }

}

interface DockerEvent {
    name: string
    id: string
    action: string
    date: Date
}

const abortController = new AbortController;

(new DockerLogs).watch({
    namePattern: '*',
    stream: 'stderr',
    onLog(log) {
        console.log(log)
    },
    abortSignal: abortController.signal
})

setTimeout(() => abortController.abort(), 10000)