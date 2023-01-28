import createLogger from '../logger'
import HttpServer, { HttpServerRequest, HttpServerResponse } from '../http-server'
import httpRequest from '../http-request'
import runProcess from '../process'

const logger = createLogger('info')

const server = new HttpServer({
    port: 8080,
    name: 'My Test API',
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
                autorisations: ['book-read', 'talki-read']
            }
        ],
        anonymAutorisations: ['PUBLIC'],
        autorisationsPolicies: {
            manager: ['talki-read', 'talki-write'],
            admin: '*'
        }
    },
    api: {
        routes: [
            {
                description: 'Welcome route !',
                path: '/welcome',
                auth: {
                    autorisations: ['PUBLIC']
                },
                outputBodySchema: {
                    type: 'object',
                    properties: {
                        message: {type: 'string'}
                    }
                },
                async handler(_, {send}) {
                    send({message: 'Welcome !'})
                }
            },
            {
                path: '/process-error',
                auth: {
                    autorisations: '*'
                },
                async handler({logger}, res) {
                    res.header('Content-Disposition', 'attachment; filename="image.jpeg"')
                    await runProcess({
                        command: 'badboom',
                        logger
                    }, true)
                }
            },
            {
                path: '/process',
                async handler({logger}) {
                    runProcess({
                        command: 'ls',
                        logger
                    })
                }
            },
            {
                path: '/image',
                auth: {
                    autorisations: '*'
                },
                outputContentType: 'image/jpeg',
                async handler({logger}, res) {
                    await httpRequest({
                        logger,
                        responseStream: res,
                        url: 'https://www.poulesenville.com/wp-content/uploads/elementor/thumbs/img-0549-owvoi9sxmd60uttg8x4baqvc5dldoncb52q86velg0.jpeg'
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
                method: 'POST',
                path: '/abortable',
                auth: {
                    autorisations: '*'
                },
                inputBodySchema: {
                    type: 'string'
                },
                outputBodySchema: {
                    type: 'string'
                },
                outputContentType: 'text/plain',
                async handler({abortSignal, logger, body}, res) {
                    await runProcess({
                        command: 'while true ; do sleep 1 ; echo ' + body + ' ; done',
                        logger,
                        outputStream: res,
                        abortSignal
                    }, true)
                }
            },
            {
                path: '/stream',
                auth: {
                    autorisations: '*'
                },
                async handler({logger}, res) {
                    res.contentType('text/plain')
                    await runProcess({
                        command: ['ls', '-la'],
                        logger,
                        outputStream: res
                    }, true)
                }
            },
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
                outputBodySchema: {
                    type: 'string'
                },
                path: '/talki/:id',
                auth: {
                    autorisations: ['talki-read']
                },
                async handler({query, params, user, authorizator}: HttpServerRequest<{id: number}, {onlyIt: boolean}>, {send}: HttpServerResponse<string>) {
                    if (query.onlyIt) {
                        send(params.id.toString())
                        return
                    }

                    const isAuthorizedToTalkiWrite = authorizator.isAutorised(user, 'talki-write')

                    send('hello ' + user!.username + ', you want talki n°' + params.id + ' ; you are autorized to talki-write : ' + isAuthorizedToTalkiWrite.toString())

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
