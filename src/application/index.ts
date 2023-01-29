import loadConfig, { ConfigOpts } from '../config'
import createLogger, { Logger } from '../logger'
import exitHook from 'exit-hook'
import { v4 as uuid } from 'uuid'

export type InjectedServices<Config> = {
	logger: Logger
	config: Config
	appName: string
	appVersion: string
}

export type Services<Config> = Record<keyof ServicesDefinition<Config>, any> & InjectedServices<Config>

export interface App {
	abort(): void
}

type ReservedServicesNames = keyof InjectedServices<any>

export type ServicesDefinition<Config> = Record<Exclude<string, ReservedServicesNames>, ServiceDefinition<any, Config>>

export type ServiceDefinition<T, Config> = (services: Services<Config>) => T

export interface AppDefinition<Config> {
	name?: string
	version?: string
	config: ConfigOpts<any, Config> | (() => Config)
	logger?: { level?: string } | ((config: Config) => Logger)
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

	const logger = (
			appDefinition.logger instanceof Function
			? appDefinition.logger(config)
			: createLogger(appDefinition.logger?.level || config.log?.level)
		).child({
		appRunUuid: uuid()
	})

	const services: Services<Config> = {
		config,
		logger,
		appName: appDefinition.name || require('./package.json').name,
		appVersion: appDefinition.version || require('./package.json').version
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

	logger.info('Starting App', { config, name: services.appName, version: services.appVersion })

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