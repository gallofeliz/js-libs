import {createLogger} from '@gallofeliz/logger'
import { HttpServer, HttpServerRequest, HttpServerResponse } from '.'
import {httpRequest} from '@gallofeliz/http-request'
import { runProcess } from '@gallofeliz/run-process'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'

const logger = createLogger()

interface Welcome {
    message: string
    details?: {
        id: number
    }
}

const server = new HttpServer({
    port: 8080,
    name: 'My Test API',
    logger,
    auth: {
        users: [
            {
                username: 'user',
                password: 'pass',
                autorisations: ['manager']
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
        authorizationsExtensions: {
            manager: ['talki-read', 'talki-write', 'talki[*]', '!talki[33]'],
            admin: ['*']
        }
    },
    swagger: {
        apiPath: '/swag-api',
        uiPath: '/swag'
    },
    routes: [
        {
            path: '/',
            srcPath: 'README.md'
        },
        {
            path: '/file',
            srcPath: 'package.json'
        },
        {
            path: '/dir',
            srcPath: __dirname
        },
        {
            path: '/self',
            async handler(_, res) {
                res.sendFile(__filename)
            }
        },
        {
            description: 'Welcome route !',
            path: '/welcome',
            requiredAuthorization: 'PUBLIC',
            outputBodySchema: tsToJsSchema<Welcome>(),
            async handler(_, {send}) {
                send({message: 'Welcome !'})
            }
        },
        {
            path: '/process-error',
            requiredAuthorization: 'OK',
            async handler({logger}, res) {
                res.header('Content-Disposition', 'attachment; filename="image.jpeg"')
                await runProcess({
                    command: 'badboom',
                    logger
                })
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
            requiredAuthorization: null,
            outputContentType: 'image/jpeg',
            async handler({logger, abortSignal}, res) {
                await httpRequest({
                    abortSignal,
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
                })
            }
        },
        {
            path: '/stream',
            async handler({logger}, res) {
                res.contentType('text/plain')
                await runProcess({
                    command: ['ls', '-la'],
                    logger,
                    outputStream: res
                })
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
            requiredAuthorization(res) { return 'talki['+ res.params.id +']' },
            async handler({query, params, user, auth}: HttpServerRequest<{id: number}, {onlyIt: boolean}>, {send}: HttpServerResponse<string>) {
                if (query.onlyIt) {
                    send(params.id.toString())
                    return
                }

                const isAuthorizedToTalkiWrite = auth.isAuthorized(user, 'talki-write')

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
})

server.start()
