import request from '../src/http-request'
import createLogger from '../src/logger'
const logger = createLogger('info')


;(async () => {

    console.log(await request({
        logger,
        url: 'http://ip.jsontest.com/',
        responseType: 'auto',
        responseTransformation: '{"address": ip}',
        resultSchema: {
            type: 'object',
            properties: {
                address: {type: 'string'}
            },
            required: ['address']
        }
    }))

    return

    const ac = new AbortController
    ac.abort()
    console.log(await request({
        logger,
        abortSignal: ac.signal,
        url: 'http://ip.jsontest.com/',
        responseType: 'auto'
    }))

})()
