import { runApp } from '.'
import { Logger } from '@gallofeliz/logger'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema/transformer-def';

interface Config {
    dbPath: string
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
    protected logger: Logger

    constructor(logger: Logger, db: Db) {
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
    it('test', () => {
        return new Promise(resolve => {
            process.env.pikatchu_dbPath = '/usr/local/db/file.db'

            runApp<Config>({
                name: '@gallofeliz/Pikatchu',
                config: {
                    watchChanges: true,
                    userProvidedConfigSchema: tsToJsSchema<UserConfig>()
                },
                services: {
                    userService({logger, db}): UserService {
                        return new UserService(logger, db)
                    },
                    db({config, onConfigChange}): Db {
                        const db = new Db(config.dbPath)

                        onConfigChange(({config, patch}) => {
                            if (patch.some(op => op.path === '/dbPath')) {
                                db.setPath(config.dbPath)
                            }
                        })

                        return db
                    }
                },
                async run({userService, logger, abortSignal, abortController}) {
                    userService.doAJob()
                    let st: NodeJS.Timeout

                    abortSignal.addEventListener('abort', () => {
                        clearTimeout(st)
                        console.log('clean')
                        userService.clean()
                        resolve(undefined)
                    })

                    await new Promise(resolve => st = setTimeout(resolve, 5000))

                    abortController.abort()
                }
            })
        })
    }).timeout(5500)
})
