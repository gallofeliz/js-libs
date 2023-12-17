# sqlite-dump

```typescript
import { createLogger } from '@gallofeliz/logger'
import { sqliteDump, sqliteBackup } from '@gallofeliz/sqlite-dump'

await sqliteDump({
    filename: 'my.db',
    logger: createLogger(),
    output: {
        type: 'file',
        filepath: '/tmp/bla/blo/test.db'
    }
})

await sqliteBackup({
    logger: createLogger(),
    filename: 'my.db',
    outputFilename: '/tmp/bla/blo/backup.db'
})
```
