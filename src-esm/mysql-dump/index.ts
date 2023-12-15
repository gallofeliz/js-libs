import { execa } from 'execa'
import { Transform } from 'stream'

export interface MysqlDumpOpts {
    host: string
    user: string
    password: string
    database: string
    table?: string
    where?: string
    noCreateInfo?: boolean
    noData?: boolean
    lockTables?: boolean
    extendedInsert?: boolean
    abortSignal?: AbortSignal
    skipComments?: boolean
    compact?: boolean
    dumpDate?: boolean
    noTablespaces?: boolean
    additionnalParams?: string[]
    columnStatistics?: boolean
    binary?: string
}

function boolToStr(bool: boolean): 'true' | 'false' {
    return bool ? 'true' : 'false'
}

export function mysqlDump(opts: MysqlDumpOpts) {
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

    const proc = execa(
        opts.binary || 'mysqldump',
        args,
        {
            buffer: false,
            env: {
                MYSQL_PWD: opts.password
            },
            signal: opts.abortSignal
        }
    )

    let lastStderr = ''

    proc.stderr!.on('data', (chunk) => lastStderr = chunk.toString())

    const stream = new Transform({
        transform(chunk, encoding, callback) {
            this.push(chunk, encoding)
            callback()
        },
        flush(callback) {
            proc.then(() => callback())
                // .catch((e) => callback(lastStderr ? new Error(lastStderr, {
                //     cause: e
                // }) : e))
        }
    })

    proc.stdout!.pipe(stream)

    proc.catch((e) => stream.destroy(
        lastStderr
            ? new Error(lastStderr, {cause: e})
            : e
    ))

    return stream
}
