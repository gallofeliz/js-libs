# mysql-dump

```typescript
import { createLogger } from '@gallofeliz/logger'
import { mysqlDump } from '@gallofeliz/mysql-dump'

await mysqlDump({
    host: 'mysql.localtest.me',
    user: 'dbuser',
    password: 'dbpassword',
    logger: createLogger(),
    database: 'test',
    lockTables: false,
    output: {
        type: 'file',
        filepath: '/tmp/bla/blo/test.db'
    }
})
```