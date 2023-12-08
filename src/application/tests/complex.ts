import { runApp, BaseConfig } from '..'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import { Schedule } from '@gallofeliz/scheduler'
import { Logger } from '@gallofeliz/logger'
import { once } from 'events'
import { HttpServer } from '@gallofeliz/http-server'
import execa from 'execa'
import got from 'got'

interface Config extends BaseConfig {
    /** @default {} */
    httpServer: {
        /** @default 8080 */
        port: number
        /** @default {} */
        auth: {
            /** @default admin */
            username: string
            /** @default admin */
            password: string
        }
    }
}

class UsedMemoryService {
    protected logger: Logger

    public constructor(logger: Logger) {
        this.logger = logger
    }

    public async collect(abortSignal: AbortSignal, logger: Logger) {
        logger = logger.child('free-cmd')

        logger.info('Running command')

        if (Math.floor(Math.random() * 5) % 4 === 0) {
            await execa("false")
        }

        const {stdout} = await execa("free -mt | tail -n 1 | awk '{print $3}'", {shell: 'bash'})
        return parseInt(stdout)
    }
}

runApp<Config>({
    config: {
        watchChanges: true,
        schema: tsToJsSchema<Config>()
    },
    name: 'memoryCollector',
    version: '1.4.2',
    logger: {
        processors: [(log) => {
            if (log.config?.httpServer?.auth?.password) {
                log.config.httpServer.auth.password = '***'
            }
            if (log.url && log.method) {
                log.url = log.url.toString().replace(/(?<=\/\/[^:]+:)[^@]+(?=@)/gi, '***')
            }
            if (log.headers?.authorization) {
                log.headers.authorization = log.headers.authorization.split(' ')[0] + ' ***'
            }
            return log
        }]
    },
    services: {
        usedMemoryHistory: () => [],
        usedMemoryService({logger}) {
            return new UsedMemoryService(logger.child('usedMemoryService'))
        },
        usedMemoryHistoryCleaner({usedMemoryHistory, logger, uidGenerator}) {
            const schedule = new Schedule('PT10S')

            schedule.on('lap', () => {
                const jobUid = uidGenerator()
                const jobLogger = logger.child('clean-scheduled-job'/* + jobUid*/, {cleanScheduledJobUuid: jobUid})
                jobLogger.info('Cleaning usedMemoryHistory')
                const nbDeleted = (usedMemoryHistory as Array<any>).splice(5).length
                jobLogger.debug(nbDeleted + ' usedMemoryHistory removed')
            })

            return schedule
        },
        usedMemoryCollectSchedule({logger, usedMemoryService, usedMemoryHistory, uidGenerator, metrics}) {
            const schedule = new Schedule('PT5S')

            schedule.on('lap', async ({abortSignal}) => {
                const jobUid = uidGenerator()
                const jobLogger = logger.child('collect-scheduled-job'/* + jobUid*/, {collectScheduledJob: jobUid})

                jobLogger.info('Collecting memory')
                try {
                    usedMemoryHistory.push({
                        date: new Date,
                        value: await usedMemoryService.collect(abortSignal, jobLogger)
                    })
                    metrics.increment('usedMemory.collect.success')
                } catch (error) {
                    jobLogger.error('Collect failed', {error})
                    metrics.increment('usedMemory.collect.fail')
                }

            })

            return schedule
        },
        apiToConsumeHistory({logger, name, version, config, usedMemoryHistory}) {

            interface EndpointResponse {
                usedMemoryHistory: number[],
                todos: any
            }

            interface ParamsRequest {
                todo: number
            }

            return new HttpServer({
                logger: logger.child('public-server'),
                port: config.httpServer.port,
                auth: {
                    users: [{...config.httpServer.auth, autorisations: '*'}]
                },
                routes: [{
                    path: '/endpoint/:todo',
                    outputBodySchema: tsToJsSchema<EndpointResponse>(),
                    requiredAuthorization: '*',
                    inputParamsSchema: tsToJsSchema<ParamsRequest>(),
                    async handler({abortSignal, params, uid, logger}, {send}) {

                        logger.debug('Calling todo http')

                        const todos = await got({
                            url: 'https://jsonplaceholder.typicode.com/todos/' + params.todo,
                            username: 'root',
                            password: 'secret',
                            timeout: 5000
                        }).json()

                        await send({usedMemoryHistory, todos})
                    }
                }],
                name,
                version,
                swagger: {
                    apiPath: '/swag-api',
                    uiPath: '/'
                }
            })
        }
    },
    async run({logger, abortSignal, usedMemoryCollectSchedule, usedMemoryHistoryCleaner, apiToConsumeHistory}) {
        ;(usedMemoryCollectSchedule as Schedule).start(abortSignal)
        ;(usedMemoryHistoryCleaner as Schedule).start(abortSignal)
        ;(apiToConsumeHistory as HttpServer).start(abortSignal)

        await Promise.all([
            once(usedMemoryCollectSchedule, 'ended'),
            once(usedMemoryHistoryCleaner, 'ended'),
            once(apiToConsumeHistory, 'stopped')
        ])
    }
})

