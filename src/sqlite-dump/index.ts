import { Logger } from '@gallofeliz/logger'
import { runProcess } from '@gallofeliz/run-process'
import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { createGzip } from 'zlib'

type SqliteDumpOutputOpts =
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

export interface SqliteDumpOpts {
    filename: string
    table?: string
    onlySchema?: boolean
    output?: SqliteDumpOutputOpts
    logger: Logger
    abortSignal?: AbortSignal
}

export async function sqliteDump(opts: SqliteDumpOpts) {
    const command = [
        'sqlite3',
        '--readonly',
        opts.filename,
        opts.onlySchema ? '.schema' : '.dump',
        ...opts.table ? [opts.table] : []
    ]

    const output: SqliteDumpOutputOpts = opts.output || {type: 'text'}

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

    if (output.type === 'file' && output.compress && stream) {
        const gzip = createGzip()
        gzip.pipe(stream)
        stream = gzip
    }

    return await runProcess({ // MYSQL_PWD env alternative
        command,
        logger: opts.logger,
        outputType: !stream ? 'text' : undefined,
        outputStream: stream,
        abortSignal: opts.abortSignal
    })
}
