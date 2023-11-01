import { UniversalLogger } from '@gallofeliz/logger'
import { runProcess, ProcessConfig } from '@gallofeliz/run-process'
import { reduce, pick, uniq, omit, castArray } from 'lodash'
import dayjs from 'dayjs'
import camelcaseKeys from 'camelcase-keys';

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

export interface ResticRepository {
    location: string
    password: string
    locationParams?: Record<string, string>
}

export interface ResticNetworkLimit {
    uploadLimit?: number
    downloadLimit?: number
}

export interface ResticOpts {
    logger: UniversalLogger
    repository: ResticRepository
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

function extractProvider(location: string) {
    if (location.substr(0, 1) === '/' || !location.includes(':')) { // I don't know the rule ...
        return 'fs'
    }

    const locationProvider = location.split(':')[0]

    switch(locationProvider) {
        case 'rest':
            return 'restic_rest'
        case 'b2':
        case 'fs':
        case 'sftp':
        case 'azure':
        case 'rclone':
            return locationProvider
        case 's3':
            return 'aws'
        case 'gs':
            return 'google'
        case 'swift':
            return 'os'
        default:
            throw new Error('Unknown provider')
    }
}

const locationExplainMapping: any = {
    fs(location: string) {
        return { path: location }
    },
    restic_rest(location: string) {
        const parsedUrl = new URL('https://nodejs.org/api/url.html')
        return { path: parsedUrl.pathname, origin: parsedUrl.origin}
    },
    b2(location: string) {
        const [_, bucket, path] = location.split(':')
        return { bucket, path }
    },
    sftp(location: string) {
        // sftp:user@host:/srv/restic-repo
        const [_, authority, path] = location.split(':')
        return { authority, path }
    },
    azure(location: string) {
        const [_, bucket, path] = location.split(':')
        return { bucket, path }
    },
    rclone(location: string) {
        const [_, service, path] = location.split(':')
        return { service, path }
    },
    aws(location: string) {
        //  s3:s3.amazonaws.com/bucket_name/resti
        const [authority, bucket, path] = location.substring(3).split('/')
        return { authority, bucket, path }
    },
    google(location: string) {
        const [_, bucket, path] = location.split(':')
        return { bucket, path }
    },
    os(location: string) {
        const [_, container, path] = location.split(':')
        return { container, path }
    }
}

export function explainLocation(location: string) {

    let provider = extractProvider(location)

    const mapper = locationExplainMapping[provider]

    if (!mapper) {
        throw new Error('Unknow provider ' + provider)
    }

    return {
        provider,
        ...mapper(location)
    }
}

export class Restic {
    protected defaultOpts: Partial<ResticOpts>

    public constructor(defaultOpts: Omit<Partial<ResticOpts>, 'abortSignal'> = {}) {
        this.defaultOpts = defaultOpts
    }

    public child(opts: Omit<Partial<ResticOpts>, 'abortSignal'>): Restic {
        return new Restic({...this.defaultOpts, ...opts})
    }

    protected mergeOptsWithDefaults(opts: Partial<ResticOpts>): ResticOpts {
        const merged: Partial<ResticOpts> = {...this.defaultOpts, ...opts}

        if (this.defaultOpts.tags && opts.tags) {
            merged.tags = uniq([...this.defaultOpts.tags, ...opts.tags])
        }

        if (!merged.logger) {
            throw new Error('Missing logger')
        }

        if (!merged.repository) {
            throw new Error('Missing repository')
        }

        return merged as Partial<ResticOpts> & Pick<ResticOpts, 'logger' | 'repository'>
    }

    public async init(opts: Partial<ResticOpts> = {}) {
        await this.runRestic({
            cmd: 'init',
            ...opts,
            host: undefined,
            tags: undefined
        })
    }

    public async find(opts: Partial<ResticOpts> & { pattern: string | string[] }): Promise<ResticFindResult[]> {
        await this.unlock(opts)

        return await this.runRestic({
            cmd: 'find',
            outputType: 'json',
            args: ['--long', ...castArray(opts.pattern)],
            ...opts
        })
    }

    public async snapshots(opts: Partial<ResticOpts> & { paths?: string | string[] } = {}): Promise<ResticSnapshot[]> {
        await this.unlock(opts)

        return await this.runRestic({
            cmd: 'snapshots',
            outputType: 'json',
            args: [
                ...opts.paths ? (castArray(opts.paths)).map(path => '--path=' + path) : [],
            ],
            ...opts
        })
    }

