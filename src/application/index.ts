import loadConfig, { ConfigOpts } from '../config'
import createLogger, { Logger, LoggerOpts } from '../logger'
import { v4 as uuid } from 'uuid'

export type InjectedServices<Config> = {
	logger: Logger
	config: Config
	appName: string
	appVersion: string
}

export type Services<Config> = Record<keyof ServicesDefinition<Config>, any> & InjectedServices<Config>

type ReservedServicesNames = keyof InjectedServices<any>

export type ServicesDefinition<Config> = Record<Exclude<string, ReservedServicesNames>, ServiceDefinition<any, Config>>

export type ServiceDefinition<T, Config> = (services: Services<Config>) => T

export type RunHandler<Config> = (services: Services<Config>, abortSignal: AbortSignal) => Promise<void> | void

export interface AppDefinition<Config> {
	name?: string
	version?: string
	config: ConfigOpts<any, Config> | (() => Config)
	logger?: LoggerOpts | ((services: Partial<Services<Config>>) => Logger)
	services: ServicesDefinition<Config>
	run: RunHandler<Config>
}

// export function waitUntilAborted(signal: AbortSignal) {
// 	return new Promise(resolve => signal.addEventListener('abort', resolve))
// }

function createDiContainer(builtinServices: InjectedServices<any>, servicesDefinition: ServicesDefinition<any>): Services<any> {
	const buildingSymbol = Symbol('building')

	return new Proxy(builtinServices, {
		get(services: Services<any>, serviceName: string) {
			if (!services[serviceName]) {
				if (!servicesDefinition[serviceName]) {
					throw new Error('Unknown service ' + serviceName)
				}
				services[serviceName] = buildingSymbol
				services[serviceName] = servicesDefinition[serviceName](this as Services<any>)
			}

			if (services[serviceName] === buildingSymbol) {
				throw new Error('Cyclic injections detected')
			}

			return services[serviceName]
		}
	})
}

class App<Config> {
	//protected status: 'READY' | 'RUNNING' = 'READY'
	protected alreadyRun: boolean = false
	protected name: string
	protected version: string
	protected config: Config
	protected logger: Logger
	protected services: Services<Config>
	protected runFn: RunHandler<Config>

	constructor(appDefinition: AppDefinition<Config>) {
		this.name = appDefinition.name || require('./package.json').name
		this.version = appDefinition.version  || require('./package.json').version

		this.config = appDefinition.config instanceof Function
			? appDefinition.config()
			: loadConfig<any, any>(appDefinition.config)

		this.logger = (
				appDefinition.logger instanceof Function
				? appDefinition.logger({config: this.config})
				: createLogger(appDefinition.logger)
			).child({
				appRunUuid: uuid()
			})

		this.services = createDiContainer({
			config: this.config,
			logger: this.logger,
			appName: this.name,
			appVersion: this.version
		}, appDefinition.services)

		this.runFn = appDefinition.run
	}

	public async run(abortSignal?: AbortSignal) {
		if (this.alreadyRun) {
			throw new Error('Application already run')
		}

		this.alreadyRun = true

		const abortController = new AbortController
		abortSignal = this.linkSignalWithController(abortSignal, abortController)

		const processSignalHandler = () => {
			abortController.abort()
		}

		;['SIGTERM', 'SIGINT'].forEach(signal => process.on(signal, processSignalHandler))

		try {
			this.logger.info('Starting App', { config: this.config, name: this.name, version: this.version })
			await this.runFn(this.services, abortSignal)
			this.logger.info('App ended')
			// process exit ?
		} catch (e) {
			this.logger.crit('App error', {error: e})
			// Add clean up / beforeExitOnError ?
			// Handle unhandled rejections ? process.prependListener
			// if aborted, don't throw
			throw e
			// process exit ? => Add option ?
		} finally {
			['SIGTERM', 'SIGINT'].forEach(signal => process.off(signal, processSignalHandler))
		}
	}

	protected linkSignalWithController(abortSignal: AbortSignal | undefined, abortController: AbortController) {
		if (abortSignal) {
			abortSignal.addEventListener('abort', () => abortController.abort())
		}
		return abortController.signal
	}
}

export async function runApp<Config>(appDefinition: AppDefinition<Config> & { abortSignal?: AbortSignal }) {
	return await (new App(appDefinition)).run(appDefinition.abortSignal)
}
