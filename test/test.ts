import { Process } from '../src/process'
import { once } from 'events'
import createLogger from '../src/logger'

(async () => {

    const process = new Process({
        cmd: 'youtube-dl',
        args: ['-j', 'https://www.youtube.com/watch?v=mdX00_KbW3Y'],
        logger: createLogger('info'),
        outputType: 'json'
    })

    process.run()

    const [result] = await once(process, 'finish')

    console.log(`The video is ${result.fulltitle}`)

    console.log(`The thumb is ${result.thumbnail}`)

})()
