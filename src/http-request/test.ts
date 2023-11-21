import { httpRequest } from '.'
import {createLogger} from '@gallofeliz/logger'
import { deepEqual, strictEqual } from 'assert'
const logger = createLogger()

describe('Http request', () => {
    it('test', async () => {

        deepEqual(
            await httpRequest({
                logger,
                url: 'https://jsonplaceholder.typicode.com/todos/1',
                responseType: 'auto',
                timeout: 5000,
                responseTransformation: '{"name": title}',
                resultSchema: {
                    type: 'object',
                    properties: {
                        name: {type: 'string'}
                    },
                    required: ['name']
                }
            }),
            { name: 'delectus aut autem' }
        )

    })

    it('abort', async() => {
        const ac = new AbortController
        const reason = new Error('Stop nowwww !!!')
        ac.abort(reason)
        try {
            await httpRequest({
                logger,
                abortSignal: ac.signal,
                url: 'http://ip.jsontest.com/',
                responseType: 'auto',
                timeout: 5000
            })
        } catch (e) {
            strictEqual(e, reason)
        }
    })
})
