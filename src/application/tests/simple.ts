import { runApp, BaseConfig } from '..'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import { httpRequest } from '@gallofeliz/http-request'

interface Config extends BaseConfig {
    httpEndpoint: string
    /** @default 5000 */
    timeout: number
    query?: string
}

runApp<Config>({
    config: {
        schema: tsToJsSchema<Config>()
    },
    consoleUse: 'accepted',
    async run({logger, config, abortSignal}) {
        const response = await httpRequest({
            url: config.httpEndpoint,
            timeout: config.timeout,
            logger: logger.child({name: 'httpToEndpoint'}),
            responseType: 'json',
            abortSignal,
            responseTransformation: config.query
        })

        console.log('>>', 'Your request is', response, '<<')
    }
})
