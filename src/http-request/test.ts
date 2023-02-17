import { httpRequest } from '.'
import {createLogger} from '@gallofeliz/logger'
const logger = createLogger()

describe('Http request', () => {
    it('test', async () => {

        console.log(await httpRequest({
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

    })
})

// ;(async () => {

//     return

//     const ac = new AbortController
//     ac.abort()
//     console.log(await request({
//         logger,
//         abortSignal: ac.signal,
//         url: 'http://ip.jsontest.com/',
//         responseType: 'auto'
//     }))

// })()
