# sqlite-dump

```typescript
import { createLogger } from '@gallofeliz/logger'
import { sqliteDump } from '@gallofeliz/sqlite-dump'

await sqliteDump({
    filename: 'my.db',
    logger: createLogger(),
    output: {
        type: 'file',
        filepath: '/tmp/bla/blo/test.db'
    }
})
```