import runProcess, { ProcessConfig } from './process'
import httpRequest, { HttpRequestConfig } from './http-request'
import { Logger } from './logger'
import { Schema } from './validate'

/*
	Hard to find a good name
	This component provides a way to use an user-config to call a service (command, http, etc)
*/
export interface UserCommunicateConfig {
	userConfig: (
		{ type: 'http' }
		& Pick<HttpRequestConfig,
			'url' | 'method' | 'timeout' | 'retries' | 'headers' | 'responseType'
			| 'responseTransformation' | 'auth' | 'bodyType'
		>
	) | (
		{ type: 'command' }
		& Pick<ProcessConfig,
			'cmd' | 'args' | 'cwd' | 'env' | 'timeout' | 'retries' | 'outputType'
			| 'outputTransformation' | 'killSignal' | 'inputType'
		>
	)
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
			let cmdDataMapping: Partial<ProcessConfig> = {}

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