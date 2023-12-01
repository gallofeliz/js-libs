import { loadConfig, ConfigOpts, WatchChangesEventEmitter } from '@gallofeliz/config'
import { createLogger, Logger, LoggerOpts, ConsoleHandler, BreadCrumbHandler, LogLevel, createJsonFormatter, createLogfmtFormatter } from '@gallofeliz/logger'
import EventEmitter from 'events'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import shortUuid from 'short-uuid'

export * from './utils'

export interface BaseConfig {
    /** @default {} */
    log: {
        /** @default info */
        level: LogLevel
        /** @default json */
        format: 'json' | 'logfmt'
    }
}

export enum ExitCodes {
    unexpected=1,
    invalidConfig=2,
    appError=3,
    appAbort=4,
    providedSignalAbort=5,
    SIGTERM=143,
    SIGINT=130
}

export type UidGenerator = () => string

export type InjectedServices<Config extends BaseConfig> = {
    logger: Logger
    config: Config
    appName: string
    appVersion: string
    container: Services<Config>
    configWatcher: WatchChangesEventEmitter<Config>
    abortController: AbortController
    abortSignal: AbortSignal
    uidGenerator: UidGenerator
}

export type Services<Config extends BaseConfig> = Record<keyof ServicesDefinition<Config>, any> & InjectedServices<Config>

type ReservedServicesNames = keyof InjectedServices<any>

export type ServicesDefinition<Config extends BaseConfig> = Record<Exclude<string, ReservedServicesNames>, ServiceDefinition<any, Config>>

export type ServiceDefinition<T, Config extends BaseConfig> = (services: Services<Config>) => T

export type RunHandler<Config extends BaseConfig> = (services: Services<Config>) => void

export interface AppDefinition<Config extends BaseConfig> {
    name: string
    version: string
    consoleUse?: 'accepted' | 'to-log' | 'block&warn' | 'block'
    config?: Omit<ConfigOpts<Config>, 'logger' | 'watchChanges'> & { watchChanges?: boolean }
    logger?: Omit<LoggerOpts, 'handlers' | 'errorHandler' | 'id'>
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

class App<Config extends BaseConfig> {
    //protected status: 'READY' | 'RUNNING' = 'READY'
    protected alreadyRun: boolean = false
    protected name: string
    protected version: string
    protected config?: Config
    protected logger?: Logger
    protected services?: Services<Config>
    protected runFn: RunHandler<Config>
    protected abortController = new AbortController
    protected appDefinition: AppDefinition<Config>

    constructor(appDefinition: AppDefinition<Config>) {
        this.name = appDefinition.name
        this.version = appDefinition.version
        this.runFn = appDefinition.run
        this.appDefinition = appDefinition
    }

