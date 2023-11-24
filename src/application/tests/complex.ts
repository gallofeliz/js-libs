
interface Config extends BaseConfig {
    dbPath: string
    //loglevel?: string
}

type InputConfig = Config

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


    it('test', async () => {
        process.env.pikatchu_dbPath = '/usr/local/db/file.db'

        const run = runApp<Config>({
            name: '@gallofeliz/Pikatchu',
            config: {
                watchChanges: true,
                userProvidedConfigSchema: tsToJsSchema<InputConfig>()
            },
            // allowConsoleUse: true,
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
            async run({userService, logger, abortSignal}) {
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

    it('test', async () => {
        process.env.pikatchu_dbPath = '/usr/local/db/file.db'

        const run = runApp<Config>({
            name: '@gallofeliz/Pikatchu',
            config: {
                watchChanges: true,
                userProvidedConfigSchema: tsToJsSchema<InputConfig>()
            },
            // allowConsoleUse: true,
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
            async run({userService, logger, abortSignal}) {
                userService.doAJob()

                abortSignal.addEventListener('abort', () => {
                    console.log('NOOOOOOOOOOOOOOOOOOOOOOO')
                    userService.clean()
                })

                logger.info('I did my work bro')
            }
        })

        await setTimeout(1000)

        process.once('SIGINT', () => {})

        process.kill(process.pid, 'SIGINT')

        await run
    }).timeout(10000)


    it('test', async () => {
        process.env.pikatchu_dbPath = '/usr/local/db/file.db'

        const myAbortController = new AbortController

        const run = runApp<Config>({
            name: '@gallofeliz/Pikatchu',
            config: {
                watchChanges: true,
                userProvidedConfigSchema: tsToJsSchema<InputConfig>()
            },
            abortSignal: myAbortController.signal,
            // allowConsoleUse: true,
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
            async run({userService, logger, abortSignal}) {
                userService.doAJob()

                abortSignal.addEventListener('abort', () => {
                    console.log('NOOOOOOOOOOOOOOOOOOOOOOO')
                    userService.clean()
                })

                logger.info('I did my work bro')
            }
        })

        await setTimeout(1000)
        myAbortController.abort()

        await run
    }).timeout(10000)