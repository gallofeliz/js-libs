import request from '../src/http-request'
import createLogger from '../src/logger'
const logger = createLogger('info')


;(async () => {
    console.log(await request({
        logger,
        abortSignal: (new AbortController).signal,
        url: 'http://ip.jsontest.com/',
        outputType: 'auto'
    }))

})()
