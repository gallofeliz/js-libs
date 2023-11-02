import { loadConfig, ConfigOpts, WatchChangesEventEmitter } from '@gallofeliz/config'
import { LoggerOpts, Logger, MemoryHandler, ConsoleHandler, LoggerProxyHandler, LogLevel } from '@gallofeliz/logger'
import EventEmitter from 'events'
import { v4 as uuid } from 'uuid'
import { get } from 'lodash'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import { validate } from '@gallofeliz/validate'

export class AbortError extends Error {
    name = 'AbortError'
    code = 'ABORT_ERR'
    constructor(message: string = 'This operation was aborted') {
        super(message)
    }
}

/** @default info */
export type LogLevelWithDefault = LogLevel

export type InjectedServices<Config> = {
    logger: Logger
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
    allowConsoleUse?: boolean
    config?: (Omit<ConfigOpts<any, Config>, 'logger' | 'watchChanges'> & { logger?: Logger, watchChanges?: boolean }) | (() => Config)
    logger?: (Omit<LoggerOpts, 'handlers' | 'errorHandler'> & { logLevelConfigPath?: string }) | ((services: Partial<Services<Config>>) => Logger)
    services?: ServicesDefinition<Config>
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
        this.name = appDefinition.name || require(process.cwd() + '/package.json').name
        this.version = appDefinition.version  || require(process.cwd() + '/package.json').version
        this.shortName = this.name.split('/').reverse()[0]
        this.runFn = appDefinition.run
        this.appDefinition = appDefinition
    }

    protected async prepare() {
        const temporaryLogHandler = new MemoryHandler({
            maxLevel: 'debug',
            minLevel: 'crit'
        })

        this.logger = new Logger({
            handlers: [temporaryLogHandler],
            metadata: { appRunUuid: uuid() }
        })

        let maxLogLevel: LogLevel | undefined

        process.on('warning', async (warning) => {
            await this.logger!.warning(warning.message, {warning})
        })

        // Hack because I don't know why, this event listener is registered again
        // On first call. The code is called twice with listenerCount() to 1 then 2
        const handledRejections: Error[] = []
        process.on('unhandledRejection', async (reason) => {
            if (handledRejections.includes(reason as Error)) {
                return
            }

            handledRejections.push(reason as Error)

            await this.logger!.crit('Unhandled Rejection ; dirty exiting', {reason})

            if (this.logger!.getHandlers()[0] === temporaryLogHandler) {
                const handler = new ConsoleHandler({minLevel: 'crit', maxLevel: 'debug'})
                await Promise.all(temporaryLogHandler.getWrittenLogs().map(log => handler.handle(log)))
            }

            process.exit(1)
        })

        process.on('uncaughtException', async (err, origin) => {
            await this.logger!.crit('UncaughtException ; dirty exiting', {err, origin})

            if (this.logger!.getHandlers()[0] === temporaryLogHandler) {
                const handler = new ConsoleHandler({minLevel: 'crit', maxLevel: 'debug'})
                await Promise.all(temporaryLogHandler.getWrittenLogs().map(log => handler.handle(log)))
            }

            process.exit(1)
        })

        try {
            const appDefinition = this.appDefinition

            const defaultConfigArgs: Pick<ConfigOpts<any, any>, 'userProvidedConfigSchema' | 'defaultFilename' | 'envFilename' | 'envPrefix'> = {
                userProvidedConfigSchema: { type: 'object' },
                defaultFilename: '/etc/' + this.shortName + '/config.yaml',
                envFilename: this.shortName + '_CONFIG_PATH',
                envPrefix: this.shortName
            }

            const watchEventEmitter = new EventEmitter

            const configDef = {
                ...defaultConfigArgs,
                ...appDefinition.config
            }

            if (appDefinition.config) {
                this.config = appDefinition.config instanceof Function
                    ? await appDefinition.config()
                    : await loadConfig<any, any>({
                        ...configDef,
                        logger: this.logger,
                        watchChanges: appDefinition.config?.watchChanges
                            ? {
                                abortSignal: this.abortController.signal,
                                eventEmitter: watchEventEmitter,
                            }
                            : undefined
                    })
                } else {
                    this.config = {} as Config
                }

            if (appDefinition.logger && !(appDefinition.logger instanceof Function) && appDefinition.logger.logLevelConfigPath) {
                maxLogLevel = get(this.config, appDefinition.logger.logLevelConfigPath, 'info') as LogLevel

                validate(maxLogLevel, { schema: tsToJsSchema<LogLevelWithDefault>() })

                if (!(appDefinition.config instanceof Function) && appDefinition.config?.watchChanges) {
                    watchEventEmitter.on('change:' + appDefinition.logger.logLevelConfigPath, ({value}) => {
                        try {
                            validate(value, { schema: tsToJsSchema<LogLevelWithDefault>() })
                        } catch (e) {
                            this.logger!.warning('Invalid log level ; missing config type check ?')
                            return
                        }

                        appLogger.setHandlers([
                            new ConsoleHandler({minLevel: 'crit', maxLevel: value})
                        ])
                    })
                }

            } else {

                const _conf = await loadConfig<any, any>({
                    ...configDef,
                    userProvidedConfigSchema: {
                        type: 'object',
                        properties: {
                            log: {
                                type: 'object',
                                default: {},
                                properties: {
                                    level: tsToJsSchema<LogLevelWithDefault>() //{ enum: levels, default: 'info' }
                                }
                            }
                        }
                    },
                    logger: this.logger,
                    watchChanges: !(appDefinition.config instanceof Function) && appDefinition.config?.watchChanges
                        ? {
                            abortSignal: this.abortController.signal,
                            onChange: ({config: {log: {level: maxLogLevel}}}) => {
                                appLogger.setHandlers([
                                    new ConsoleHandler({minLevel: 'crit', maxLevel: maxLogLevel})
                                ])
                            }
                        }
                        : undefined
                })

                maxLogLevel = _conf.log.level
            }

            if (appDefinition.allowConsoleUse !== true) {
                for (const method in console) {
                    // @ts-ignore
                    console[method] = (...args) => {
                        this.logger!.warning('Used console.' + method + ', please fix it', {args})
                    }
                }
            }

            this.services = createDiContainer({
                config: this.config,
                logger: this.logger,
                appName: this.name,
                appVersion: this.version,
                configWatcher: watchEventEmitter,
                abortController: this.abortController,
                abortSignal: this.abortController.signal
            }, appDefinition.services || {})

            const appLogger = appDefinition.logger instanceof Function
                ? appDefinition.logger(this.services)
                : new Logger({
                    ...appDefinition.logger,
                    handlers: [new ConsoleHandler({minLevel: 'crit', maxLevel: maxLogLevel})]
                })

            this.logger.setHandlers([
                new LoggerProxyHandler({
                    logger: appLogger,
                    minLevel: 'crit',
                    maxLevel: 'debug'
                })
            ])

        } catch (e) {
            this.logger.setHandlers([
                new ConsoleHandler({
                    minLevel: 'crit',
                    maxLevel: 'debug'
                })
            ])

            throw e
        } finally {
            await Promise.all(temporaryLogHandler.getWrittenLogs().map(log => {
                this.logger!.getHandlers()[0].handle(log)
            }))

            temporaryLogHandler.clearWrittenLogs()
        }

        return {
            maxLogLevel
        }
    }

    public async run(abortSignal?: AbortSignal) {
        if (this.alreadyRun) {
            throw new Error('Application already run')
        }

        const {maxLogLevel} = await this.prepare()

        this.alreadyRun = true

        if (abortSignal) {
            if (abortSignal.aborted) {
                return
            }
            abortSignal.addEventListener('abort', () => this.abortController.abort(abortSignal.reason))
        }

        const processSignalHandler = (signal: NodeJS.Signals) => {
            ['SIGTERM', 'SIGINT'].forEach(signal => process.off(signal, processSignalHandler))
            this.abortController.abort(new AbortError('Process receives signal ' + signal))
        }

        ;['SIGTERM', 'SIGINT'].forEach(signal => process.on(signal, processSignalHandler))
        // Add clean up / beforeExitOnError ?

        this.logger!.info('Running app', {
            config: this.config,
            name: this.name,
            version: this.version,
            logLevel: maxLogLevel
        })

        this.abortController.signal.addEventListener('abort', () => {
            this.logger!.info('Abort requested', {reason: this.abortController.signal.reason})
        })

        try {
            await this.runFn(this.services!)
        } catch (e) {
            if (e !== this.abortController.signal.reason && (e as any)?.cause !== this.abortController.signal.reason) {
                throw e
            }
        }

        const experimentalProcess = process as NodeJS.Process & { getActiveResourcesInfo?: () => string[] }

        if (experimentalProcess.getActiveResourcesInfo) {
            this.logger!.debug('Actives resources', { activeResources: experimentalProcess.getActiveResourcesInfo() })
        }

        this.logger!.info('App exited')
    }
}

export async function runApp<Config>(appDefinition: AppDefinition<Config> & { abortSignal?: AbortSignal }) {
    return await (new App(appDefinition)).run(appDefinition.abortSignal)
}
