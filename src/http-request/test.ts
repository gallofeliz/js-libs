import { httpRequest } from '.'
import {createLogger} from '@gallofeliz/logger'
import { deepEqual, strict, strictEqual } from 'assert'
const logger = createLogger()

describe('Http request', () => {
    it('test', async () => {

        deepEqual(
            await httpRequest({
                logger,
                url: 'https://jsonplaceholder.typicode.com/todos/1',
                responseType: 'auto',
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
        ac.abort()
        try {
            await httpRequest({
                logger,
                abortSignal: ac.signal,
                url: 'http://ip.jsontest.com/',
                responseType: 'auto'
            })
        } catch (e) {
            strictEqual((e as any).code, 'ABORT_ERR')
            strictEqual((e as any).name, 'AbortError')
        }
    })
})
