import runProcess from '../src/process'
import createLogger from '../src/logger'
const logger = createLogger('info')
import { once, EventEmitter } from 'events'

;(async() => {

    const result = await runProcess({
        cmd: 'ls',
        logger,
        outputType: 'text'
    }, true)

    console.log(result)

    const p = runProcess({
        cmd: 'curl',
        args: ['http://ipv4.download.thinkbroadband.com/1GB.zip'],
        logger,
        outputType: 'text'
    })

    setTimeout(() => p.abort(), 10)

    try {
        const r = await once(p, 'finish')
        console.log('result', r)

    } catch (e) {
        console.error('error', e)
    }


    const abortController = new AbortController

    const p2 = runProcess({
        cmd: 'curl',
        args: ['http://ipv4.download.thinkbroadband.com/1GB.zip'],
        logger,
        outputType: 'text',
        abortSignal: abortController.signal
    })

    setTimeout(() => abortController.abort(), 10)

    try {
        const r = await once(p2, 'finish')
        console.log('result', r)

    } catch (e) {
        console.error('error', e)
    }

    console.log('The end')


})()
