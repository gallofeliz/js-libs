import {communicate} from "."
import {createLogger} from '@gallofeliz/logger'
import { strictEqual } from "assert"

describe('user-communicate', () => {
    it('test', async () => {

        const cmdResponse = await communicate({
            userConfig: {
                type: 'command',
                command: 'wc -w',
                outputType: 'text',
                outputTransformation: '$number()'
            },
            logger: createLogger(),
            data: 'There are 3 errors',
            resultSchema: { type: 'number' }
        })

        strictEqual(cmdResponse, 4)

        const httpResponse = await communicate({
            userConfig: {
                type: 'http',
                method: 'POST',
                url: 'https://httpbin.org/anything',
                responseType: 'json',
                responseTransformation: '$number($split(data, " ")[2])',
                timeout: 5000
            },
            logger: createLogger(),
            data: 'There are 3 errors',
            resultSchema: { type: 'number' }
        })

        strictEqual(httpResponse, 3)

    }).timeout(5000)
})
