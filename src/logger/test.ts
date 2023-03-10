import {createLogger} from '.'

const logger = createLogger({level:'info'})

const child = logger.child({child: true})

describe('Logger', () => {

  it('tests', () => {

    child.on('log', (log) => {
        console.log('child log', log)
    })

    const data: any = {the: 'data', password: 'secrettttt', array: [1, '2', new Date]}
    data.sub = {
      hello: [{
        world: {
          data
        }
      }]
    }

    logger.info('The message', data)

    child.info('New message', {message: 'I want to hack the https://admin:admin@mydomain/destroy'})

  })

  it('warning', () => {
    process.emitWarning('No good good good', { code: 'NOT_GOOD_GOOD_GOOD' })
  })

})
