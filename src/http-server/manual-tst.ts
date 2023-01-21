import createLogger from '../logger'
import HttpServer from '../http-server'
import httpRequest from '../http-request'

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
                path: '/sleep',
                auth: {
                    required: false
                },
                async handler({abortSignal, res}) {
                    abortSignal.addEventListener('abort', () => {
                        console.log('Adios')
                    })
                    return res
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
                path: '/talki/:id',
                auth: {
                    roles: ['talk']
                },
                async handler({params, logger}) {
                    return 'hello member n°' + params.id
                }
            },
            {
                method: 'GET',
                path: '/walki',
                auth: {
                    roles: ['danse', 'walk']
                },
                async handler({req, res}) {
                    res.send('yes')
                }
            },
            {
                method: 'GET',
                path: '/moki',
                auth: {
                    roles: ['danse', 'sing']
                },
                async handler({req, res}) {
                    res.send('yes')
                }
            },
            {
                method: 'GET',
                path: '/public/:pass',
                auth: {
                    required: false
                },
                async handler({req, res}) {
                    res.send(server.getAuth()!.validate('papa', req.params.pass, ['bizounours']))
                }
            },

        ]
    }
})

server.start()
