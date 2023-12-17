import {execa, type ExecaChildProcess} from 'execa'
import { reduce, pick, uniq, omit, castArray } from 'lodash-es'
import dayjs from 'dayjs'
import camelcaseKeys from 'camelcase-keys'
import { type Readable, Transform } from 'stream'
import { json } from 'stream/consumers'
import { type ChildProcess } from 'child_process'

/** @type integer */
type integer = number

export interface ResticSnapshot {
    time: string
    host: string
    tags: string[] //ResticRecordTags
    id: string
}

export interface ResticSnapshotLs extends ResticSnapshot{
    objects: Array<{
        name: string
        type: 'file' | 'dir' | string
        path: string
        permissions: string
        size?: number
    }>
}

export interface ResticDiff {
    sourceSnapshot: string
    targetSnapshot: string
    changes: Array<{
        path: string
        modifier: '-' | '+' | string
    }>
}

export interface ResticFindResult {
    snapshot: string
    hits: integer
    matches: Array<{
        path: string
        permissions: string
        type: 'file' | 'dir' | string
        size?: number
    }>
}

export interface ResticRepositoryFs {
    type: 'fs'
    path: string
}

export interface ResticRepositoryS3 {
    type: 's3'
    authority: string
    bucketName: string
    path?: string
    accessKeyId?: string
    secretAccessKey?: string
    sessionToken?: string
    defaultRegion?: string
    profile?: string
    sharedCredentialsFile?: string
}

export interface ResticRepositoryAzure {
    type: 'azure'
    bucketName: string
    path?: string
    accountName?: string
    accountKey?: string
    accountSas?: string
    endpointSuffix?: string
}

export interface ResticRepositorySftp {
    type: 'sftp'
    authority: string
    path?: string
}

export interface ResticRepositoryRest {
    type: 'resticRest'
    url: string
    restUsername?: string
    restPassword?: string
}

export interface ResticRepositorySwift {
    type: 'swift'
    containerName: string
    //path?: string
    [param: string]: string
}

export interface ResticRepositoryB2 {
    type: 'b2'
    bucketName: string
    path?: string
    accountId: string
    accountKey: string
}

export interface ResticRepositoryGs {
    type: 'gs'
    bucketName: string
    path?: string
    projectId: string
    applicationCredentials?: string
}

export interface ResticRepositoryRclone {
    type: 'rclone'
    service: string
    path?: string
    bwlimit?: string
}

export type ResticRepository =
    ResticRepositoryFs
    | ResticRepositoryS3
    | ResticRepositoryAzure
    | ResticRepositorySftp
    | ResticRepositoryRest
    | ResticRepositorySwift
    | ResticRepositoryB2
    | ResticRepositoryGs
    | ResticRepositoryRclone

export interface ResticNetworkLimit {
    uploadLimit?: number
    downloadLimit?: number
}

export interface ResticOpts {
    repository: ResticRepository
    password: string
    abortSignal?: AbortSignal
    networkLimit?: ResticNetworkLimit
    host?: string
    tags?: string | string[]
    cacheDir?: string
    packSize?: number
    backendConnections?: integer
}

/*
export async function backup(opts: Partial<ResticOpts> = {}) {
    return (new Restic).backup(opts)
}
*/

export class Restic {
    protected defaultOpts: Partial<ResticOpts>

    public constructor(defaultOpts: Omit<Partial<ResticOpts>, 'abortSignal'> = {}) {
        this.defaultOpts = defaultOpts
    }

    public child(opts: Omit<Partial<ResticOpts>, 'abortSignal'>): Restic {
        return new Restic({...this.defaultOpts, ...opts})
    }

    public init(opts: Partial<ResticOpts> = {}): Promise<Object> & { process: ChildProcess } {
        const {dataStream, proc} = this.runRestic({
            cmd: 'init',
            ...opts,
            host: undefined,
            tags: undefined,
            json: true
        })

        return Object.assign(
            (json(dataStream) as Promise<Object>).then((json) => this.formatCamelCase(json)) as Promise<Object>,
            { process: proc}
        )
    }

