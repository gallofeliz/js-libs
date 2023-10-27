import { createLogger } from '@gallofeliz/logger'
import { mysqlDump } from '.'

describe('mysqlDump', () => {
    it('file test', async () => {
        await mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            logger: createLogger(),
            database: 'test',
            lockTables: false,
            output: {
                filepath: '/tmp/bla/blo/test.db',
                type: 'file'
            },
            noTablespaces: true,
            columnStatistics: false
        })
    })

    it('file test gzip', async () => {
        await mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            logger: createLogger(),
            database: 'test',
            lockTables: false,
            output: {
                filepath: '/tmp/bla/blo/test.dbz',
                type: 'file',
                compress: true
            },
            noTablespaces: true,
            columnStatistics: false
        })
    })

    it('output test', async () => {
        console.log(await mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            logger: createLogger({handlers: []}),
            database: 'test',
            lockTables: false,
            output: {
                type: 'text'
            },
            dumpDate: false,
            noTablespaces: true,
            columnStatistics: false
        }))
    })

    it('stream test', async () => {
        await mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            logger: createLogger({handlers: []}),
            database: 'test',
            lockTables: false,
            output: {
                type: 'stream',
                stream: process.stdout
            },
            noCreateInfo: true,
            skipComments: true,
            noTablespaces: true,
            columnStatistics: false
        })
    })
})