    public async run(abortSignal?: AbortSignal) {
        if (this.alreadyRun) {
            throw new Error('Application already run')
        }

        this.alreadyRun = true

        if (abortSignal?.aborted) {
            return
        }

        abortSignal?.addEventListener('abort', (reason) => {
            fwtLogger.info('Abort requested by provided signal ; aborting', {reason})
            this.abortController.abort()
        }, {signal: this.abortController.signal})

        const uidGenerator = () => shortUuid.generate().substring(0, 10)
        const runUid = uidGenerator()

        const loggerHandler = new BreadCrumbHandler({
            handler: new ConsoleHandler({
                maxLevel: 'debug',
                minLevel: 'fatal',
                formatter: createJsonFormatter()
            }),
            flushMaxLevel: 'warning',
            passthroughMaxLevel: 'debug'
        })

        this.logger = createLogger({
            ...this.appDefinition.logger,
            metadata: {
                ...this.appDefinition.logger?.metadata || {},
                [this.name + 'Version']: this.version,
                [this.name + 'RunUid']: runUid,
                appName: this.name,
            },
            id: this.name,
            //id: 'app_' + uuid().split('-')[0],  //{ name: 'app', uid: uuid() },
            handlers: [loggerHandler]
        })

        const fwtLogger = this.logger.child('fwt')

        const onWarning = async(warning: Error) => {
            await fwtLogger.warning(warning.message, {warning})
        }

        // Hack because I don't know why, this event listener is registered again
        // On first call. The code is called twice with listenerCount() to 1 then 2
        const handledRejections: Error[] = []
        const onUnhandledRejection = async(reason: Error) => {
            if (handledRejections.includes(reason as Error)) {
                return
            }

            handledRejections.push(reason as Error)

            await fwtLogger.fatal('Unhandled Rejection ; dirty exiting', {reason})

            process.exit(ExitCodes.unexpected)
        }

        const onUncaughtException = async(err: Error, origin: NodeJS.UncaughtExceptionOrigin) => {
            await fwtLogger.fatal('UncaughtException ; dirty exiting', {err, origin})

            process.exit(ExitCodes.unexpected)
        }

        const signalsToHandle = ['SIGTERM', 'SIGINT']
        let receivedSignal: 'SIGTERM' | 'SIGINT' | undefined
        const onProcessSignal = async (signal: 'SIGTERM' | 'SIGINT') => {
            receivedSignal = signal
            fwtLogger.info('Process receives signal ' + signal + ' ; aborting')
            this.abortController.abort()
        }

        signalsToHandle.forEach(signal => process.once(signal, onProcessSignal))
        process.on('warning', onWarning)
        process.on('unhandledRejection', onUnhandledRejection)
        process.on('uncaughtException', onUncaughtException)

        this.abortController.signal.addEventListener('abort', () => {
            process.off('warning', onWarning)
            process.off('unhandledRejection', onUnhandledRejection)
            process.off('uncaughtException', onUncaughtException)
            signalsToHandle.forEach(signal => process.off(signal, onProcessSignal))
        })

        const defaultConfigArgs: Pick<ConfigOpts<any>, 'schema' | 'defaultFilename' | 'envFilename' | 'envPrefix'> = {
            schema: tsToJsSchema<BaseConfig>(),
            defaultFilename: '/etc/' + this.name + '/config.yaml',
            envFilename: this.name + '_CONFIG_PATH',
            envPrefix: this.name,
        }

        const watchEventEmitter = new EventEmitter

        if (this.appDefinition.config?.watchChanges) {
            watchEventEmitter.on('error', (error: Error) => {
                fwtLogger.warning('Config watch error', {error})
            })
            watchEventEmitter.on('change', ({patch}) => {
                fwtLogger.info('Configuration change detected', { changes: patch })
            })
        }

        try {
            this.config = await loadConfig<Config>({
                ...defaultConfigArgs,
                ...this.appDefinition.config,
                watchChanges: this.appDefinition.config?.watchChanges
                    ? {
                        abortSignal: this.abortController.signal,
                        eventEmitter: watchEventEmitter
                    }
                    : undefined
            })
        } catch (error) {
            fwtLogger.fatal('Config load fails', {
                error,
                schema: this.appDefinition.config?.schema
            })
            process.exitCode = ExitCodes.invalidConfig
            this.abortController.abort()
            return
        }

        if (!this.config!.log?.level) {
            fwtLogger.fatal('Unexpected not loaded BaseConfig (development problem)')
            process.exitCode = ExitCodes.unexpected
            this.abortController.abort()
            return
        }

        loggerHandler.setLevels({passthroughMaxLevel: this.config!.log.level})
        loggerHandler.setFormatter(this.config!.log.format === 'json'
            ? createJsonFormatter()
            : createLogfmtFormatter()
        )

        if (this.appDefinition.config?.watchChanges) {
            watchEventEmitter.on('change:log.level', ({value}) => {
                //this.config!.log.level = value
                fwtLogger.info('Reconfigure logger level', {level: value})
                loggerHandler.setLevels({passthroughMaxLevel: value})
            })
        }

        const consoleMethods = {}
        for (const method in console) {
            // @ts-ignore
            consoleMethods[method] = console[method]
        }

        this.abortController.signal.addEventListener('abort', () => {
            for (const method in consoleMethods) {
                // @ts-ignore
                console[method] = consoleMethods[method]
            }
        })

        switch(this.appDefinition.consoleUse) {
            case 'accepted':
                break
            case 'block':
                for (const method in console) {
                    // @ts-ignore
                    console[method] = () => {}
                }
                break
            case 'to-log':
                throw new Error('todo')
                break
            case 'block&warn':
            default:
                for (const method in console) {
                    // @ts-ignore
                    console[method] = (...args) => {
                        fwtLogger.warning('Used console.' + method + ', please fix it', {args})
                    }
                }
        }

        this.services = createDiContainer({
            config: this.config,
            logger: this.logger,
            appName: this.name,
            appVersion: this.version,
            configWatcher: watchEventEmitter,
            abortController: new AbortController,
            abortSignal: this.abortController.signal,
            uidGenerator
        }, this.appDefinition.services || {})

        this.services.abortController.signal.addEventListener('abort', (reason) => {
            fwtLogger.info('Abort requested by app ; aborting', {reason})
            this.abortController.abort()
        }, {signal: this.abortController.signal})

        if (this.appDefinition.config) {
            fwtLogger.info('Config schema', {
                schema: this.appDefinition.config.schema
            })
        }

        fwtLogger.info('Running app', {
            config: this.config,
            name: this.name,
            version: this.version,
            runUid,
            logLevel: this.config!.log.level,
            logFormat: this.config!.log.format
        })

        try {
            await this.runFn(this.services!)
            if (this.abortController.signal.aborted) {
                throw this.abortController.signal.reason
            }
            fwtLogger.info('App ended')
            process.exitCode = 0
        } catch (error) {
            if (this.abortController.signal.aborted) {

                fwtLogger.info('App aborted')

                if (abortSignal?.aborted) {
                    process.exitCode = ExitCodes.providedSignalAbort
                } else if (this.services.abortController.signal.aborted) {
                    process.exitCode = ExitCodes.appAbort
                } else if (receivedSignal) {
                    process.exitCode = ExitCodes[receivedSignal]
                } else {
                    process.exitCode = ExitCodes.unexpected
                }

                const isAbortReason = error === this.abortController.signal.reason
                const isAboutAborting = error instanceof Error && (error as Error & {cause?:any}).cause === this.abortController.signal.reason

                if (!(isAbortReason || isAboutAborting)) {
                    fwtLogger.warning('Error thrown while aborted', {error})
                }

                return
            }

            fwtLogger.fatal('App exited with error', {error})
            process.exitCode = ExitCodes.appError
        } finally {
            this.abortController.abort()
        }
    }
}

export async function runApp<Config extends BaseConfig>(appDefinition: AppDefinition<Config> & { abortSignal?: AbortSignal }) {
    return await (new App(appDefinition)).run(appDefinition.abortSignal)
}
