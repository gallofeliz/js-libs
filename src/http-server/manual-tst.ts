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
                path: '/talki/:name',
                auth: {
                    roles: ['talk']
                },
                async handler({params, logger}) {
                    logger.info('http://sddfds:sdsf@dsfsdffs/ rtsp://sdfsdf:sdfssf@sdfsdf.fr', {user: 'sdfsfds', password: 'sdfsfsd'})
                    return 'hello ' + params.name
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