    public backup(
        opts: Partial<ResticOpts>
        & { paths: string | string[], excludes?: string | string[], iexcludes?: string | string[],
        time?: Date, dryRun?: boolean }
    ): Readable & { process: ChildProcess } {
        const {dataStream, proc} = this.runRestic({
            cmd: 'backup',
            args: [
                //'-q',
                '--no-scan',
                ...opts.dryRun ? ['--dry-run'] : [],
                ...opts.excludes ? castArray(opts.excludes).map(exclude => '--exclude=' + exclude) : [],
                ...opts.iexcludes ? castArray(opts.iexcludes).map(exclude => '--iexclude=' + exclude) : [],
                ...opts.time ? ['--time=' + dayjs(opts.time).format('YYYY-MM-DD HH:mm:ss')]: [],
                ...opts.paths
            ],
            ...opts,
            json: true,
            dataStreamIncludesStderr: true
        })

        return Object.assign(
            dataStream.map(data => {
                try {
                    return this.formatCamelCase(JSON.parse(data))
                } catch (e) {
                    // Fix STDERR mix json and no-json
                    return data.toString()
                }
            }),
            { process: proc }
        )
    }

    public snapshots(opts: Partial<ResticOpts> & { paths?: string | string[] } = {}): Promise<ResticSnapshot[]> & { process: ChildProcess } {
        const {dataStream, proc} = this.runRestic({
            cmd: 'snapshots',
            json: true,
            args: [
                ...opts.paths ? (castArray(opts.paths)).map(path => '--path=' + path) : [],
            ],
            ...opts,
        })

        return Object.assign(
            (json(dataStream) as Promise<Object>).then((json) => this.formatCamelCase(json)) as Promise<ResticSnapshot[]>,
            { process: proc}
        )

    }

    public async unlock(opts: Partial<ResticOpts> = {}) {
        const stream = this.runRestic({
            cmd: 'unlock',
            ...pick(opts, ['repository', 'abortSignal', 'networkLimit']),
            host: undefined,
            tags: undefined
        })

        return stream
    }

    // public async find(opts: Partial<ResticOpts> & { pattern: string | string[] }): Promise<ResticFindResult[]> {
    //     await this.unlock(opts)

    //     return await this.runRestic({
    //         cmd: 'find',
    //         outputType: 'json',
    //         args: ['--long', ...castArray(opts.pattern)],
    //         ...opts
    //     })
    // }

    // public async forget(
    //     opts: Partial<ResticOpts>
    //         & { prune?: boolean, dryRun?: boolean }
    //         & {
    //             snapshotIds?: string[]
    //             keepLast?: integer
    //             keepHourly?: integer
    //             keepDaily?: integer
    //             keepWeekly?: integer
    //             keepMonthly?: integer
    //             keepYearly?: integer
    //             keepTag?: string[]
    //             keepWithin?: string
    //             keepWithinHourly?: string
    //             keepWithinDaily?: string
    //             keepWithinWeekly?: string
    //             keepWithinMonthly?: string
    //             keepWithinYearly?: string
    //             groupBy?: string
    //         }
    // ) {
    //     await this.unlock(opts)

    //     const data: string = await this.runRestic({
    //         cmd: 'forget',
    //         outputType: opts.dryRun ? 'text' : undefined,
    //         args: [
    //             ...opts.prune ? ['--prune'] : [],
    //             ...opts.dryRun ? ['--dry-run']: [],

    //             ...opts.keepLast !== undefined ? ['--keep-last=' + opts.keepLast] : [],
    //             ...opts.keepHourly !== undefined ? ['--keep-hourly=' + opts.keepHourly] : [],
    //             ...opts.keepDaily !== undefined ? ['--keep-daily=' + opts.keepDaily] : [],
    //             ...opts.keepWeekly !== undefined ? ['--keep-weekly=' + opts.keepWeekly] : [],
    //             ...opts.keepMonthly !== undefined ? ['--keep-monthly=' + opts.keepMonthly] : [],
    //             ...opts.keepYearly !== undefined ? ['--keep-yearly=' + opts.keepYearly] : [],
    //             ...opts.keepTag ? opts.keepTag.map(tag => '--keep-tag' + tag) : [],
    //             ...opts.keepWithin ? ['--keep-within=' + opts.keepWithin] : [],
    //             ...opts.keepWithinHourly ? ['--keep-within-hourly=' + opts.keepWithinHourly] : [],
    //             ...opts.keepWithinDaily ? ['--keep-within-daily=' + opts.keepWithinDaily] : [],
    //             ...opts.keepWithinWeekly ? ['--keep-within-weekly=' + opts.keepWithinWeekly] : [],
    //             ...opts.keepWithinMonthly ? ['--keep-within-monthly=' + opts.keepWithinMonthly] : [],
    //             ...opts.keepWithinYearly ? ['--keep-within-yearly=' + opts.keepWithinYearly] : [],
    //             ...opts.groupBy !== undefined ? ['--group-by=' + opts.groupBy] : [],

