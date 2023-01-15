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
                method: 'GET',
                path: '/talki',
                auth: {
                    roles: ['talk']
                },
                async handler(req, res) {
                    res.send('yes')
                }
            },
            {
                method: 'GET',
                path: '/walki',
                auth: {
                    roles: ['danse', 'walk']
                },
                async handler(req, res) {
                    res.send('yes')
                }
            },
            {
                method: 'GET',
                path: '/moki',
                auth: {
                    roles: ['danse', 'sing']
                },
                async handler(req, res) {
                    res.send('yes')
                }
            },
            {
                method: 'GET',
                path: '/public/:pass',
                auth: {
                    required: false
                },
                async handler(req, res) {
                    res.send(server.getAuth()!.validate('papa', req.params.pass, ['bizounours']))
                }
            },

        ]
    }
})

server.start()
