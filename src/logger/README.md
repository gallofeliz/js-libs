# Logger

Simple logger:
- Observable (events)
- Childs
- Manage transports ; defaut JSON
- Secrets Obfuscation
- Log warnings, unhandled


```typescript

const logger = createLogger({level:'info'})

const child = logger.child({child: true})

child.info('My log', {password: 'secret'})

// Will log {level: 'info', message: 'My log', password: '***', child: true, timestamp: '(date)'}

```