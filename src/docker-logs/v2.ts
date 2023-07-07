import { isMatch } from 'matcher'
import { UniversalLogger, createLogger } from '@gallofeliz/logger'
import { ContainerRunInfo, DockerContainersRunStateWatcher } from './docker-containers-run-state-watcher'
import { DockerContainerLogsListener, Log, Stream } from './docker-container-logs-listener'

interface ContainerState extends ContainerRunInfo {
    listeners: {
        stdout?: DockerContainerLogsListener
        stderr?: DockerContainerLogsListener
    }
}

export interface DockerLogWatchOpts {
    namePattern: string
    stream: 'stdout' | 'stderr' | 'both'
    onLog: (log: DockerLog) => void
    abortSignal: AbortSignal
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

export class DockerLogs {
    protected containersState: ContainerState[] = []
    protected watchers: DockerLogWatchOpts[] = []
    protected started = false
    protected abortController?: AbortController
    protected logger: UniversalLogger
    protected runStateMatcher: DockerContainersRunStateWatcher

    public constructor({logger}: {logger: UniversalLogger}) {
        this.logger = logger
        this.runStateMatcher = new DockerContainersRunStateWatcher(logger)
    }

    public async watch(watch: DockerLogWatchOpts) {
        if (watch.abortSignal.aborted) {
            return
        }

        this.watchers.push(watch)
        this.logger.info('Subscriving new watcher', {watch})

        if (!this.started) {
            this.start()
        } else {
            this.computeListeners()
        }

        watch.abortSignal?.addEventListener('abort', () => {
            this.logger.info('Unsubscriving watcher', {watch})
            this.watchers.splice(this.watchers.indexOf(watch), 1)
            this.computeListeners()

            if (this.watchers.length === 0) {
                this.stop()
            }
        })
    }

    protected onContainerLog(log: Log, container: ContainerState, stream: Stream) {
        const dockerLog: DockerLog = {
            container,
            stream,
            date: log.date,
            message: log.message
        }

        this.dispatchLog(dockerLog)
    }

    protected dispatchLog(log: DockerLog) {
        this.logger.debug('dispatching log', {log})
        this.watchers.forEach(watch => {
            if (watch.stream !== 'both' && watch.stream !== log.stream) {
                return
            }

            if (!isMatch(log.container.name, watch.namePattern)) {
                return
            }

            watch.onLog(log)
        })
    }

    protected computeListeners() {

        this.containersState.forEach(containerState => {

            let toWatchStdout = false
            let toWatchStdErr = false

            if (containerState.running) {
                toWatchStdout = this.watchers
                    .some(watch => ['both', 'stdout'].includes(watch.stream) && isMatch(containerState.name, watch.namePattern))

                toWatchStdErr = this.watchers
                    .some(watch => ['both', 'stderr'].includes(watch.stream) && isMatch(containerState.name, watch.namePattern))
            }

            if (toWatchStdout && !containerState.listeners.stdout) {
                containerState.listeners.stdout = new DockerContainerLogsListener({
                    logger: this.logger,
                    containerId: containerState.id,
                    stream: 'stdout',
                    cb: (log) => this.onContainerLog(log, containerState, 'stdout')
                })
                containerState.listeners.stdout.listen(new Date(containerState.runningUpdateAt.getTime() - 10))
            }

            if (toWatchStdErr && !containerState.listeners.stderr) {
                containerState.listeners.stderr = new DockerContainerLogsListener({
                    logger: this.logger,
                    containerId: containerState.id,
                    stream: 'stderr',
                    cb: (log) => this.onContainerLog(log, containerState, 'stderr')
                })
                containerState.listeners.stderr.listen(new Date(containerState.runningUpdateAt.getTime() - 10))
            }

            if (!toWatchStdout && containerState.listeners.stdout) {
                const listener = containerState.listeners.stdout!
                delete containerState.listeners.stdout

                setTimeout(() => {
                    listener.stop()
                }, 25)
            }

            if (!toWatchStdErr && containerState.listeners.stderr) {
                const listener = containerState.listeners.stderr!
                delete containerState.listeners.stderr

                setTimeout(() => {
                    listener.stop()
                }, 25)
            }

        })

        this.containersState = this.containersState.filter(cs => cs.running)
    }

    protected onContainerRunChange(containerRunInfo: ContainerRunInfo) {
        let containerState = this.containersState.find(cs => cs.id === containerRunInfo.id)

        if (!containerState) {
            if (!containerRunInfo.running) {
                return
            }
            this.containersState.push({
                ...containerRunInfo,
                listeners: {}
            })
        } else {
            containerState.running = containerRunInfo.running
            containerState.runningUpdateAt = containerRunInfo.runningUpdateAt
        }

        this.computeListeners()
    }

    protected stop() {
        this.abortController?.abort()
    }

    protected async start() {

        if (this.started) {
            return
        }

        this.started = true

        this.logger.info('Starting the machine')

        this.abortController = new AbortController

        this.runStateMatcher.watch({
            abortSignal: this.abortController.signal,
            cb: (containerRunningState) => this.onContainerRunChange(containerRunningState)
        })

        this.abortController.signal.addEventListener('abort', () => {
            this.logger.info('Stopping the machine');
            [...this.containersState].forEach(containerState => {
                //containerState.destroyed = true
                containerState.running = false
                this.computeListeners()
            })
            this.started = false
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


dockerLogs.watch({
    namePattern: '*',
    stream: 'stderr',
    onLog(log) {
        console.log('errrrrrrrrr', log.date, '-', log.container.name, '-', log.message)
    },
    abortSignal: abortController.signal
})

setTimeout(() => { abortController.abort() }, 10000)

// Alternative : https://github.com/mcollina/docker-loghose/tree/master
// Global alternative : https://github.com/gliderlabs/logspout