import {runProcess, createProcess} from '.'
import {createLogger} from '@gallofeliz/logger'
import assert, { deepEqual, fail, strictEqual } from 'assert'
import { Writable } from 'stream'
const logger = createLogger()
//import { once, EventEmitter } from 'events'

describe('Run Process', () => {

    it('Simple text process', async () => {
        strictEqual(await runProcess({
            logger,
            command: 'echo hello',
            outputType: 'text'
        }), 'hello')
    })

    it('Call command with Array args', async () => {
        strictEqual(await runProcess({
            logger,
            command: ['echo', 'hello'],
            outputType: 'text'
        }), 'hello')
    })

    it('Simple json process', async () => {
        deepEqual(await runProcess({
            logger,
            command: 'echo \'{"test": true}\'',
            outputType: 'json'
        }), {test: true})
    })

    it('transformed json process', async () => {
        strictEqual(await runProcess({
            logger,
            command: 'echo \'{"test": 44}\'',
            outputType: 'json',
            outputTransformation: 'test'
        }), 44)
    })

    it('Multiline json', async () => {
        deepEqual(await runProcess({
            logger,
            command: 'echo \'{"test": true}\'; echo \'{"test": false}\'',
            outputType: 'multilineJson'
        }), [{test: true},{test: false}])
    })

    it('Output stream', async () => {
        const stream = new Writable({
            write(_data) {
                data += _data
            }
        })
        let data = ''

        await runProcess({
            logger,
            command: 'echo -n abcd',
            outputStream: stream
        })

        strictEqual(data, 'abcd')
    })

    it('Badaboom case', async () => {
        try {
            await runProcess({
                logger,
                command: 'echo "Bad robot" >&2 ; exit 1',
                outputType: 'text'
            })
            fail('Unexpected success')
        } catch (e) {
            strictEqual((e as Error).message, 'Process error : Bad robot')
        }
    })

    it('Case abortSignal is triggered with array cmd', async () => {
        const abortController = new AbortController
        setTimeout(() => abortController.abort(), 100)

        try {
            await runProcess({
                logger,
                command: ['sleep', '60'],
                outputType: 'text',
                abortSignal: abortController.signal
            })
            fail('Unexpected success')
        } catch (e) {
            assert.strictEqual((e as Error).name, 'AbortError')
            assert.strictEqual((e as any).code, 'ABORT_ERR')
        }
    })

    it('Case abortSignal is triggered', async () => {
        const abortController = new AbortController
        setTimeout(() => abortController.abort(), 100)

        try {
            await runProcess({
                logger,
                command: 'sleep 2',
                outputType: 'text',
                abortSignal: abortController.signal
            })
            fail('Unexpected success')
        } catch (e) {
            assert.strictEqual((e as Error).name, 'AbortError')
            assert.strictEqual((e as any).code, 'ABORT_ERR')
        }
    }).timeout(3000)

    it('Case abortSignal already aborted', async () => {
        const abortController = new AbortController
        abortController.abort()

        try {
            await runProcess({
                logger,
                command: 'echo hello',
                outputType: 'text',
                abortSignal: abortController.signal
            })
            fail('Unexpected success')
        } catch (e) {
            assert.strictEqual((e as Error).name, 'AbortError')
            assert.strictEqual((e as any).code, 'ABORT_ERR')
        }
    })

    it('Multi processes success', async () => {
        const result = await runProcess({
            logger,
            command: 'wc -w',
            outputType: 'text',
            inputData: createProcess({
                logger,
                command: 'echo 1 2 3 4 5'
            })
        })

        strictEqual(result, '5')
    })

    it('Multi processes abort', async () => {
        const abortController = new AbortController
        setTimeout(() => abortController.abort(), 100)

        try {
            await runProcess({
                logger,
                command: 'wc -w',
                outputType: 'text',
                abortSignal: abortController.signal,
                inputData: createProcess({
                    logger,
                    command: 'exec sleep 5 && echo 1 2 3 4 5'
                })
            })
        } catch(e) {
            assert.strictEqual((e as Error).name, 'AbortError')
            assert.strictEqual((e as any).code, 'ABORT_ERR')
        }
    })

    it('Multi processes fail', async () => {
        try {
            await runProcess({
                logger,
                command: 'wc -w',
                outputType: 'text',
                inputData: createProcess({
                    logger,
                    command: 'echo "Badaboom" >&2 && false'
                })
            })
        } catch(e) {
            strictEqual((e as Error).message, 'ProcessPipeError : Process error : Badaboom')
        }
    })

    it('Complex example', async () => {
        const result = await runProcess({
            inputData: createProcess({
                logger,
                command: 'md5sum | awk \'{print $1}\'',
                inputData: createProcess({
                    logger,
                    command: ['echo', 'hello']
                })
            }),
            logger,
            command: ['wc', '-c'],
            outputType: 'text',
            outputTransformation: '$join(["There is ", $string(),  " words"])'
        })

        strictEqual(result, 'There is 33 words')
    })
})