    public async forget(
        opts: Partial<ResticOpts>
            & { prune?: boolean, dryRun?: boolean }
            & {
                snapshotIds?: string[]
                keepLast?: integer
                keepHourly?: integer
                keepDaily?: integer
                keepWeekly?: integer
                keepMonthly?: integer
                keepYearly?: integer
                keepTag?: string[]
                keepWithin?: string
                keepWithinHourly?: string
                keepWithinDaily?: string
                keepWithinWeekly?: string
                keepWithinMonthly?: string
                keepWithinYearly?: string
                groupBy?: string
            }
    ) {
        await this.unlock(opts)

        const data: string = await this.runRestic({
            cmd: 'forget',
            outputType: opts.dryRun ? 'text' : undefined,
            args: [
                ...opts.prune ? ['--prune'] : [],
                ...opts.dryRun ? ['--dry-run']: [],

                ...opts.keepLast !== undefined ? ['--keep-last=' + opts.keepLast] : [],
                ...opts.keepHourly !== undefined ? ['--keep-hourly=' + opts.keepHourly] : [],
                ...opts.keepDaily !== undefined ? ['--keep-daily=' + opts.keepDaily] : [],
                ...opts.keepWeekly !== undefined ? ['--keep-weekly=' + opts.keepWeekly] : [],
                ...opts.keepMonthly !== undefined ? ['--keep-monthly=' + opts.keepMonthly] : [],
                ...opts.keepYearly !== undefined ? ['--keep-yearly=' + opts.keepYearly] : [],
                ...opts.keepTag ? opts.keepTag.map(tag => '--keep-tag' + tag) : [],
                ...opts.keepWithin ? ['--keep-within=' + opts.keepWithin] : [],
                ...opts.keepWithinHourly ? ['--keep-within-hourly=' + opts.keepWithinHourly] : [],
                ...opts.keepWithinDaily ? ['--keep-within-daily=' + opts.keepWithinDaily] : [],
                ...opts.keepWithinWeekly ? ['--keep-within-weekly=' + opts.keepWithinWeekly] : [],
                ...opts.keepWithinMonthly ? ['--keep-within-monthly=' + opts.keepWithinMonthly] : [],
                ...opts.keepWithinYearly ? ['--keep-within-yearly=' + opts.keepWithinYearly] : [],
                ...opts.groupBy !== undefined ? ['--group-by=' + opts.groupBy] : [],

                ...opts.snapshotIds ? opts.snapshotIds : []
            ],
            ...opts
        })

        return opts.dryRun ? data : undefined
    }

    public async prune(opts: Partial<ResticOpts> = {}) {
        await this.unlock(opts)

        await this.runRestic({
            cmd: 'prune',
            ...opts,
            host: undefined,
            tags: undefined
        })
    }

    public async backup(
        opts: Partial<ResticOpts>
        & { paths: string | string[], excludes?: string | string[], iexcludes?: string | string[], time?: Date, dryRun?: boolean }
    ) {
        await this.unlock(opts)

        const data: Array<any> = await this.runRestic({
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
            outputType: 'multilineJson'
        })

        return omit(data.find(o => o.messageType === 'summary'), 'messageType')
    }

    public async dump(opts: Partial<ResticOpts> & { format?: 'zip' | 'tar', snapshotId: string, path?: string, stream: NodeJS.WritableStream }) {
        await this.unlock(opts)

        await this.runRestic({
            cmd: 'dump',
            args: ['--archive', opts.format || 'tar', opts.snapshotId, opts.path || '/'],
            outputStream: opts.stream,
            ...opts
        })
    }

    public async ls(opts: Partial<ResticOpts> & { snapshotId: string }): Promise<ResticSnapshotLs> {
        await this.unlock(opts)

        const [infos, ...objects]: [ResticSnapshot, ResticSnapshotLs['objects'][0]] = await this.runRestic({
            cmd: 'ls',
            args: ['--long', opts.snapshotId],
            outputType: 'multilineJson',
            ...opts
        })

        return {
            ...infos,
            objects
        }
    }

    public async check(opts: Partial<ResticOpts> = {}) {
        await this.unlock(opts)

        await this.runRestic({
            cmd: 'check',
            ...opts,
            host: undefined,
            tags: undefined
        })
    }

