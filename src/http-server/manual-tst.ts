import createLogger from '../logger'
import HttpServer, { HttpServerRequest, HttpServerResponse } from '../http-server'
import httpRequest from '../http-request'
import runProcess from '../process'

const logger = createLogger('info')

const server = new HttpServer({
    port: 8080,
    logger,
    auth: {
        users: [{
            username: 'papa',
            password: 'papa',
            roles: ['bizounours', 'bigboss']
        }],
        extendedRoles: {
            bigboss: ['smallboss'],
            smallboss: ['talk', 'walk']
        }
    },
    api: {
        routes: [
            {
                path: '/process',
                auth: {
                    required: false
                },
                async handler({logger}) {
                    runProcess({
                        command: 'ls',
                        logger
                    })

                }
            },
            // {
            //     path: '/sleep',
            //     auth: {
            //         required: false
            //     },
            //     async handler({abortSignal, rawRes}) {
            //         abortSignal.addEventListener('abort', () => {
            //             console.log('Adios')
            //         })
            //         return rawRes
            //     }
            // },
            {
                method: 'GET',
                inputParamsSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'number' }
                    }
                },
                inputQuerySchema: {
                    type: 'object',
                    properties: {
                        onlyIt: { type: 'boolean' }
                    }
                },
                path: '/talki/:id',
                auth: {
                    roles: ['talk']
                },
                async handler({query, params}: HttpServerRequest<{id: number}, {onlyIt: boolean}>, {send}: HttpServerResponse<string>) {
                    if (query.onlyIt) {
                        send(params.id.toString())
                        return
                    }

                    send('hello member n°' + params.id)

                }
            },
            // {
            //     method: 'GET',
            //     path: '/walki',
            //     auth: {
            //         roles: ['danse', 'walk']
            //     },
            //     async handler() {
            //          {
            //             code: 201,
            //             body: 'I am walki'
            //         }
            //     }
            // },
            // {
            //     method: 'GET',
            //     path: '/moki',
            //     auth: {
            //         roles: ['danse', 'sing']
            //     },
            //     async handler({req, res}) {
            //         res.send('yes')
            //     }
            // },
            // {
            //     method: 'GET',
            //     path: '/public/:pass',
            //     auth: {
            //         required: false
            //     },
            //     async handler({req, res}) {
            //         res.send(server.getAuth()!.validate('papa', req.params.pass, ['bizounours']))
            //     }
            // },

        ]
    }
})

server.start()
