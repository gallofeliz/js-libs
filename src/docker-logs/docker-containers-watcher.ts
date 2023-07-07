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

type ContainersInfos = {
    container: Container
    stateAt: Date
}[]

export class DockerContainersWatcher {
    protected dockerode = new Dockerode
    protected containersInfos: ContainersInfos = []
    protected abortController?: AbortController
    protected logger: UniversalLogger

    public constructor(logger: UniversalLogger) {
        this.logger = logger
    }

    protected restart() {
        this.stop()
        this.start()
    }

    protected stop() {
        this.abortController?.abort()
        delete this.abortController
    }

    protected dispatchChange(container: Container) {
        console.log(container)
    }

    public async start() {
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

                this.containersInfos.push({
                    stateAt: eventDate,
                    container
                })
                this.dispatchChange(container)
                return
            }

            ci.stateAt = eventDate

            if (ci.container.running !== container.running) {
                ci.container.running = container.running
                this.dispatchChange(container)
            }
        })
    }

    protected async updateInfosFromScratch(abortSignal: AbortSignal) {
        const fromScratchDate = new Date
        let dockerContainers

        try {
            dockerContainers = await this.dockerode.listContainers({all: true})

            console.log(dockerContainers)
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

            this.dispatchChange({
                ...containerInfo.container,
                running: false
            })

            return false
        })

        // Updating containers
        containers.forEach(container => {
            const ci = this.containersInfos.find(ci => ci.container.id === container.id)

            if (!ci) {
                this.containersInfos.push({
                    stateAt: fromScratchDate,
                    container
                })
                this.dispatchChange(container)
                return
            }

            if (ci.stateAt > fromScratchDate) {
                return
            }

            ci.stateAt = fromScratchDate
            if (ci.container.running !== container.running) {
                ci.container.running = container.running
                this.dispatchChange(container)
            }
        })

    }
}


(new DockerContainersWatcher(createLogger())).start()