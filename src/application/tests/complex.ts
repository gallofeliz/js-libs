import { runApp, BaseConfig } from '..'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'
import { runProcess } from '@gallofeliz/run-process'
import { Schedule } from '@gallofeliz/scheduler'
import { Logger } from '@gallofeliz/logger'
import { once } from 'events'
import { HttpServer } from '@gallofeliz/http-server'
import { httpRequest } from '@gallofeliz/http-request'

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
        if (Math.floor(Math.random() * 5) % 4 === 0) {
            await runProcess({
                logger: logger.child('cmd-free'),
                abortSignal,
                command: "false",
            })
        }

        return parseInt(await runProcess({
            logger: logger.child('cmd-free'),
            abortSignal,
            command: "free -mt | tail -n 1 | awk '{print $3}'",
            outputType: 'text'
        }))
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
        usedMemoryHistoryCleaner({usedMemoryHistory, logger}) {
            return new Schedule({
                when: 'PT10S',
                logger: logger.child('clean-schedule'),
                fn({logger}) {
                    logger!.info('Cleaning usedMemoryHistory')
                    const nbDeleted = (usedMemoryHistory as Array<any>).splice(5).length
                    logger!.debug(nbDeleted + ' usedMemoryHistory removed')
                }
            })
        },
        usedMemoryCollectSchedule({logger, usedMemoryService, usedMemoryHistory}) {
            // return new Schedule({
            //     when: 'PT5S',
            //     abortFnCallsOnAbort: true,
            //     logger: logger.child('collect-schedule'),
            //     fn: async ({abortSignal, logger}) => {
            //         logger!.info('Collecting memory')
            //         usedMemoryHistory.push({
            //             date: new Date,
            //             value: await usedMemoryService.collect(abortSignal, logger)
            //         })
            //     },
            //     onError: (error) => logger.warning('Memory collect failed', {error})
            // })
        },
        apiToConsumeHistory({logger, appName, appVersion, config, usedMemoryHistory}) {

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
                        const todos = await httpRequest({
                            url: 'https://jsonplaceholder.typicode.com/todos/' + params.todo,
                            logger: logger.child('todo-http-req'),
                            abortSignal,
                            auth: {username: 'root', password: 'secret'},
                            timeout: 5000,
                            responseType: 'json'
                        })

                        await send({usedMemoryHistory, todos})
                    }
                }],
                name: appName,
                version: appVersion,
                swagger: {
                    apiPath: '/swag-api',
                    uiPath: '/'
                }
            })
        }
    },
    async run({logger, abortSignal, usedMemoryCollectSchedule, usedMemoryHistoryCleaner, apiToConsumeHistory}) {
        ;(usedMemoryCollectSchedule as Schedule).start(abortSignal)
        //;(usedMemoryHistoryCleaner as Schedule).start(abortSignal)
        //;(apiToConsumeHistory as HttpServer).start(abortSignal)

        await Promise.all([
            once(usedMemoryCollectSchedule, 'ended'),
            once(usedMemoryHistoryCleaner, 'ended'),
            //once(apiToConsumeHistory, 'stopped')
        ])
    }
})

