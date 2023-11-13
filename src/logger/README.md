# Logger

Simple logger:
- log -> processors -> obfuscation -> handlers (own processors + format + transport)
- Advanced childs (not only metadata but also own processors and handlers stack)
- Default simple JSON console logging
- logfmt formatter available
- Secrets Obfuscation
- [ ] CrossFingers logs : debug logs that are flushed in case of warning/error (keep logs > level1 and flush on level2 or less)

```typescript

const logger = createLogger({...})

const child = logger.child({child: true})

child.info('My log', {password: 'secret'})

// Will log {level: 'info', message: 'My log', password: '***', child: true, timestamp: '(date)'}

```