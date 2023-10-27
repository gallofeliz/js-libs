import { createLogger } from '@gallofeliz/logger'
import { mysqlDump } from '.'

describe('mysqlDump', () => {
    it('test', async () => {
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
    })
})
