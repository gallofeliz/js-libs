import loadConfig, { ConfigOpts } from '../config'
import { handleExitSignals } from '../exit-handle'
import createLogger, { Logger } from '../logger'

export type Services<Config> = Record<keyof ServicesDefinition<Config>, any> & {
	logger: Logger
	config: Config
}

export type ServicesDefinition<Config> = Record<string, ServiceDefinition<any, Config>>

export type ServiceDefinition<T, Config> = (services: Services<Config>) => T

export interface AppDefinition<Config> {
	config: ConfigOpts<any, Config> | (() => Config)
	logger?: { level?: string } | (() => Logger)
	services: ServicesDefinition<Config>
	start(services: Services<Config>): void
	stop?(services: Services<Config>): void
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

	logger.info('Starting App')
	appDefinition.start(servicesProxy as any)
	handleExitSignals(() => {
		logger.info('Stopping App')
		if (appDefinition.stop) {
			appDefinition.stop(servicesProxy as any)
		}
	})
}