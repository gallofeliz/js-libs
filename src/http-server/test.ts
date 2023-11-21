import {createLogger} from '@gallofeliz/logger'
import {HttpServer} from '.'
import {httpRequest} from '@gallofeliz/http-request'

const logger = createLogger()

describe('Http Server', () => {
    it('test', async () => {

        const server = new HttpServer({
            port: 8080,
            logger,
            routes: [
                {
                    method: 'POST',
                    path: '/test',
                    async handler({body, logger}, res) {
                        logger.info('I am the test handler')
                        res.send(body)
                    },
                    inputBodySchema: {
                        oneOf: [
                            {type: 'number'},
                            {type: 'object', properties: {test: {type: 'number'}}}
                        ]
                    }
                }
            ]
        })

        await server.start()

        try {
            console.log('object json test', JSON.stringify(await httpRequest({
                logger,
                url: 'http://localhost:8080/test',
                method: 'POST',
                bodyData: {test: '42'},
                bodyType: 'json',
                responseType: 'text',
                timeout: 2000
            })))

            console.log('string json test', JSON.stringify(await httpRequest({
                logger,
                url: 'http://localhost:8080/test',
                method: 'POST',
                bodyData: '42',
                bodyType: 'json',
                responseType: 'text',
                timeout: 2000
            })))

            console.log('string text test', JSON.stringify(await httpRequest({
                logger,
                url: 'http://localhost:8080/test',
                method: 'POST',
                bodyData: '42',
                bodyType: 'text',
                responseType: 'text',
                timeout: 2000
            })))

        } finally {
            server.stop()
        }

    })
})
