import {createCallbackHandler, createLogger, ConsoleHandler, createJsonFormatter, createConsoleHandler, createLogfmtFormatter} from '.'

const logger = createLogger()

describe('Logger', () => {

  it('logfmt', () => {
    const logger = createLogger({handlers: [
      createConsoleHandler({
        formatter: createLogfmtFormatter()
      })
    ]})
    logger.info('My message', {
      tag: 'hello',
      emptyStr: '',
      bool: true,
      numb: 33,
      nul: null,
      undef: undefined,
      'key with space': true,
      createdDate: new Date,
      my: { deep: { data: true }},
      error: new Error('Invalid data'),
      fn() { console.log('hello') },
      symbol: Symbol.for('A symbol')
    })
  })

  it('basic test', () => {
    logger.info('Basic test', {
      createdDate: new Date,
      my: { deep: { data: true }},
      error: new Error('Invalid data'),
      fn() { console.log('hello') },
      symbol: Symbol.for('A symbol')
    })
  })

  it('child test', () => {

    const child1 = logger.child({child: true})
    const child2 = child1.child({childOfChild: true})

    child2.info('I am child of child')

    child2.getHandlers().push(createCallbackHandler({
      maxLevel: 'notice',
      formatter: log => '[${log.level}] ${log.message}',
      cb(_, log) {
        console.log('child2 has log', log)
      }
    }))

    child2.info('Should not be logged as raw log')
    child2.error('Should be logged as raw log', { error: new Error('Raw error') })

    child1.error('Should not be logged as raw log !')

    child1.getProcessors().push(log => { return {...log, processorProperty: true} })

    child1.info('I should have processorProperty')
    child2.info('I should not have processorProperty')

    ;(child2.getHandlers()[0] as ConsoleHandler).getProcessors().push(log => { return {...log, handlerProcessorProperty: true} })

    child1.info('I should handlerProcessorProperty')
    child2.info('I should have handlerProcessorProperty')

    child1.setHandlers([
        createConsoleHandler({
            formatter: createJsonFormatter({
                indentation: 4,
                customReplacements:[
                    (k, value) => {
                      return typeof value === 'symbol' ? value.toString() : value
                    }
                ]
            })
        })
    ])

    child1.info('Very secret', { password: 'verySecret', symbol: Symbol.for('A symbol'), fn() { console.log('hello') } })

  })
})
