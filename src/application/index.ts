import loadConfig, { ConfigOpts } from '../config'
import { Logger, LoggerOpts } from '../logger'
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

export type RunHandler<Config> = (services: Services<Config>, abortSignal: AbortSignal) => void

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

	const myself = new Proxy({...builtinServices}, {
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
	})

	return myself
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
				: new Logger(appDefinition.logger)
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
			['SIGTERM', 'SIGINT'].forEach(signal => process.off(signal, processSignalHandler))
			abortController.abort()
		}

		;['SIGTERM', 'SIGINT'].forEach(signal => process.on(signal, processSignalHandler))
		// Add clean up / beforeExitOnError ?
		// Handle unhandled rejections ? process.prependListener

		this.logger.info('Running', { config: this.config, name: this.name, version: this.version })
		this.runFn(this.services, abortSignal)
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