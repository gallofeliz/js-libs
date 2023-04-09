# Logger

Simple logger:
- Observable (events)
- Childs
- Manage transports ; defaut JSON
- Secrets Obfuscation
- Log warnings, unhandled
- [ ] Component to transform js -> json before obfuscation
- [ ] Processors / hooks with obfuscation and others transformations inside with specified order (ex 50 and 100) to give ability to add others processors before, inside, after etc

log -> processors -> handlers (custom processors + format + transport)

```typescript

const logger = createLogger({level:'info'})

const child = logger.child({child: true})

child.info('My log', {password: 'secret'})

// Will log {level: 'info', message: 'My log', password: '***', child: true, timestamp: '(date)'}

```