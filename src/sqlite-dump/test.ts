import { createLogger } from '@gallofeliz/logger'
import { sqliteDump } from '.'

describe('mysqlDump', () => {
    it('file test', async () => {
        await sqliteDump({
            logger: createLogger(),
            filename: __dirname + '/test.db',
            output: {
                filepath: '/tmp/bla/blo/test.db',
                type: 'file'
            }
        })
    })

    it('file test gzip', async () => {
        await sqliteDump({
            logger: createLogger(),
            filename: __dirname + '/test.db',
            output: {
                filepath: '/tmp/bla/blo/test.dbz',
                type: 'file',
                compress: true
            }
        })
    })

    it('output test', async () => {
        console.log(await sqliteDump({
            logger: createLogger({handlers: []}),
            filename: __dirname + '/test.db',
            output: {
                type: 'text'
            }
        }))
    })

    it('stream test', async () => {
        await sqliteDump({
            logger: createLogger(),
            filename: __dirname + '/test.db',
            output: {
                type: 'stream',
                stream: process.stdout
            }
        })
    })
})
