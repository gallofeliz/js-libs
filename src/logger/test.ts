import EventEmitter from 'events'
import {createLogger} from '.'
import { builtinRulesBuilders } from '@gallofeliz/obfuscator'

const logger = createLogger({level:'info', obfuscation: { rules: [builtinRulesBuilders.keyMatchs('password')] }})

const child = logger.child({childNo: 1})
const childOfChild = child.child({childNo: 2})

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

    childOfChild.info('Hello I am child2', {password: 'yes'})

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
    logger.info('Again', {fn() { console.log('fn') }, symb: Symbol('hello')})
    child.notice('Again2', {key: 'value', [Symbol('hello')]: 'this is a symbol key', 3: 4})
    child.info('New message', {message: 'I want to hack the https://admin:admin@mydomain/destroy'})



  })

  it('warning', () => {
    process.emitWarning('No good good good', { code: 'NOT_GOOD_GOOD_GOOD' })
  })

})