    public async unlock(opts: Partial<ResticOpts> = {}) {
        await this.runRestic({
            cmd: 'unlock',
            ...pick(opts, ['repository', 'logger', 'abortSignal', 'networkLimit']),
            host: undefined,
            tags: undefined
        })
    }

    public async rewrite(
        opts: Partial<ResticOpts>
        & { prune?: boolean, snapshotIds?: string | string[], excludes?: string | string[], iexcludes?: string | string[], dryRun?: boolean, paths?: string | string[] }
    ) {
        await this.unlock(opts)

        const data: string = await this.runRestic({
            cmd: 'rewrite',
            args: [
                //'-q',
                ...opts.dryRun ? ['--dry-run'] : [],
                ...opts.prune ? ['--prune'] : [],
                ...opts.excludes ? castArray(opts.excludes).map(exclude => '--exclude=' + exclude) : [],
                ...opts.iexcludes ? castArray(opts.iexcludes).map(exclude => '--iexclude=' + exclude) : [],
                ...opts.paths ? castArray(opts.paths).map(path => '--path=' + path) : [],
                ...opts.snapshotIds || []
            ],
            ...opts,
            outputType: opts.dryRun ? 'text' : undefined
        })

        if (!opts.dryRun) {
            return
        }

        return data
    }

    public async diff(opts: Partial<ResticOpts> & { snaphostIdA: string, snaphostIdB: string, path?: string }): Promise<ResticDiff> {
        await this.unlock(opts)

        const data: Array<any> = await this.runRestic({
            cmd: 'diff',
            ...opts,
            host: undefined,
            tags: undefined,
            outputType: 'multilineJson',
            args: [
                opts.snaphostIdA + (opts.path ? ':' + opts.path: ''),
                opts.snaphostIdB + (opts.path ? ':' + opts.path: '')
            ]
        })

        const stats = data.slice(-1)[0]
        const changes = data.slice(0, -1)

        return {
            ...omit(stats, 'messageType') as any,
            changes: changes.map(c => omit(c, 'messageType')) as ResticDiff['changes']
        }
    }

    protected async runRestic<T>(
        {cmd, args, outputType, outputStream, ...opts}:
        Partial<ResticOpts> & {cmd: string, args?: string[], outputStream?: NodeJS.WritableStream, outputType?: ProcessConfig['outputType']}
    ): Promise<T> {

        const {repository, logger, host, abortSignal, tags, networkLimit, backendConnections, cacheDir, packSize} = this.mergeOptsWithDefaults(opts)

        // perfs : cleanup cache can be run periodically even of each time
        const cmdArgs: string[] = [cmd, '--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (host) {
            cmdArgs.push('--host', host)
        }

        if (backendConnections) {
            cmdArgs.push('-o '+extractProvider(repository.location)+'.connections=' + backendConnections)
        }

        if (tags) {
            (castArray(tags)).forEach(tag => cmdArgs.push('--tag', tag))
        }

        // Don't apply limits for local disk ... or yes ?
        if (networkLimit && repository.location.substr(0, 1) !== '/') {

            if (networkLimit.uploadLimit) {
                cmdArgs.push('--limit-upload', (networkLimit.uploadLimit / 1024).toString())
            }

            if (networkLimit.downloadLimit) {
                cmdArgs.push('--limit-download', (networkLimit.downloadLimit / 1024).toString())
            }

        }

        const env = {
            RESTIC_REPOSITORY: repository.location,
            RESTIC_PASSWORD: repository.password,
            ...cacheDir && {RESTIC_CACHE_DIR: cacheDir},
            ...packSize && {RESTIC_PACK_SIZE: (packSize / 1024 / 1024).toString()},
            ...this.getProviderEnvs(repository)
        }

        const data = await runProcess({
            env,
            logger,
            command: ['restic', ...cmdArgs],
            abortSignal,
            outputType,
            killSignal: 'SIGINT',
            outputStream
        })

        return outputType === 'json' || outputType === 'multilineJson'
            ? camelcaseKeys(data as any, {deep: true})
            : data
    }

    protected getProviderEnvs(repository: ResticRepository): Record<string, string> {
        const provider = extractProvider(repository.location)

        return reduce(repository.locationParams || {}, (providerEnvs: Record<string, string>, value: string, key: string) => {
            providerEnvs[provider.toUpperCase() + '_' + key.split(/(?=[A-Z])/).join('_').toUpperCase()] = value.toString()

            return providerEnvs
        }, {})
    }

}
