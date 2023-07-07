import { UniversalLogger, createLogger } from '@gallofeliz/logger'
import Dockerode from 'dockerode'

interface Container {
    name: string
    id: string
    running: boolean
    compose?: {
        project: string
        service: string
    }
}

type ContainerInfos = {
    container: Container
    hasBeenRunningHere: boolean
    stateAt: Date
}

interface Watcher {
    cb: (containerRunningState: Container) => void
    abortSignal: AbortSignal,
    ignoreNonRunningAtBeginning?: boolean
}

export class DockerContainersWatcher {
    protected dockerode = new Dockerode
    protected containersInfos: ContainerInfos[] = []
    protected abortController?: AbortController
    protected logger: UniversalLogger
    protected watchers: Watcher[] = []

    public constructor(logger: UniversalLogger) {
        this.logger = logger
    }

    public watch(watcher: Watcher) {
        if (watcher.abortSignal.aborted) {
            return
        }

        this.start()
        this.watchers.push(watcher)

        watcher.abortSignal.addEventListener('abort', () => {
            this.watchers.splice(this.watchers.indexOf(watcher), 1)
            if (this.watchers.length === 0) {
                this.stop()
            }
        })

        this.containersInfos.forEach(containerInfos => {
            watcher.cb(containerInfos.container)
        })
    }

    protected restart() {
        this.stop()
        this.start()
    }

    protected stop() {
        this.abortController?.abort()
        delete this.abortController
    }

    protected dispatchChange(containerInfos: ContainerInfos) {
        this.watchers.forEach(watcher => {
            this.dispatchChangeForWatcher(containerInfos, watcher)
        })
    }

    protected dispatchChangeForWatcher(containerInfos: ContainerInfos, watcher: Watcher) {
        if (!containerInfos.hasBeenRunningHere && watcher.ignoreNonRunningAtBeginning) {
            return
        }
        watcher.cb(containerInfos.container)
    }

    protected async start() {
        if (this.abortController) {
            return
        }

        this.abortController = new AbortController
        const abortSignal = this.abortController.signal

        let stream

        try {
            stream = await this.dockerode.getEvents({
                filters: {
                    type: ['container']
                },
                abortSignal: abortSignal
            })
        } catch (e) {
            if (!abortSignal.aborted) {
                this.logger.warning('Unexpected error on getting events for containers', {e})
                this.restart()
            }

            return
        }

        this.updateInfosFromScratch(this.abortController.signal)

        stream.once('close', () => {
            if (!abortSignal.aborted) {
                this.logger.warning('Unexpected closed stream for events')
                this.restart()
            } else {
                this.logger.info('Closed stream for events')
            }
        })

        stream.on('data', (data) => {
            const dEvent = JSON.parse(data.toString())

            if (!['start', 'die', 'destroy'].includes(dEvent.Action)) {
                return
            }

            const container: Container = {
                name: dEvent.Actor.Attributes.name,
                id: dEvent.id,
                ...dEvent.Actor.Attributes['com.docker.compose.project']
                    && {
                        compose: {
                            project: dEvent.Actor.Attributes['com.docker.compose.project'],
                            service: dEvent.Actor.Attributes['com.docker.compose.service']
                        }
                    },
                running: dEvent.Action === 'start'

            }

            const ci = this.containersInfos.find(ci => ci.container.id === container.id)

            const eventDate = new Date(dEvent.timeNano / 1000 / 1000 - 10)

            if (!ci) {

                if (dEvent.Action === 'destroy') {
                    return
                }

                const newCi: ContainerInfos = {
                    hasBeenRunningHere: container.running,
                    stateAt: eventDate,
                    container
                }

                this.containersInfos.push(newCi)
                this.dispatchChange(newCi)
                return
            }

            ci.stateAt = eventDate

            if (ci.container.running !== container.running) {
                ci.container.running = container.running
                if (container.running) {
                    ci.hasBeenRunningHere = true
                }
                this.dispatchChange(ci)
            }

            if (dEvent.Action === 'destroy') {
                this.containersInfos.splice(this.containersInfos.indexOf(ci), 1)
            }
        })
    }

    protected async updateInfosFromScratch(abortSignal: AbortSignal) {
        const fromScratchDate = new Date
        let dockerContainers

        try {
            dockerContainers = await this.dockerode.listContainers({all: true})
        } catch (e) {
            if (!abortSignal.aborted) {
                this.logger.warning('Unexpected error on listening containers', {e})
                this.updateInfosFromScratch(abortSignal)
            }

            return
        }

        if (abortSignal.aborted) {
            return
        }

        const containers = dockerContainers.map(c => ({
            name: c.Names[0].substring(1),
            id: c.Id,
            ...c.Labels['com.docker.compose.project']
                && {
                    compose: {
                        project: c.Labels['com.docker.compose.project'],
                        service: c.Labels['com.docker.compose.service']
                    }
                },
            running: c.State === 'running'
        }))

        // Removing old containers
        this.containersInfos = this.containersInfos.filter(containerInfo => {
            if (containerInfo.stateAt > fromScratchDate) {
                return true
            }
            if (containers.find(c => c.id === containerInfo.container.id)) {
                return true
            }

            containerInfo.container.running = false

            this.dispatchChange(containerInfo)

            return false
        })

        // Updating containers
        containers.forEach(container => {
            const ci = this.containersInfos.find(ci => ci.container.id === container.id)

            if (!ci) {
                const newCi = {
                    hasBeenRunningHere: container.running,
                    stateAt: fromScratchDate,
                    container
                }
                this.containersInfos.push(newCi)
                this.dispatchChange(newCi)
                return
            }

            if (ci.stateAt > fromScratchDate) {
                return
            }

            ci.stateAt = fromScratchDate
            if (ci.container.running !== container.running) {
                ci.container.running = container.running
                if (container.running) {
                    ci.hasBeenRunningHere = true
                }
                this.dispatchChange(ci)
            }
        })

    }
}

const dcw = (new DockerContainersWatcher(createLogger()))

const abort = new AbortController

;dcw.watch({
    cb: c => {
        console.log('coucou', c)
    },
    abortSignal: abort.signal,
    ignoreNonRunningAtBeginning: true
})

setTimeout(() => abort.abort(), 10000)