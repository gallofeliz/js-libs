import {runProcess, createProcess} from '.'
import {createLogger} from '@gallofeliz/logger'
import assert, { deepEqual, fail, strict, strictEqual } from 'assert'
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

})

// ;(async() => {

//     const p5 = runProcess({
//         logger,
//         command: 'wc -w',
//         outputType: 'text'
//     })

//     process.nextTick(async () => {
//         try {
//             const p2 = runProcess({
//                 logger,
//                 command: 'echo 1 2 3 4 5',
//                 outputStream: p5
//             })
//            console.log((await once(p5, 'finish'))[0])

//         } catch (e) {
//             console.log('received error', e)
//         }
//     })

//         const inputProcess = runProcess({
//             logger,
//             command: 'echo 1 2 3'
//         })

//         setTimeout(async () => {
//             try {
//                 console.log(await runProcess({
//                     inputData: inputProcess,
//                     logger,
//                     command: 'wc -w',
//                     outputType: 'text'
//                 }, true))
//             } catch (e) {
//                 console.log('received error', e)
//             }

//         }, 50)

//     console.log(await runProcess({
//         inputData: runProcess({
//             logger,
//             command: 'md5sum | awk \'{print $1}\'',
//             inputData: runProcess({
//                 logger,
//                 command: ['echo', 'hello']
//             })
//         }),
//         logger,
//         command: ['wc', '-c'],
//         outputType: 'text',
//         outputTransformation: '$join(["There is ", $string(),  " words"])'
//     }, true))

//     console.log(await runProcess({
//         inputData: runProcess({
//             logger,
//             command: 'echo 1 2 3'
//         }),
//         logger,
//         command: 'wc -w',
//         outputType: 'text'
//     }, true))

//     const p1 = runProcess({
//         logger,
//         command: 'wc -w',
//         outputType: 'text'
//     })

//     const p2 = runProcess({
//         logger,
//         command: 'echo 1 2 3 4 5',
//         outputStream: p1
//     })

//     console.log((await once(p1, 'finish'))[0])

//     try {
//         console.log('result is', await runProcess({
//             inputData: runProcess({
//                 logger,
//                 command: 'echos 1 2 3',
//                 //abortSignal: abortController.signal
//             }),
//             logger,
//             command: 'wc -w',
//             outputType: 'text'
//         }, true))
//     } catch (e) {
//         console.log('received error', e)
//     }

//     const abortController = new AbortController

//     setTimeout(() => abortController.abort(), 10)

//     try {
//         console.log('result is', await runProcess({
//             inputData: runProcess({
//                 logger,
//                 command: 'echo 1 2 3',
//                 abortSignal: abortController.signal
//             }),
//             logger,
//             command: 'wc -w',
//             outputType: 'text'
//         }, true))
//     } catch (e) {
//         console.log('received error', e)
//     }

//     try {
//         const p1b = runProcess({
//             logger,
//             command: 'wc -w',
//             outputType: 'text'
//         })

//         const p2b = runProcess({
//             logger,
//             command: 'echos 1 2 3 4 5',
//             outputStream: p1b
//         })

//         console.log((await once(p1b, 'finish'))[0])

//     } catch (e) {
//         console.log('received error', e)
//     }

//     const envs = await runProcess<string>({
//         logger,
//         command: 'env',
//         outputType: 'text'
//     }, true)

//     const errorsCount = await runProcess<number>({
//         command: ['echo', 'There are 3 errors here !'],
//         logger,
//         outputType: 'text',
//         outputTransformation: "$number($match(/(\\d+) errors/).groups[0])",
//         resultSchema: { type: 'number' }
//     }, true)

//     console.log(errorsCount, typeof errorsCount) // number !

//     console.log(
//         await runProcess<number>({
//             command: 'echo "There are 3 errors here !"',
//             shell: ['bash', '-e', '-x', '-c'],
//             logger,
//             outputType: 'text',
//             outputTransformation: "$number($match(/(\\d+) errors/).groups[0])",
//             resultSchema: { type: 'number' }
//         }, true)
//     )

//     // return

//     // const abortController = new AbortController

//     // abortController.abort()

//     // try {
//     //     const result42 = await runProcess({
//     //         cmd: 'echo',
//     //         args: ['-n', '{"name": "me"}\n'],
//     //         logger,
//     //         outputType: 'json',
//     //         abortSignal: abortController.signal
//     //     }, true)

//     //     console.log(result42.name)

//     // } catch (e) {
//     //     console.log('error', e)
//     // }

//     // return

//     // const result = await runProcess({
//     //     cmd: 'ls',
//     //     logger,
//     //     outputType: 'text'
//     // }, true)

//     // console.log(result)

//     // const p = runProcess({
//     //     cmd: 'curl',
//     //     args: ['http://ipv4.download.thinkbroadband.com/1GB.zip'],
//     //     logger,
//     //     outputType: 'text'
//     // })

//     // setTimeout(() => p.abort(), 10)

//     // try {
//     //     const r = await once(p, 'finish')
//     //     console.log('result', r)

//     // } catch (e) {
//     //     console.error('error', e)
//     // }



//     // const p2 = runProcess({
//     //     cmd: 'curl',
//     //     args: ['http://ipv4.download.thinkbroadband.com/1GB.zip'],
//     //     logger,
//     //     outputType: 'text',
//     //     abortSignal: abortController.signal
//     // })

//     // setTimeout(() => abortController.abort(), 10)

//     // try {
//     //     const r = await once(p2, 'finish')
//     //     console.log('result', r)

//     // } catch (e) {
//     //     console.error('error', e)
//     // }

//     // console.log('The end')


// })()
