import createLogger from '../logger'
import HttpServer, { HttpServerRequest, HttpServerResponse } from '../http-server'
import httpRequest from '../http-request'
import runProcess from '../process'

const logger = createLogger('info')

const server = new HttpServer({
    port: 8080,
    logger,
    auth: {
        users: [
            {
                username: 'user',
                password: 'pass',
                autorisations: ['manager'] // ressources ? [{ auth: 'read-book', ressources: ['1', '2'] }] or ['read-book-1', 'read-book-1']
            },
            {
                username: 'boss',
                password: 'boss',
                autorisations: ['admin']
            },
            {
                username: 'non',
                password: 'non',
                autorisations: ['book-read']
            }
        ],
        autorisationsPolicies: {
            manager: ['talki-read'],
            admin: '*'
        }
    },
    api: {
        routes: [
            {
                path: '/process',
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
                    autorisations: ['talki-read']
                },
                async handler({query, params, user}: HttpServerRequest<{id: number}, {onlyIt: boolean}>, {send}: HttpServerResponse<string>) {
                    if (query.onlyIt) {
                        send(params.id.toString())
                        return
                    }

                    send('hello ' + user!.username + ', you want talki n°' + params.id)

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
