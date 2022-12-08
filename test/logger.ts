import createLogger from '../src/logger'

const logger = createLogger('info')

const child = logger.child({child: true})

child.on('log', (log) => {
    console.log('child log', log)
})

logger.info('The message', {the: 'data', password: 'secrettttt'})

child.info('New message', {message: 'I want to hack'})

// new Promise((resolve, reject) => reject(new Error('badoooom')))

// setInterval(() => console.log('OH YEAH'), 10)


/*

{"level":"info","message":"The message","the":"data","timestamp":"2022-05-24T21:00:43.890Z"}
log {
  the: 'data',
  level: 'info',
  message: 'The message',
  timestamp: '2022-05-24T21:00:43.890Z',
  [Symbol(level)]: 'info',
  [Symbol(splat)]: [ { the: 'data' } ],
  [Symbol(message)]: '{"level":"info","message":"The message","the":"data","timestamp":"2022-05-24T21:00:43.890Z"}'
}


*/
