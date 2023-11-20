# Logger

Simple logger:
- log -> processors -> obfuscation -> handlers (own processors + format + transport)
- Advanced childs (not only metadata but also own processors and handlers stack)
- Default simple JSON console logging
- logfmt formatter available
- Secrets Obfuscation
- BreadCrumb handler (like Monolog Fingers crossed handler) : keep some verbose logs in memory until an error-like log is logged. Kept verbose logs are flushed with it. Verbose logs are kept on a logger chain (parent/child) to flush only (as possible) relevant logs.

```typescript

const logger = createLogger({...})

const child = logger.child({child: true})

child.info('My log', {password: 'secret'})

// Will log {level: 'info', message: 'My log', password: '***', child: true, timestamp: '(date)'}

```