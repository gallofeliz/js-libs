# Logger

Simple logger:
- log -> processors -> handlers (own processors + format + transport)
- Advanced childs (not only metadata but also own processors and handlers stack)
- Default simple JSON console logging
- Secrets Obfuscation ?
- Log warnings, unhandled


```typescript

const logger = createLogger({...})

const child = logger.child({child: true})

child.info('My log', {password: 'secret'})

// Will log {level: 'info', message: 'My log', password: '***', child: true, timestamp: '(date)'}

```