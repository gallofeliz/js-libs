import { loadConfig, ConfigOpts, ChangePatchOperation, WatchChangesEventEmitter } from '@gallofeliz/config'
import { UniversalLogger, LoggerOpts, Logger } from '@gallofeliz/logger'
import EventEmitter from 'events'
import { v4 as uuid } from 'uuid'

export type InjectedServices<Config> = {
    logger: UniversalLogger
    config: Config
    appName: string
    appVersion: string
    container: Services<Config>
    configWatcher: WatchChangesEventEmitter<Config>
    abortController: AbortController
    abortSignal: AbortSignal
}

export type Services<Config> = Record<keyof ServicesDefinition<Config>, any> & InjectedServices<Config>

type ReservedServicesNames = keyof InjectedServices<any>

export type ServicesDefinition<Config> = Record<Exclude<string, ReservedServicesNames>, ServiceDefinition<any, Config>>

export type ServiceDefinition<T, Config> = (services: Services<Config>) => T

export type RunHandler<Config> = (services: Services<Config>) => void

export interface AppDefinition<Config> {
    name?: string
    version?: string
    config: (Omit<ConfigOpts<any, Config>, 'logger' | 'watchChanges'> & { logger?: UniversalLogger, watchChanges?: boolean }) | (() => Config)
    logger?: LoggerOpts | ((services: Partial<Services<Config>>) => UniversalLogger)
    services: ServicesDefinition<Config>
    run: RunHandler<Config>
}

function createDiContainer(builtinServices: Omit<InjectedServices<any>, 'container'>, servicesDefinition: ServicesDefinition<any>): Services<any> {
    const buildingSymbol = Symbol('building')

    const myself: Services<any> = new Proxy({...builtinServices} as InjectedServices<any>, {
        get(services: Services<any>, serviceName: string) {
            if (!services[serviceName]) {
                if (!servicesDefinition[serviceName]) {
                    throw new Error('Unknown service ' + serviceName)
                }
                services[serviceName] = buildingSymbol
                services[serviceName] = servicesDefinition[serviceName](myself)
            }

            if (services[serviceName] === buildingSymbol) {
                throw new Error('Cyclic injections detected')
            }

            return services[serviceName]
        }
    }) as Services<any>

    myself.container = myself

    return myself
}

class App<Config> {
    //protected status: 'READY' | 'RUNNING' = 'READY'
    protected alreadyRun: boolean = false
    protected name: string
    protected shortName: string
    protected version: string
    protected config?: Config
    protected logger?: Logger
    protected services?: Services<Config>
    protected runFn: RunHandler<Config>
    protected abortController = new AbortController
    protected appDefinition: AppDefinition<Config>

    constructor(appDefinition: AppDefinition<Config>) {
        this.name = appDefinition.name || require('./package.json').name
        this.version = appDefinition.version  || require('./package.json').version
        this.shortName = this.name.split('/').reverse()[0]
        this.runFn = appDefinition.run
        this.appDefinition = appDefinition
    }

    protected async prepare() {
        const appDefinition = this.appDefinition

        const defaultConfigArgs: Partial<ConfigOpts<any, any>> = {
            defaultFilename: '/etc/' + this.shortName + '/config.yaml',
            envFilename: this.shortName + '_CONFIG_PATH',
            envPrefix: this.shortName
        }

        const watchEventEmitter = new EventEmitter

        if (appDefinition.logger instanceof Function) {

            throw new Error('Unhandled for the moment')

            // const tmpLogger: Logger = null as any as Logger

            // try {
            //     this.config = appDefinition.config instanceof Function
            //         ? appDefinition.config()
            //         : loadConfig<any, any>({...defaultConfigArgs, ...appDefinition.config, logger: tmpLogger})

            //     this.logger = appDefinition.logger({config: this.config}).child({
            //         appRunUuid: uuid()
            //     })
            // } catch (e) {
            //     e.logs = e
            //     throw e
            // }
            // tmpLogger.transport.messages.forEach(msg => {
            //     this.logger.info(msg)
            // })

        } else {
            this.logger = (new Logger(appDefinition.logger)).child({ appRunUuid: uuid() })
            this.config = appDefinition.config instanceof Function
                ? await appDefinition.config()
                : await loadConfig<any, any>({
                    ...defaultConfigArgs,
                    ...appDefinition.config,
                    logger: this.logger,
                    watchChanges: appDefinition.config.watchChanges
                        ? {
                            abortSignal: this.abortController.signal,
                            eventEmitter: watchEventEmitter,
                        }
                        : undefined
                })
        }

        this.services = createDiContainer({
            config: this.config,
            logger: this.logger,
            appName: this.name,
            appVersion: this.version,
            configWatcher: watchEventEmitter,
            abortController: this.abortController,
            abortSignal: this.abortController.signal
        }, appDefinition.services)
    }

    public async run(abortSignal?: AbortSignal) {
        if (this.alreadyRun) {
            throw new Error('Application already run')
        }

        await this.prepare()

        this.alreadyRun = true

        if (abortSignal) {
            abortSignal.addEventListener('abort', () => this.abortController.abort())
        }

        const processSignalHandler = () => {
            ['SIGTERM', 'SIGINT'].forEach(signal => process.off(signal, processSignalHandler))
            this.abortController.abort()
        }

        ;['SIGTERM', 'SIGINT'].forEach(signal => process.on(signal, processSignalHandler))
        // Add clean up / beforeExitOnError ?
        // Handle unhandled rejections ? process.prependListener

        this.logger!.info('Running', { config: this.config, name: this.name, version: this.version })
        this.runFn(this.services!)
    }
}

export async function runApp<Config>(appDefinition: AppDefinition<Config> & { abortSignal?: AbortSignal }) {
    return await (new App(appDefinition)).run(appDefinition.abortSignal)
}
