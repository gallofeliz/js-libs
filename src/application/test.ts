import { runApp } from '.'
import { UniversalLogger } from '@gallofeliz/logger'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import { setTimeout } from 'timers/promises'

interface Config {
    dbPath: string
    //loglevel?: string
}

type UserConfig = Config

class Db {
    protected path: string
    constructor(path: string) {
        this.path = path
    }
    setPath(path: string) {
        this.path = path
    }
}

class UserService {
    protected logger: UniversalLogger

    constructor(logger: UniversalLogger, db: Db) {
        this.logger = logger
        console.log('db', db)
    }

    doAJob() {
        this.logger.info('I do a job')
    }

    clean() {
        this.logger.info('I am cleaning')
    }
}

// @ts-ignore
describe('Application', () => {
    // @ts-ignore
    it('test', async () => {
        process.env.pikatchu_dbPath = '/usr/local/db/file.db'

        const run = runApp<Config>({
            name: '@gallofeliz/Pikatchu',
            config: {
                watchChanges: true,
                userProvidedConfigSchema: tsToJsSchema<UserConfig>()
            },
            allowConsoleUse: true,
            /*logger: {
                logLevelConfigPath: 'loglevel'
            },*/
            services: {
                userService({logger, db}): UserService {
                    return new UserService(logger, db)
                },
                db({config, configWatcher}): Db {
                    const db = new Db(config.dbPath)

                    configWatcher.on('change:dbPath', ({value}) => db.setPath(value as string))

                    return db
                }
            },
            async run({userService, logger, abortSignal, abortController}) {
                userService.doAJob()

                abortSignal.addEventListener('abort', () => {
                    console.log('clean')
                    userService.clean()
                })

                console.warn('I am calling console warn')

                await setTimeout(15000, undefined, { signal: abortSignal })
            }
        })

        await setTimeout(1000)
        process.kill(process.pid, 'SIGINT')

        await run
    }).timeout(10000)
})

