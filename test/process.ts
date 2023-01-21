import runProcess from '../src/process'
import createLogger from '../src/logger'
const logger = createLogger('info')
import { once, EventEmitter } from 'events'

;import { abort } from 'process';
(async() => {

    const p5 = runProcess({
        logger,
        command: 'wc -w',
        outputType: 'text'
    })

    process.nextTick(async () => {
        try {
            const p2 = runProcess({
                logger,
                command: 'echo 1 2 3 4 5',
                outputStream: p5
            })
           console.log((await once(p5, 'finish'))[0])

        } catch (e) {
            console.log('received error', e)
        }
    })

        const inputProcess = runProcess({
            logger,
            command: 'echo 1 2 3'
        })

        setTimeout(async () => {
            try {
                console.log(await runProcess({
                    inputData: inputProcess,
                    logger,
                    command: 'wc -w',
                    outputType: 'text'
                }, true))
            } catch (e) {
                console.log('received error', e)
            }

        }, 50)

    console.log(await runProcess({
        inputData: runProcess({
            logger,
            command: 'md5sum | awk \'{print $1}\'',
            inputData: runProcess({
                logger,
                command: ['echo', 'hello']
            })
        }),
        logger,
        command: ['wc', '-c'],
        outputType: 'text',
        outputTransformation: '$join(["There is ", $string(),  " words"])'
    }, true))

    console.log(await runProcess({
        inputData: runProcess({
            logger,
            command: 'echo 1 2 3'
        }),
        logger,
        command: 'wc -w',
        outputType: 'text'
    }, true))

    const p1 = runProcess({
        logger,
        command: 'wc -w',
        outputType: 'text'
    })

    const p2 = runProcess({
        logger,
        command: 'echo 1 2 3 4 5',
        outputStream: p1
    })

    console.log((await once(p1, 'finish'))[0])

    try {
        console.log('result is', await runProcess({
            inputData: runProcess({
                logger,
                command: 'echos 1 2 3',
                //abortSignal: abortController.signal
            }),
            logger,
            command: 'wc -w',
            outputType: 'text'
        }, true))
    } catch (e) {
        console.log('received error', e)
    }

    const abortController = new AbortController

    setTimeout(() => abortController.abort(), 10)

    try {
        console.log('result is', await runProcess({
            inputData: runProcess({
                logger,
                command: 'echo 1 2 3',
                abortSignal: abortController.signal
            }),
            logger,
            command: 'wc -w',
            outputType: 'text'
        }, true))
    } catch (e) {
        console.log('received error', e)
    }

    try {
        const p1b = runProcess({
            logger,
            command: 'wc -w',
            outputType: 'text'
        })

        const p2b = runProcess({
            logger,
            command: 'echos 1 2 3 4 5',
            outputStream: p1b
        })

        console.log((await once(p1b, 'finish'))[0])

    } catch (e) {
        console.log('received error', e)
    }

    const envs = await runProcess<string>({
        logger,
        command: 'env',
        outputType: 'text'
    }, true)

    const errorsCount = await runProcess<number>({
        command: ['echo', 'There are 3 errors here !'],
        logger,
        outputType: 'text',
        outputTransformation: "$number($match(/(\\d+) errors/).groups[0])",
        resultSchema: { type: 'number' }
    }, true)

    console.log(errorsCount, typeof errorsCount) // number !

    console.log(
        await runProcess<number>({
            command: 'echo "There are 3 errors here !"',
            shell: ['bash', '-e', '-x', '-c'],
            logger,
            outputType: 'text',
            outputTransformation: "$number($match(/(\\d+) errors/).groups[0])",
            resultSchema: { type: 'number' }
        }, true)
    )

    // return

    // const abortController = new AbortController

    // abortController.abort()

    // try {
    //     const result42 = await runProcess({
    //         cmd: 'echo',
    //         args: ['-n', '{"name": "me"}\n'],
    //         logger,
    //         outputType: 'json',
    //         abortSignal: abortController.signal
    //     }, true)

    //     console.log(result42.name)

    // } catch (e) {
    //     console.log('error', e)
    // }

    // return

    // const result = await runProcess({
    //     cmd: 'ls',
    //     logger,
    //     outputType: 'text'
    // }, true)

    // console.log(result)

    // const p = runProcess({
    //     cmd: 'curl',
    //     args: ['http://ipv4.download.thinkbroadband.com/1GB.zip'],
    //     logger,
    //     outputType: 'text'
    // })

    // setTimeout(() => p.abort(), 10)

    // try {
    //     const r = await once(p, 'finish')
    //     console.log('result', r)

    // } catch (e) {
    //     console.error('error', e)
    // }



    // const p2 = runProcess({
    //     cmd: 'curl',
    //     args: ['http://ipv4.download.thinkbroadband.com/1GB.zip'],
    //     logger,
    //     outputType: 'text',
    //     abortSignal: abortController.signal
    // })

    // setTimeout(() => abortController.abort(), 10)

    // try {
    //     const r = await once(p2, 'finish')
    //     console.log('result', r)

    // } catch (e) {
    //     console.error('error', e)
    // }

    // console.log('The end')


})()
