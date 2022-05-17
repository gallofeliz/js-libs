import request from '../src/http-request'
import createLogger from '../src/logger'
const logger = createLogger('info')


;(async () => {
    const ac = new AbortController
    ac.abort()
    console.log(await request({
        logger,
        abortSignal: ac.signal,
        url: 'http://ip.jsontest.com/',
        outputType: 'auto'
    }))

})()
