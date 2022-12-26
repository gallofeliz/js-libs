import runProcess, { ReferenceProcessConfig } from './process'
import httpRequest, { HttpRequestConfig } from './http-request'
import { Logger } from './logger'
import { Schema } from './validate'

/*
	Hard to find a good name
	This component provides a way to use an user-config to call a service (command, http, etc)
*/

export type HttpUserConfig = { type: 'http' }
	& Pick<HttpRequestConfig,
		'url' | 'method' | 'timeout' | 'retries' | 'headers' | 'responseType'
		| 'responseTransformation' | 'auth' | 'bodyType'
	>

export type CommandUserConfig = { type: 'command' }
	& Pick<ReferenceProcessConfig,
		'command' | 'cwd' | 'env' | 'timeout' | 'retries' | 'outputType'
		| 'outputTransformation' | 'killSignal' | 'inputType'
	>

export type UserConfig = HttpUserConfig | CommandUserConfig

export interface UserCommunicateConfig {
	userConfig: UserConfig
	logger: Logger,
	abortSignal?: AbortSignal
	data?: any
	resultSchema?: Schema
}

export default async function communicate<Result extends any>(config: UserCommunicateConfig): Promise<Result> {
	switch(config.userConfig.type) {
		case 'http':
			let httpDataMapping: Partial<HttpRequestConfig> = {}
			if (config.data) {
				if ((config.userConfig.method || 'GET') === 'GET') {
					// flatten ? {'a[b]': 'c'} for {a:{b:'c'}}
					// Inside a single key With format json ?
					if (config.data instanceof Object) {
						httpDataMapping.params = config.data
					} else {
						// Choose the key ?
						httpDataMapping.params = { data: config.data }
					}
				} else {
					httpDataMapping.bodyData = config.data
				}
			}

			return httpRequest({
				...config.userConfig,
				...config,
				...httpDataMapping
			})
		case 'command':
			let cmdDataMapping: Partial<ReferenceProcessConfig> = {}

			// Give ability to data as arg ?
			if (config.data) {
				cmdDataMapping.inputData = config.data
			}

			return runProcess({
				...config.userConfig,
				...config,
				...cmdDataMapping
			}, true)
		default:
			throw new Error('Unexpected you here')
	}
}