import { builtinRulesBuilders } from '@gallofeliz/obfuscator'
import {createCallbackHandler, createLogger, logWarnings, ConsoleHandler, createJsConvertionProcessor, createObfuscationProcessor, createConsoleHandler, createJsonFormatter} from '.'

const logger = createLogger()

describe('Logger', () => {

  it('warning', () => {
    logWarnings(logger)
    process.emitWarning('No good good good', { code: 'NOT_GOOD_GOOD_GOOD' })
  })

  it('basic test', () => {
    logger.info('Basic test', { createdDate: new Date, my: { deep: { data: true }}, error: new Error('Invalid data') })
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

  })

  it('Advanced logging', () => {
    const logger = createLogger({
      processors: [
        createJsConvertionProcessor(),
        createObfuscationProcessor([
          builtinRulesBuilders.objKeysLooksLikeSecrets(),
          builtinRulesBuilders.authInUrls()
        ])
      ],
      handlers: [
        createConsoleHandler({
          formatter: createJsonFormatter([], true)
        })
      ]
    })

    logger.info('Loading config', { config: { users: [{ name: 'root', password: 'verySecret' }], port: 80 } })
    logger.error('Badaboom', { error: new Error('Invalid Url https://melanie:iwillbehacked@yahoo.fr !') })
  })

  // it('tests', () => {


  //   childOfChild.info('Hello I am child2', {password: 'yes'})

  //   const data: any = {the: 'data', password: 'secrettttt', array: [1, '2', new Date]}
  //   const error = new Error('Badaboom unable to connect to rtsp://melanie:secret@cam/stream1')

  //   data.thing = new Thing

  //   ;(error as any).date = new Date

  //   data.sub = {
  //     hello: [{
  //       world: {
  //         data
  //       }
  //     }],
  //     deep: {
  //       object: {
  //         error
  //       }
  //     }
  //   }

  //   logger.info('The message', data)
  //   logger.info('Again', {fn() { console.log('fn') }, symb: Symbol('hello')})
  //   child.notice('Again2', {key: 'value', [Symbol('hello')]: 'this is a symbol key', 3: 4})
  //   child.info('New message', {message: 'I want to hack the https://admin:admin@mydomain/destroy'})



  // })


})
