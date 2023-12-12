import { execa } from 'execa'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { Transform } from 'stream'
import { createGzip } from 'zlib'

type MysqlDumpOutputOpts =
    {
        type: 'text'
    } | {
        type: 'stream'
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
    const args = [
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

    const proc = execa( // MYSQL_PWD env alternative
        'mysqldump',
        args,
        {
            buffer: output.type === 'text',
            env: {
                MYSQL_PWD: opts.password
            },
            signal: opts.abortSignal
        }
    )

    if (output.type === 'text') {
        return (await proc).stdout
    }

    if (output.type === 'stream') {

        let lastStderr = ''

        proc.stderr!.on('data', (chunk) => lastStderr = chunk.toString())

        const stream = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk, encoding)
                callback()
            },
            flush(callback) {
                proc
                    .then(() => callback())
                    .catch((e) => callback(new Error(lastStderr, {
                        cause: e
                    })))
            }
        })

        proc.stdout!.pipe(stream)

        return stream
    }

    // Need Execa up version to handle errors with pipe

    const fsStream = createWriteStream(output.filepath, { flags: 'w', encoding: output.compress ? 'binary' : 'utf8' })

    if (!output.compress) {
        return await proc.pipeStdout!(fsStream)
    }

    await proc.pipeStdout!(createGzip()).pipeStdout!(fsStream)
}
