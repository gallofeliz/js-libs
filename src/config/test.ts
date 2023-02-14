import {loadConfig} from '.'
import { createLogger } from '@gallofeliz/logger'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema/transformer-def'
import { deepEqual } from 'assert'

export interface Config {
    machin: {
        truc: {
            bidule: boolean
        }
    }
    envShell?: string
}

// @ts-ignore
describe('Config', () => {
    // @ts-ignore
    it('test', async () => {

        process.env.APP_ENVSHELL = 'hello world'
        //const abortController = new AbortController

        //setTimeout(() => abortController.abort(), 10000)

        deepEqual(
            await loadConfig<Config, Config>({
                defaultFilename: __dirname + '/config.test.yml',
                logger: createLogger(),
                envFilename: 'config',
                envPrefix: 'app',
                userProvidedConfigSchema: tsToJsSchema<Config>(),
                // watchChanges: {
                //     abortSignal: abortController.signal,
                //     onChange({config}) {
                //         deepEqual(config, {
                //             machin: {
                //                 truc: {
                //                     bidule: false
                //                 }
                //             },
                //             envShell: 'hello world'
                //         })
                //     }
                // }
            }),
            {
                machin: {
                    truc: {
                        bidule: true
                    }
                },
                envShell: 'hello world'
            }
        )

    })
})
