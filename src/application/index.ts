import loadConfig, { ConfigOpts } from '../config'
import { handleExitSignals } from '../exit-handle'
import createLogger, { Logger } from '../logger'
import exitHook from 'exit-hook'

export type Services<Config> = Record<keyof ServicesDefinition<Config>, any> & {
	logger: Logger
	config: Config
}

export interface App {
	abort(): void
}

export type ServicesDefinition<Config> = Record<string, ServiceDefinition<any, Config>>

export type ServiceDefinition<T, Config> = (services: Services<Config>) => T

export interface AppDefinition<Config> {
	config: ConfigOpts<any, Config> | (() => Config)
	logger?: { level?: string } | (() => Logger)
	services: ServicesDefinition<Config>
	run(services: Services<Config>, abortSignal: AbortSignal): void
}

export function waitUntilAborted(signal: AbortSignal) {
	return new Promise(resolve => signal.addEventListener('abort', resolve))
}

export async function runApp<Config>(appDefinition: AppDefinition<Config>) {
	const config = appDefinition.config instanceof Function
		? appDefinition.config()
		: loadConfig<any, any>(appDefinition.config)

	const logger = appDefinition.logger instanceof Function
		? appDefinition.logger()
		: createLogger(appDefinition.logger?.level || config.log?.level)

	const services: Services<Config> = {
		config,
		logger
	}

	const buildingSymbol = Symbol('building')

	const servicesProxy = new Proxy(services, {
		get(services, serviceName: string) {
			if (!services[serviceName]) {
				if (!appDefinition.services[serviceName]) {
					throw new Error('Unknown service ' + serviceName)
				}
				services[serviceName] = buildingSymbol
				services[serviceName] = appDefinition.services[serviceName](servicesProxy)
			}

			if (services[serviceName] === buildingSymbol) {
				throw new Error('Cyclic injections detected')
			}

			return services[serviceName]
		}
	})

	const abortController = new AbortController
	const abortSignal = abortController.signal

	function onProcessExit() {
		logger.info('App interruption')
		abortController.abort()
	}

	const removeExitHook = exitHook(onProcessExit)

	logger.info('Starting App', { config })

	try {
		await appDefinition.run(servicesProxy as any, abortSignal)
		logger.info('App ended')
		removeExitHook()
	} catch (error) {
		logger.crit('App error', {error})
		removeExitHook()
		abortController.abort() // I am not sure it is sementic correct but globally we want to abort the app run flow
		throw error
	}
}