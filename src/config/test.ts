import {loadConfig, WatchChangesEventEmitter} from '.'
import { createLogger, LogLevel } from '@gallofeliz/logger'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import { deepEqual } from 'assert'
import EventEmitter from 'events'
import { readFile, writeFile } from 'fs/promises'
import { setTimeout } from 'timers/promises'

interface BaseConfig {
    log: {
        level: LogLevel
    }
}

interface Config extends BaseConfig {
    machin: {
        truc: {
            bidule: boolean
        }
        // users: Array<{
        //     name: string
        // }>
    }
    envShell?: string
    deep: {
        config: boolean
    }
    users: Array<{login: string, password: string}>
}

type AppConfig = Config

type UserConfig = AppConfig

// @ts-ignore
describe('Config', () => {
    // @ts-ignore
    it('test', async () => {

        process.env.APP_ENVSHELL = 'hello world'

        process.env.APP_DEEP_CONFIG = 'true'

        process.env.APP_LOG_LEVEL = 'warning'

        deepEqual(
            await loadConfig<Config, Config>({
                defaultFilename: __dirname + '/config.test.yml',
                logger: createLogger(),
                envFilename: 'config',
                envPrefix: 'app',
                userProvidedConfigSchema: tsToJsSchema<UserConfig>(),
            }),
            {
                log: {
                    level: 'warning'
                },
                machin: {
                    truc: {
                        bidule: true
                    }
                },
                envShell: 'hello world',
                deep: {
                    config: true
                },
                users: [
                  {
                    login: 'Gilles',
                    password: '1234'
                  },
                  {
                    login: 'Guigui',
                    password: 'abcd'
                  }
                ]

            }
        )

    })

    // @ts-ignore
    it('watch-test', async () => {

        process.env.APP_ENVSHELL = 'hello world'
        const abortController = new AbortController

        const eventEmitter: WatchChangesEventEmitter<Config> = new EventEmitter

        eventEmitter.on('change', ({config, patch}) => {
            console.log('events change', config, patch)
        })

        eventEmitter.on('change:machin.truc', ({config, value}) => {
            console.log('events change machin truc', config, value)
        })

        eventEmitter.on('change:users', ({config, value}) => {
            console.log('events change users', config, value)
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
                log: {
                    level: 'warning'
                },
                machin: {
                    truc: {
                        bidule: true
                    }
                },
                envShell: 'hello world',
                deep: {
                    config: true
                },
                users: [
                  {
                    login: 'Gilles',
                    password: '1234'
                  },
                  {
                    login: 'Guigui',
                    password: 'abcd'
                  }
                ]
            }
        )

        await setTimeout(100)

        const originalContent = await readFile(__dirname + '/config2.test.yml', {encoding: 'utf8'})
        await writeFile(__dirname + '/config2.test.yml', originalContent.replace('abcd', 'abcde'))

        await setTimeout(100)

        await writeFile(__dirname + '/config2.test.yml', originalContent.replace('abcde', 'abcd'))

        await setTimeout(100)
        abortController.abort()

    })
})
