import { pipeline } from 'stream/promises'
import { mysqlDump } from './index.js'
import { Readable } from 'stream'
import { createWriteStream } from 'fs'
import assert from 'assert'
// import {setFlagsFromString} from 'v8'
// import vm from 'vm'

// setFlagsFromString('--expose_gc');
// var gc = vm.runInNewContext('gc');

describe('mysqlDump', () => {

    // let memoryBefore: number

    // before(() => {
    //     gc()
    //     memoryBefore = process.memoryUsage().heapUsed
    // })

    // after(() => {
    //     gc()
    //     const usedMemory = process.memoryUsage().heapUsed - memoryBefore
    //     console.log(usedMemory / 1024, 'KB')
    // })

    it.only('stream test', async () => {
        const stream: Readable = await mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            database: 'test',
            lockTables: false,
            output: {
                type: 'stream',
            },
            noCreateInfo: true,
            skipComments: true,
            noTablespaces: true,
            columnStatistics: false
        }) as Readable

        const writeStrem = createWriteStream('/tmp/poop')

        await pipeline(stream, writeStrem)
    })

    it.only('stream test', async () => {
        const stream: Readable = await mysqlDump({
            host: 'mysql.localtest.me',
            user: 'dbuser',
            password: 'dbpassword',
            database: 'noexist',
            lockTables: false,
            output: {
                type: 'stream',
            },
            noCreateInfo: true,
            skipComments: true,
            noTablespaces: true,
            columnStatistics: false
        }) as Readable

        const writeStrem = createWriteStream('/tmp/poop')

        await assert.rejects(() => pipeline(stream, writeStrem), (e: Error) => {
            assert(e.message.includes('1049: Unknown database \'noexist\''))
            return true
        })
    })
})
