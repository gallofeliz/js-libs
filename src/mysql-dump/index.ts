import { Logger } from '@gallofeliz/logger'
import { runProcess } from '@gallofeliz/run-process'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { createGzip } from 'zlib'

type MysqlDumpOutputOpts =
    {
        type: 'text'
    } | {
        type: 'stream'
        stream: NodeJS.WritableStream
    } | {
        type: 'file'
        filepath: string
        compress?: boolean
    }

export interface MysqlDumpOpts {
    host: string
    user: string
    password: string
    database: string
    table?: string
    where?: string
    noCreateInfo?: boolean
    noData?: boolean
    output?: MysqlDumpOutputOpts
    logger: Logger
    lockTables?: boolean
    extendedInsert?: boolean
    abortSignal?: AbortSignal
    skipComments?: boolean
    compact?: boolean
    dumpDate?: boolean
    noTablespaces?: boolean
    additionnalParams?: string[]
    columnStatistics?: boolean
}

function boolToStr(bool: boolean): 'true' | 'false' {
    return bool ? 'true' : 'false'
}

export async function mysqlDump(opts: MysqlDumpOpts) {
    const command = [
        'mysqldump',
        '-h', opts.host,
        opts.database,
        ...opts.table ? [opts.table] : [],
        ...opts.where ? ['--where', opts.where] : [],
        '-u', opts.user,
        ...opts.lockTables !== undefined ? ['--lock-tables=' + boolToStr(opts.lockTables)] : [],
        ...opts.extendedInsert !== undefined ? ['--extended-insert=' + boolToStr(opts.extendedInsert)] : [],
        ...opts.noCreateInfo !== false ? ['--no-create-info'] : [],
        ...opts.noData === true ? ['--no-data'] : [],
        ...opts.compact ? ['--compact'] : [],
        ...opts.skipComments ? ['--skip-comments'] : [],
        ...opts.dumpDate !== undefined ? ['--dump-date=' + boolToStr(opts.dumpDate)] : [],
        ...opts.additionnalParams ? opts.additionnalParams : [],
        ...opts.noTablespaces ? ['--no-tablespaces'] : [],
        ...opts.columnStatistics !== undefined ? ['--column-statistics=' + boolToStr(opts.columnStatistics)] : []
    ]

    const output: MysqlDumpOutputOpts = opts.output || {type: 'text'}

    if (output.type === 'file') {
        await mkdir(dirname(output.filepath), {recursive: true})
    }

    let stream = output.type === 'text'
        ? undefined
        : (
            output.type === 'file'
            ? createWriteStream(output.filepath, { flags: 'w', encoding: output.compress ? 'binary' : 'utf8' })
            : output.stream
        )

    const logger = opts.logger.child()

    logger.setProcessors([...logger.getProcessors(), (log) => {
        if (log.env?.MYSQL_PWD) {
            log.env.MYSQL_PWD = '***'
        }
        return log
    }])

    if (output.type === 'file' && output.compress && stream) {
        const gzip = createGzip()
        gzip.pipe(stream)
        stream = gzip
    }

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
