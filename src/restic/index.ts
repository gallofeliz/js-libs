import { Logger } from '@gallofeliz/logger'
import { runProcess, ProcessConfig } from '@gallofeliz/run-process'
import { reduce, flatten, map, omitBy, isNil, pick } from 'lodash'

/** @type integer */
type integer = number

type ResticListTags = string[]
//type ResticRecordTags = Record<string, string> | string[]

export interface ResticSnapshot {
    time: string
    hostname: string
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
    hostname?: string
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

        if (!merged.logger) {
            throw new Error('Missing logger')
        }

        if (!merged.repository) {
            throw new Error('Missing repository')
        }

        return merged as Partial<ResticOpts> & Pick<ResticOpts, 'logger' | 'repository'>
    }

    public async initRepository(opts: Partial<ResticOpts> = {}) {
        await this.runRestic({
            cmd: 'init',
            ...opts,
            hostname: undefined
        })
    }

    public async listSnapshots(opts: Partial<ResticOpts> = {}): Promise<ResticSnapshot[]> {
        await this.unlockRepository(opts)

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

    public async forgetAndPrune(opts: Partial<ResticOpts> & { policy: ResticForgetPolicy }) {
        await this.unlockRepository(opts)

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

    public async backup(opts: Partial<ResticOpts> & { paths: string[], excludes?: string[] }) {
        await this.unlockRepository(opts)

        await this.runRestic({
            cmd: 'backup',
            args: [
                ...opts.paths,
                ...opts.excludes ? opts.excludes.map(exclude => '--exclude=' + exclude) : []
            ],
            ...opts
        })
    }

    public async downloadSnapshot(opts: Partial<ResticOpts> & { format: 'zip' | 'tar', snapshotId: string, path?: string, stream: NodeJS.WritableStream }) {
        await this.unlockRepository(opts)

        await this.runRestic({
            cmd: 'dump',
            args: ['--archive', opts.format, opts.snapshotId, opts.path || '/'],
            outputStream: opts.stream,
            ...opts
        })
    }

    public async getSnapshot(opts: Partial<ResticOpts> & { snapshotId: string }): Promise<ResticSnapshot> {
        await this.unlockRepository(opts)

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

    public async checkRepository(opts: Partial<ResticOpts> = {}) {
        await this.unlockRepository(opts)

        await this.runRestic({
            cmd: 'check',
            ...opts
        })
    }

    protected async unlockRepository(opts: Partial<ResticOpts> = {}) {
        await this.runRestic({
            cmd: 'unlock',
            ...pick(opts, ['repository', 'logger', 'abortSignal', 'networkLimit']),
            hostname: undefined
        })
    }

    protected async runRestic<T>(
        {cmd, args, outputType, outputStream, ...opts}:
        Partial<ResticOpts> & {cmd: string, args?: string[], outputStream?: NodeJS.WritableStream, outputType?: ProcessConfig['outputType']}
    ): Promise<T> {

        const {repository, logger, hostname, abortSignal, tags, networkLimit} = this.mergeOptsWithDefaults(opts)

        const cmdArgs: string[] = [cmd, '--cleanup-cache', ...args || []]

        if (outputType === 'json' || outputType === 'multilineJson') {
            cmdArgs.push('--json')
        }

        if (hostname) {
            cmdArgs.push('--host', hostname)
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
            env: {...env, RESTIC_CACHE_DIR: '/var/cache/restic'},
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
