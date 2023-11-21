import {runProcess} from '.'
import {createLogger} from '@gallofeliz/logger'
const logger = createLogger()


;(async () => {

    console.log(await runProcess({
        logger,
        command: 'id',
        outputType: 'text'
    }))


})()