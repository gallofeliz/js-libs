import Dockerode from 'dockerode'
import { isMatch } from 'matcher'
import { UniversalLogger, createLogger } from '@gallofeliz/logger'

interface ContainerState {
    id: string
    name: string
    compose?: {
        project: string
        service: string
    }
    running: boolean
    runningEventAt?: Date
    //destroyed: boolean
    stdoutAbortController?: AbortController
    lastStdoutLog?: Date
    stderrAbortController?: AbortController
    lastStderrLog?: Date
}

export interface DockerLogWatchOpts {
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
        id: string,
        compose?: {
            project: string
            service: string
        }
    }
}

interface DockerEvent {
    name: string
    id: string
    action: string
    date: Date
    compose?: {
        project: string
        service: string
    }
}



const trippleNull = Buffer.alloc(3) // like me ahahah

export class DockerLogs {
    protected dockerode = new Dockerode
    protected containersState: ContainerState[] = []
    protected watches: DockerLogWatchOpts[] = []
    protected started = false
    protected abortController?: AbortController
    protected logger: UniversalLogger
    protected containersListDone = false
    protected tmpEvents: any = []

    public constructor({logger}: {logger: UniversalLogger}) {
        this.logger = logger
    }

    public async watch(watch: DockerLogWatchOpts) {
        this.watches.push(watch)
        this.logger.info('Subscriving new watcher', {watch})

        if (!this.started) {
            this.start()
        } else {
            this.containersState.forEach(containerState => this.handleContainerStateChanges(containerState))
        }

        watch.abortSignal?.addEventListener('abort', () => {
            this.logger.info('Unsubscriving watcher', {watch})
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

        this.logger.info('Starting the machine')

        this.abortController = new AbortController

        this.abortController.signal.addEventListener('abort', () => {
            this.logger.info('Stopping the machine');
            [...this.containersState].forEach(containerState => {
                //containerState.destroyed = true
                containerState.running = false
                this.handleContainerStateChanges(containerState)
            })
        })

        await this.listenToContainersEvents(event => {
            if (this.containersListDone) {
                this.handleEvent(event)
            } else {
                this.tmpEvents.push(event)
            }
        })

        const eventDate = new Date;
        const containers = await this.listRunningContainers();

        this.logger.info('Received from docker running containers', {containers})

        for (const container of containers) {
            const containerState:ContainerState = {
                id: container.id,
                name: container.name,
                running: true,
                //destroyed: false,
                runningEventAt: eventDate,
                compose: container.compose
            }

            this.containersState.push(containerState)

            this.handleContainerStateChanges(containerState)
        }

        this.containersListDone = true

        for (const event of this.tmpEvents) {
            this.handleEvent(event)
        }

        this.tmpEvents = []
    }

    protected handleEvent(event: DockerEvent) {
        let newRunningState;
        let containerState = this.containersState.find(cS => cS.id === event.id)

        this.logger.info('Received from docker event', {event})

        switch(event.action) {
            case 'start':
                newRunningState = true
                break;
            case 'die':
                newRunningState = false
                break
            // case 'destroy':
            //     containerState.running = false
            //     containerState.destroyed = true
            //     break
            default:
                // No se
        }

        if (newRunningState === undefined) {
            return
        }

        if (!containerState) {
            if (!newRunningState) {
                return
            }

            containerState = {
                id: event.id,
                name: event.name,
                running: false,
                compose: event.compose
                //destroyed: false
            }

            this.containersState.push(containerState)
        }

        containerState.running = newRunningState
        containerState.runningEventAt = event.date

        this.handleContainerStateChanges(containerState)
    }

    protected async handleContainerStateChanges(containerState: ContainerState) {
        this.logger.info('Handling container state change', {containerState})
        let toWatchStdout = false
        let toWatchStdErr = false
        let toDestroy = true

        /*if (containerState.destroyed) {
            toDestroy = true
        } else if (containerState.running === false) {
        } else*/ if (containerState.running) {
            toDestroy = false
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
            setTimeout(() => {
                containerState.stdoutAbortController?.abort()
                delete containerState.stdoutAbortController
            }, 25)
        }

        if (!toWatchStdErr && containerState.stderrAbortController) {
            setTimeout(() => {
                containerState.stderrAbortController?.abort()
                delete containerState.stderrAbortController
            }, 25)
        }

        if (toDestroy) {
            this.containersState.splice(this.containersState.indexOf(containerState), 1)
        }

    }

    protected async listenContainer(containerState: ContainerState, stream: 'stdout' | 'stderr') {
        const abortController = new AbortController

        this.logger.info('Start to listen container logs', {containerState, stream})

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
                this.logger.info('Aborting listen of container logs', {containerState, stream})
                return
            }

            this.logger.warning('Unexpected logs stream error', {containerState, stream})

            containerState[stream === 'stdout' ? 'stdoutAbortController' : 'stderrAbortController']?.abort
            delete containerState[stream === 'stdout' ? 'stdoutAbortController' : 'stderrAbortController']

            if (containerState.running) {
                this.listenContainer(containerState, stream)
            }

            return
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
                    id: containerState.id,
                    ...containerState.compose && {compose: containerState.compose}
                }
                log.stream = stream

                containerState[stream === 'stdout' ? 'lastStdoutLog' : 'lastStderrLog'] = log.date

                this.dispatchLog(log)
            })
        })

        sstream.once('close', () => {
            this.logger.info('Stream of listen container logs closed', {containerState, stream})
            const lastLog = containerState[stream === 'stdout' ? 'lastStdoutLog' : 'lastStderrLog']
            containerState.runningEventAt = lastLog ? new Date(lastLog.getTime() + 1) : new Date
            abortController.abort()
            delete containerState[stream === 'stdout' ? 'stdoutAbortController' : 'stderrAbortController']

            setTimeout(() => {
                if (containerState.running && !containerState[stream === 'stdout' ? 'stdoutAbortController' : 'stderrAbortController']) {
                    this.logger.warning('Unexpected log stream closed', {containerState, stream})
                    this.listenContainer(containerState, stream)
                }
            }, 200)
        })
    }

    protected dispatchLog(log: DockerLog) {
        this.logger.debug('dispatching log', {log})
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
            ...c.Labels['com.docker.compose.project']
                && {
                    compose: {
                        project: c.Labels['com.docker.compose.project'],
                        service: c.Labels['com.docker.compose.service']
                    }
                },
            status: c.State
        }))
    }

    protected async listenToContainersEvents(cb: (event: DockerEvent) => void) {
        const abortSignal = this.abortController?.signal
        const stream = await this.dockerode.getEvents({
            filters: {
                type: ['container']
            },
            abortSignal: abortSignal
        })

        stream.once('close', () => {
            if (!abortSignal?.aborted) {
                this.logger.warning('Unexpected closed stream for events')
                this.listenToContainersEvents(cb)
            } else {
                this.logger.info('Closed stream for events')
            }
        })

        stream.on('data', (data) => {
            const dEvent = JSON.parse(data.toString())

            cb({
                name: dEvent.Actor.Attributes.name,
                id: dEvent.id,
                action: dEvent.Action,
                date: new Date(dEvent.timeNano / 1000 / 1000 - 10),
                ...dEvent.Actor.Attributes['com.docker.compose.project']
                    && {
                        compose: {
                            project: dEvent.Actor.Attributes['com.docker.compose.project'],
                            service: dEvent.Actor.Attributes['com.docker.compose.service']
                        }
                    }
            })
        })
    }

}

const abortController = new AbortController;

const dockerLogs = new DockerLogs({logger: createLogger({
    //handlers: []
})})

dockerLogs.watch({
    namePattern: '*',
    stream: 'both',
    onLog(log) {
        console.log(log.date, '-', log.container.name, '-', log.message)
    },
    abortSignal: abortController.signal
})

// Alternative : https://github.com/mcollina/docker-loghose/tree/master
// Global alternative : https://github.com/gliderlabs/logspout