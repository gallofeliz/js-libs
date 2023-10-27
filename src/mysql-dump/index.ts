import { Logger } from '@gallofeliz/logger'
import { runProcess } from '@gallofeliz/run-process'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'

type MysqlDumpOutputOpts =
    {
        type: 'text'
    } | {
        type: 'stream'
        stream: NodeJS.WritableStream
    } | {
        type: 'file'
        filepath: string
        // compress: boolean
    }

export interface MysqlDumpOpts {
    host: string
    user: string
    password: string
    database: string
    table?: string
    tableCondition?: string
    type?: 'data' | 'schema' | 'schema+data'
    output?: MysqlDumpOutputOpts
    logger: Logger
    lockTables?: boolean
    extendedInsert?: boolean
    abortSignal?: AbortSignal
}

export async function mysqlDump(opts: MysqlDumpOpts) {
    const command = [
        'mysqldump',
        '-h', opts.host,
        opts.database,
        ...opts.table ? [opts.table] : [],
        ...opts.tableCondition ? ['--where', opts.tableCondition] : [],
        '-u', opts.user,
        // '-p' + opts.password,
        ...opts.lockTables !== undefined ? ['--lock-tables=' + (opts.lockTables ? 'true' : 'false')] : [],
        ...opts.extendedInsert !== undefined ? ['--extended-insert=' + (opts.extendedInsert ? 'true' : 'false')] : [],
        ...opts.type && ['data', 'schema'].includes(opts.type) ? [opts.type === 'data' ? '--no-create-info' : '--no-data'] : [],
        '--no-tablespaces',
        '--column-statistics=0'
    ]

    const output: MysqlDumpOutputOpts = opts.output || {type: 'text'}

    if (output.type === 'file') {
        await mkdir(dirname(output.filepath), {recursive: true})
    }

    const stream = output.type === 'text'
        ? undefined
        : (
            output.type === 'file'
            ? createWriteStream(output.filepath, { flags: 'w' })
            : output.stream
        )

    const logger = opts.logger.child()

    logger.setProcessors([...logger.getProcessors(), (log) => {
        if (log.env?.MYSQL_PWD) {
            log.env.MYSQL_PWD = '***'
        }
        return log
    }])

    return await runProcess({ // MYSQL_PWD env alternative
        command,
        logger,
        outputType: !stream ? 'text' : undefined,
        outputStream: stream,
        abortSignal: opts.abortSignal,
        env: {
            MYSQL_PWD: opts.password
        }
    })
}

// function refineDump(value: string) {
//     return value.split('\n').filter(line => {
//         if (line.substr(0, 6) === 'INSERT') {
//             return true
//         }
//         if (line.substr(0, 6) === 'DELETE') {
//             return true
//         }
//         return false
//     }).join('\n');
// }
