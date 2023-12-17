import { mysqlDump } from './index.js'
import assert from 'assert'
import { text } from 'node:stream/consumers'

describe('mysqlDump', () => {

    it('stream error cmd', async () => {
        const stream = mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            database: 'noexist',
            binary: 'mysql_dump'
        })

        await assert.rejects(() => text(stream), (e: Error) => {
            assert(e.message.includes('spawn mysql_dump ENOENT'))
            return true
        })
    })

    it('stream error mysql', async () => {
        const stream = mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            database: 'noexist',
            lockTables: false,
            noCreateInfo: true,
            skipComments: true,
            noTablespaces: true,
            columnStatistics: false
        })

        await assert.rejects(() => text(stream), (e: Error) => {
            assert(e.message.includes('1049: Unknown database \'noexist\''))
            return true
        })
    })

    it('stream test', async () => {
        const stream = mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            database: 'test',
            lockTables: false,
            noCreateInfo: false,
            skipComments: true,
            noTablespaces: true,
            columnStatistics: false
        })

        console.log(await text(stream))
    })

})