    //             ...opts.snapshotIds ? opts.snapshotIds : []
    //         ],
    //         ...opts
    //     })

    //     return opts.dryRun ? data : undefined
    // }

    // public async prune(opts: Partial<ResticOpts> = {}) {
    //     await this.unlock(opts)

    //     await this.runRestic({
    //         cmd: 'prune',
    //         ...opts,
    //         host: undefined,
    //         tags: undefined
    //     })
    // }

    // public async dump(opts: Partial<ResticOpts> & { format?: 'zip' | 'tar', snapshotId: string, path?: string, stream: NodeJS.WritableStream }) {
    //     await this.unlock(opts)

    //     await this.runRestic({
    //         cmd: 'dump',
    //         args: ['--archive', opts.format || 'tar', opts.snapshotId, opts.path || '/'],
    //         outputStream: opts.stream,
    //         ...opts
    //     })
    // }

    // public async ls(opts: Partial<ResticOpts> & { snapshotId: string }): Promise<ResticSnapshotLs> {
    //     await this.unlock(opts)

    //     const [infos, ...objects]: [ResticSnapshot, ResticSnapshotLs['objects'][0]] = await this.runRestic({
    //         cmd: 'ls',
    //         args: ['--long', opts.snapshotId],
    //         outputType: 'multilineJson',
    //         ...opts
    //     })

    //     return {
    //         ...infos,
    //         objects
    //     }

    //     /*
    //         Todo

    //         Return infos & objects as stream (objectMode) on option

    //     */
    // }

    // public async check(opts: Partial<ResticOpts> = {}) {
    //     await this.unlock(opts)

    //     await this.runRestic({
    //         cmd: 'check',
    //         ...opts,
    //         host: undefined,
    //         tags: undefined
    //     })
    // }

    // public async rewrite(
    //     opts: Partial<ResticOpts>
    //     & { prune?: boolean, snapshotIds?: string | string[], excludes?: string | string[], iexcludes?: string | string[], dryRun?: boolean, paths?: string | string[] }
    // ) {
    //     await this.unlock(opts)

    //     const data: string = await this.runRestic({
    //         cmd: 'rewrite',
    //         args: [
    //             //'-q',
    //             ...opts.dryRun ? ['--dry-run'] : [],
    //             ...opts.prune ? ['--prune'] : [],
    //             ...opts.excludes ? castArray(opts.excludes).map(exclude => '--exclude=' + exclude) : [],
    //             ...opts.iexcludes ? castArray(opts.iexcludes).map(exclude => '--iexclude=' + exclude) : [],
    //             ...opts.paths ? castArray(opts.paths).map(path => '--path=' + path) : [],
    //             ...opts.snapshotIds || []
    //         ],
    //         ...opts,
    //         outputType: opts.dryRun ? 'text' : undefined
    //     })

    //     if (!opts.dryRun) {
    //         return
    //     }

    //     return data
    // }

    // public async diff(opts: Partial<ResticOpts> & { snaphostIdA: string, snaphostIdB: string, path?: string }): Promise<ResticDiff> {
    //     await this.unlock(opts)

    //     const data: Array<any> = await this.runRestic({
    //         cmd: 'diff',
    //         ...opts,
    //         host: undefined,
    //         tags: undefined,
    //         outputType: 'multilineJson',
    //         args: [
    //             opts.snaphostIdA + (opts.path ? ':' + opts.path: ''),
    //             opts.snaphostIdB + (opts.path ? ':' + opts.path: '')
    //         ]
    //     })

    //     const stats = data.slice(-1)[0]
    //     const changes = data.slice(0, -1)

    //     return {
    //         ...omit(stats, 'messageType') as any,
    //         changes: changes.map(c => omit(c, 'messageType')) as ResticDiff['changes']
    //     }
    // }

