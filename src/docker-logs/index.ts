import matcher from 'matcher'
import { UniversalLogger } from '@gallofeliz/logger'
import { ContainerRunInfo, DockerContainersRunStateWatcher } from './docker-containers-run-state-watcher'
import { DockerContainerLogsListener, Log, Stream } from './docker-container-logs-listener'
import { Readable } from 'stream'
import { every, get } from 'lodash'
// @ts-ignore
import {flatten as flattenObject} from 'flat'

interface ContainerState extends ContainerRunInfo {
    listeners: {
        stdout?: DockerContainerLogsListener
        stderr?: DockerContainerLogsListener
    }
}

export interface DockerLogWatchOpts {
    containerMatches?: {
        name?: string | string[]
        id?: string | string[]
        image?: {
            name?: string | string[]
            tag?: string | string[]
        },
        compose?: {
            project?: string | string[]
            service?: string | string[]
        }
    }//Record<string, string | string[]>
    stream: 'stdout' | 'stderr' | 'both'
    onLog: (log: DockerLog) => void
    abortSignal: AbortSignal
}

export interface DockerLog {
    stream: 'stdout' | 'stderr'
    date: string
    message: string
    container: {
        name: string
        id: string
        image: {
            name: string
            tag: string
        },
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

    public watch(watch: Omit<DockerLogWatchOpts, 'onLog'>): Readable
    public watch(watch: Omit<DockerLogWatchOpts, 'onLog'> & {onLog: (log: DockerLog) => void}): void
    public watch(watch: Omit<DockerLogWatchOpts, 'onLog'> & {onLog?: (log: DockerLog) => void}) {
        if (watch.abortSignal.aborted) {
            return
        }

        if (!watch.onLog) {
            return this.stream(watch)
        }

        this.watchers.push(watch as DockerLogWatchOpts)
        this.logger.info('Subscriving new watcher', {watch})

        if (!this.started) {
            this.start()
        } else {
            this.computeListeners()
        }

        watch.abortSignal?.addEventListener('abort', () => {
            this.logger.info('Unsubscriving watcher', {watch})
            this.watchers.splice(this.watchers.indexOf(watch as DockerLogWatchOpts), 1)
            this.computeListeners()

            if (this.watchers.length === 0) {
                this.stop()
            }
        })
    }

    protected stream(opts: Omit<DockerLogWatchOpts, 'onLog'>): Readable {
        const stream = new Readable({objectMode: true, read(){} })
        const ac = new AbortController

        this.watch({
            ...opts,
            abortSignal: ac.signal,
            onLog(log: DockerLog) {
                stream.push(log)
            }
        })

        opts.abortSignal.addEventListener('abort', (e) => ac.abort(e))

        stream.once('close', () => { ac.abort() })

        return stream
    }

    protected onContainerLog(log: Log, container: ContainerState, stream: Stream) {
        const dockerLog: DockerLog = {
            container: {
                name: container.name,
                id: container.id,
                image: container.image,
                compose: container.compose
            },
            stream,
            date: log.date,
            message: log.message
        }

        this.dispatchLog(dockerLog)
    }

    protected isMatch(container: ContainerState | DockerLog['container'], watch: DockerLogWatchOpts) {
        if (!watch.containerMatches) {
            return true
        }

        const flatContainerMatches = flattenObject(watch.containerMatches)

        return every(flatContainerMatches, (pattern, containerKey) => {
            const value = get(container, containerKey)

            return matcher(value, pattern).length === 1
        })
    }

    protected dispatchLog(log: DockerLog) {
        this.logger.debug('dispatching log', {log})

        this.watchers.forEach(watch => {
            if (watch.stream !== 'both' && watch.stream !== log.stream) {
                return
            }

            if (!this.isMatch(log.container, watch)) {
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
                    .some(watch => ['both', 'stdout'].includes(watch.stream) && this.isMatch(containerState, watch))

                toWatchStdErr = this.watchers
                    .some(watch => ['both', 'stderr'].includes(watch.stream) && this.isMatch(containerState, watch))
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
