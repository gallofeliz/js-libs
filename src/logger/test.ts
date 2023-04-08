import EventEmitter from 'events'
import {createLogger} from '.'

const logger = createLogger({level:'info'})

const child = logger.child({child: true})

class Thing extends EventEmitter {
    protected name: string

    constructor() {
      super()
      this.name = 'Patrick'
    }

    toJSON() {
      return {
        name: this.name,
        password: 'verySecret'
      }
    }
}

describe('Logger', () => {

  it('tests', () => {

    child.on('log', (log) => {
        console.log('child log', log)
    })

    const data: any = {the: 'data', password: 'secrettttt', array: [1, '2', new Date]}
    const error = new Error('Badaboom unable to connect to rtsp://melanie:secret@cam/stream1')

    data.thing = new Thing

    ;(error as any).date = new Date

    data.sub = {
      hello: [{
        world: {
          data
        }
      }],
      deep: {
        object: {
          error
        }
      }
    }

    logger.info('The message', data)

    child.info('New message', {message: 'I want to hack the https://admin:admin@mydomain/destroy'})

  })

  it('warning', () => {
    process.emitWarning('No good good good', { code: 'NOT_GOOD_GOOD_GOOD' })
  })

})
