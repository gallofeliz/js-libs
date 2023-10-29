import { Logger } from '@gallofeliz/logger'
import { runProcess, ProcessConfig } from '@gallofeliz/run-process'
import { reduce, flatten, map, omitBy, isNil, pick, uniq } from 'lodash'

/** @type integer */
type integer = number

type ResticListTags = string[]
//type ResticRecordTags = Record<string, string> | string[]

export interface ResticSnapshot {
    time: string
    host: string
    tags: ResticListTags //ResticRecordTags
    id: string
    objects?: object[]
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
    logger: Logger
    abortSignal?: AbortSignal
    repository: ResticRepository
    networkLimit?: ResticNetworkLimit
    host?: string
    tags?: ResticListTags //ResticRecordTags
}

export interface ResticForgetPolicy {
    nbOfHourly?: integer
    nbOfdaily?: integer
    nbOfWeekly?: integer
    nbOfMonthly?: integer
    nbOfYearly?: integer
    minTime?: number
}

export class Restic {
    protected defaultOpts: Partial<ResticOpts>

    public constructor(defaultOpts: Partial<ResticOpts> = {}) {
        this.defaultOpts = defaultOpts
    }

    public child(opts: Partial<ResticOpts>): Restic {
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

    public async find(opts: Partial<ResticOpts> & { pattern: string | string[] }) {
        await this.unlock(opts)

        return await this.runRestic({
            cmd: 'find',
            outputType: 'json',
            args: ['--long', ...Array.isArray(opts.pattern) ? opts.pattern : [opts.pattern]],
            ...opts
        })
    }

    public async snapshots(opts: Partial<ResticOpts> = {}): Promise<ResticSnapshot[]> {
        await this.unlock(opts)

        const snapshots: ResticSnapshot[] = await this.runRestic({
            cmd: 'snapshots',
            outputType: 'json',
            ...opts
        })

        // snapshots.forEach((snapshot) => {
        //     snapshot.tags = this.tagsArrayToRecord(snapshot.tags as any as ResticListTags) // todo fix
        // })

        return snapshots
    }

    public async forget(opts: Partial<ResticOpts> & { policy: ResticForgetPolicy }) {
        await this.unlock(opts)

        const retentionPolicyMapping: Record<string, string> = {
            'nbOfHourly': 'hourly',
            'nbOfdaily': 'daily',
            'nbOfWeekly': 'weekly',
            'nbOfMonthly': 'monthly',
            'nbOfYearly': 'yearly',
            'minTime': 'within'
        }

        const retentionPolicyArgs: string[] = flatten(map(omitBy(opts.policy, isNil), (retentionValue, retentionKey) => {
            if (!retentionPolicyMapping[retentionKey]) {
                throw new Error('Unknown policy rule ' + retentionKey)
            }

            return ['--keep-' + retentionPolicyMapping[retentionKey], retentionValue.toString()]
        })) as string[]

        await this.runRestic({
            cmd: 'forget',
            args: ['--prune', ...retentionPolicyArgs],
            ...opts
        })
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

    public async backup(opts: Partial<ResticOpts> & { paths: string[], excludes?: string[] }) {
        await this.unlock(opts)

        await this.runRestic({
            cmd: 'backup',
            args: [
                ...opts.paths,
                ...opts.excludes ? opts.excludes.map(exclude => '--exclude=' + exclude) : []
            ],
            ...opts
        })
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

    public async ls(opts: Partial<ResticOpts> & { snapshotId: string }): Promise<ResticSnapshot> {
        await this.unlock(opts)

        const [infos, ...objects]: [ResticSnapshot, object[]] = await this.runRestic({
            cmd: 'ls',
            args: ['--long', opts.snapshotId],
            outputType: 'multilineJson',
            ...opts
        })

        return {
            ...infos,
            // tags: this.tagsArrayToRecord(infos.tags as any), // Todo fix
            objects: objects
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

    protected async runRestic<T>(
        {cmd, args, outputType, outputStream, ...opts}:
        Partial<ResticOpts> & {cmd: string, args?: string[], outputStream?: NodeJS.WritableStream, outputType?: ProcessConfig['outputType']}
    ): Promise<T> {

        const {repository, logger, host, abortSignal, tags, networkLimit} = this.mergeOptsWithDefaults(opts)

        const cmdArgs: string[] = [cmd, '--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (host) {
            cmdArgs.push('--host', host)
        }

        if (tags) {
            tags/*this.tagsRecordToArray(tags)*/.forEach(tag => cmdArgs.push('--tag', tag))
        }

        // Don't apply limits for local disk ...
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
            ...this.getProviderEnvs(repository)
        }

        return await runProcess({
            env: {...env/*, RESTIC_CACHE_DIR: '/var/cache/restic'*/},
            logger,
            command: ['restic', ...cmdArgs],
            abortSignal,
            outputType,
            killSignal: 'SIGINT',
            outputStream
        })
    }

    public explainLocation(location: string) {
        if (location.substr(0, 1) === '/' || !location.includes(':')) { // I don't know the rule ...
            location = 'fs::' + location
        }

        const [service, container, path] = location.split(':')

        const provider = (() => {
            switch(service) {
                case 'fs':
                    return 'fs'
                case 'swift':
                    return 'os'
                case 's3':
                    return 'aws'
                case 'b2':
                    return 'b2'
                case 'azure':
                    return 'azure'
                case 'gs':
                    return 'google'
                case 'rclone':
                    return 'rclone'
                default:
                    throw new Error('Unknown provider')
            }
        })()

        return {provider, container, path}
    }

    protected getProviderEnvs(repository: ResticRepository): Record<string, string> {
        const {provider} = this.explainLocation(repository.location)

        return reduce(repository.locationParams || {}, (providerEnvs: Record<string, string>, value: string, key: string) => {
            providerEnvs[provider.toUpperCase() + '_' + key.split(/(?=[A-Z])/).join('_').toUpperCase()] = value.toString()

            return providerEnvs
        }, {})
    }
    /*
    protected tagsArrayToRecord(tags: ResticListTags): ResticRecordTags {
        return reduce(tags, (record, stringifyed) => {
            const [key, ...valueParts] = stringifyed.split('=')
            return {
                ...record,
                [key]: valueParts.join('=')
            }
        }, {})
    }

    protected tagsRecordToArray(tags: ResticRecordTags): ResticListTags {
        return Array.isArray(tags) ? tags : reduce(tags, (list, value, key) => {
            return [
                ...list,
                key + '=' + value
            ]
        }, [] as ResticListTags)
    }
    */
}
