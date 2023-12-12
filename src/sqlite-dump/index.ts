import execa from 'execa'
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
    abortSignal?: AbortSignal
}

export interface SqliteBackupOpts {
    filename: string
    outputFilename: string
    abortSignal?: AbortSignal
}

export async function sqliteBackup(opts: SqliteBackupOpts) {
   const command = [
        'sqlite3',
        '--readonly',
        opts.filename,
        '.backup ' + opts.outputFilename
    ]

    await mkdir(dirname(opts.outputFilename), {recursive: true})

    await runProcess({
        command,
        abortSignal: opts.abortSignal
    })
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

    return await runProcess({
        command,
        outputType: !stream ? 'text' : undefined,
        outputStream: stream,
        abortSignal: opts.abortSignal
    })
}
