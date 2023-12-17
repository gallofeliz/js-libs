# mysql-dump

```typescript
import { mysqlDump } from '@gallofeliz/mysql-dump'

await pipeline(
    fs.createWriteStream('myfile'),
    mysqlDump({
        host: 'mysql.localtest.me',
        user: 'dbuser',
        password: 'dbpassword',
        database: 'test',
        lockTables: false
    })
)
```