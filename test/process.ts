import runProcess from '../src/process'
import createLogger from '../src/logger'
const logger = createLogger('info')
import { once, EventEmitter } from 'events'

;(async() => {

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
