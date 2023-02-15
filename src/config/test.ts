import {loadConfig, WatchChangesEventEmitter} from '.'
import { createLogger } from '@gallofeliz/logger'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema/transformer-def'
import { deepEqual } from 'assert'
import EventEmitter from 'events'

export interface Config {
    machin: {
        truc: {
            bidule: boolean
        }
        // users: Array<{
        //     name: string
        // }>
    }
    envShell?: string
}

// @ts-ignore
describe('Config', () => {
    // @ts-ignore
    it('test', async () => {

        process.env.APP_ENVSHELL = 'hello world'

        deepEqual(
            await loadConfig<Config, Config>({
                defaultFilename: __dirname + '/config.test.yml',
                logger: createLogger(),
                envFilename: 'config',
                envPrefix: 'app',
                userProvidedConfigSchema: tsToJsSchema<Config>(),
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

    // @ts-ignore
    it.skip('watch-test', async () => {

        process.env.APP_ENVSHELL = 'hello world'
        const abortController = new AbortController

        setTimeout(() => abortController.abort(), 10000)

        const eventEmitter: WatchChangesEventEmitter<Config> = new EventEmitter

        eventEmitter.on('change', ({config, patch}) => {
            console.log('events change', config, patch)
        })

        eventEmitter.on('change:machin.truc', ({config, value}) => {
            console.log('events change machin truc', config, value)
        })

        deepEqual(
            await loadConfig<Config, Config>({
                defaultFilename: __dirname + '/config.test.yml',
                logger: createLogger(),
                envFilename: 'config',
                envPrefix: 'app',
                userProvidedConfigSchema: tsToJsSchema<Config>(),
                watchChanges: {
                    abortSignal: abortController.signal,
                    eventEmitter,
                    onChange({config, patch}) {
                        console.log('onChange', patch, config)
                    }
                }
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