    protected runRestic(
        {cmd, args, json, dataStreamIncludesStderr, ...opts}:
        Partial<ResticOpts> & {cmd: string, args?: string[], json?: boolean, dataStreamIncludesStderr?: boolean}
    ): { dataStream: Readable, proc: ExecaChildProcess } {

        const {repository, host, abortSignal, tags, networkLimit, backendConnections, cacheDir, packSize, password} = this.mergeOptsWithDefaults(opts)

        // perfs : cleanup cache can be run periodically even of each time
        const cmdArgs: string[] = [cmd, '--cleanup-cache', ...args || []]

        if (json) {
            cmdArgs.push('--json')
        }

        if (host) {
            cmdArgs.push('--host', host)
        }

        if (backendConnections) {
            cmdArgs.push('-o '+repository.type+'.connections=' + backendConnections)
        }

        if (tags) {
            (castArray(tags)).forEach(tag => cmdArgs.push('--tag', tag))
        }

        // Don't apply limits for local disk ... or yes ?
        if (networkLimit && repository.type !== 'fs') {

            if (networkLimit.uploadLimit) {
                cmdArgs.push('--limit-upload', (networkLimit.uploadLimit / 1024).toString())
            }

            if (networkLimit.downloadLimit) {
                cmdArgs.push('--limit-download', (networkLimit.downloadLimit / 1024).toString())
            }

        }

        const env = {
            RESTIC_REPOSITORY: this.getRepositoryLocation(repository),
            RESTIC_PASSWORD: password,
            ...cacheDir && {RESTIC_CACHE_DIR: cacheDir},
            ...packSize && {RESTIC_PACK_SIZE: (packSize / 1024 / 1024).toString()},
            ...this.getRepositoryEnvs(repository)
        }

        const proc = execa('restic', cmdArgs, {
            env,
            signal: abortSignal,
            killSignal: 'SIGINT',
            buffer: false
        })

        let stderrText = ''

        proc.stdout!.on('data', () => {
            if (stderrText) {
                stderrText = ''
            }
        })

        proc.stderr!.on('data', (data) => {
            stderrText += data.toString()
        })

        const dataStream = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk, encoding)
                callback()
            },
            flush(callback) {
                proc.then(() => callback())
            }
        })

        dataStream.once('finish', () => dataStream.emit('close'))

        proc.stdout!.pipe(dataStream)

        if (dataStreamIncludesStderr) {
            proc.stderr!.pipe(dataStream)
        }

        proc.catch((e) => {
            dataStream.destroy(
                stderrText
                    ? new Error(stderrText.trim(), {cause: e})
                    : e
            )
        })

        return { dataStream, proc }
    }

    protected formatCamelCase(object: Object) {
        return camelcaseKeys(object, {deep: true})
    }

    protected getRepositoryLocation(repository: ResticRepository): string {
        switch(repository.type) {
            case 'fs':
                return repository.path
            case 'sftp':
                return 'sftp:' + repository.authority + (repository.path ? ':' + repository.path : '')
            case 'resticRest':
                return 'rest:' + repository.url
            case 's3':
                return 's3:' + repository.bucketName + (repository.path ? ':' + repository.path : '')
            case 'swift':
                return 'swift:' + repository.containerName + (repository.path ? ':' + repository.path : '')
            case 'b2':
                return 'b2:' + repository.bucketName + (repository.path ? ':' + repository.path : '')
            case 'azure':
                return 'azure:' + repository.bucketName + (repository.path ? ':' + repository.path : '')
            case 'gs':
                return 'gs:' + repository.bucketName + (repository.path ? ':' + repository.path : '')
            case 'rclone':
                return 'rclone:' + repository.service + (repository.path ? ':' + repository.path : '')
        }
    }

    protected getRepositoryEnvs(repository: ResticRepository): Record<string, string> {
        const prefixes = {
            s3: 'AWS',
            fs: '',
            azure: 'AZURE',
            gs: 'GOOGLE',
            swift: 'OS',
            rclone: 'RCLONE',
            resticRest: 'RESTIC_REST',
            sftp: '',
            b2: 'B2'
        }

        return reduce(omit(repository, ['type', 'path', 'bucketName', 'containerName', 'authority']), (providerEnvs: Record<string, string>, value: string | undefined, key: string) => {
            if (value !== undefined) {
                providerEnvs[prefixes[repository.type].toUpperCase() + '_' + key.split(/(?=[A-Z])/).join('_').toUpperCase()] = value.toString()
            }

            return providerEnvs
        }, {})
    }

    protected mergeOptsWithDefaults(opts: Partial<ResticOpts>): ResticOpts {
        const merged: Partial<ResticOpts> = {...this.defaultOpts, ...opts}

        if (this.defaultOpts.tags && opts.tags) {
            merged.tags = uniq([...castArray(this.defaultOpts.tags), ...castArray(opts.tags)])
        }

        if (!merged.repository) {
            throw new Error('Missing repository')
        }

        if (!merged.password) {
            throw new Error('Missing password')
        }

        return merged as Partial<ResticOpts> & Pick<ResticOpts, 'repository' | 'password'>
    }
}
