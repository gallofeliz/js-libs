import {createCallbackHandler, createLogger, logWarnings, ConsoleHandler, createJsonFormatter, createConsoleHandler, LogLevelTriggerHandler} from '.'

const logger = createLogger()

describe('Logger', () => {

  it('warning', () => {
    logWarnings(logger)
    process.emitWarning('No good good good', { code: 'NOT_GOOD_GOOD_GOOD' })
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

  it.only('LogLevelTriggerHandler', () => {

    const logger = createLogger({
      handlers: [
        new ConsoleHandler({maxLevel: 'info'}),
        new LogLevelTriggerHandler({
          maxLevel: 'debug',
          minLevel: 'debug',
          triggerLevel: 'warning',
          embeddedLogs: true,
          handlers: [new ConsoleHandler({maxLevel: 'debug'}) ]
        })
      ]
    })

    // const logger = createLogger({
    //   handlers: [
    //     new LogLevelTriggerHandler({
    //       maxLevel: 'debug',
    //       triggerLevel: 'info',
    //       handlers: [new ConsoleHandler({maxLevel: 'debug'}) ]
    //     })
    //   ]
    // })

    const req1Logger = logger.child({req: 1})
    const req2Logger = logger.child({req: 2})

    req1Logger.info('Beginning')
    req2Logger.info('Beginning')

    req1Logger.debug('Calling Google')
    req2Logger.debug('Calling Google')

    req1Logger.debug('Google returns 200 : Ok')
    req2Logger.error('Google call error')

    req1Logger.info('Ended')
    req2Logger.warning('Ended but with errors')

  })
})
