import { createLogger } from '@gallofeliz/logger'
import { Restic, ResticSnapshot } from '.'
import { rm, mkdir } from 'fs/promises'
import { createWriteStream } from 'fs'

describe('restic', () => {
    const repositoryLocation = '/tmp/restic-test/repository' + Math.random()
    const downloadLocation = '/tmp/restic-test-download' + Math.random()
    const repository = {
        location: repositoryLocation,
        password: 'test'
    }
    const logger = createLogger()
    const restic = new Restic({logger, host: 'test-hostname', tags: ['global-tag']})
    const fsRestic = restic.child({repository})

    before(async () => {
        await mkdir(downloadLocation, {recursive: true})
    })

    after(async () => {
        await rm(repositoryLocation, { recursive: true })
        await rm(downloadLocation, {recursive: true})
    })

    it('init', async () => {
        await restic.init({
            repository
        })
    }).timeout(5000)

    it('backup 1', async () => {
        await fsRestic.backup({
            paths: [__dirname],
            excludes: [__dirname + '/node_modules'],
            tags: ['specific-tag-all-dir']
        })
    }).timeout(5000)

    it('backup 2', async () => {
        await fsRestic.backup({
            paths: [__dirname + '/test.ts'],
            tags: ['specific-tag-one-file']
        })
    }).timeout(5000)

    it('backup 3', async () => {
        await fsRestic.backup({
            paths: [__dirname],
            iexcludes: ['node_modules'],
            tags: ['specific-tag-all-dir']
        })
    }).timeout(5000)

    let snapshots: ResticSnapshot[]

    it('snapshots', async () => {
        console.log(
            snapshots = await fsRestic.snapshots()
        )
    }).timeout(5000)

    it('find', async () => {
        console.log(
            await fsRestic.find({pattern: 'test.ts'})
        )
    }).timeout(5000)

    it('ls', async () => {
        console.log(
            await fsRestic.ls({snapshotId: snapshots[0].id })
        )
    }).timeout(5000)

    it('check', async () => {
        await fsRestic.check()
    }).timeout(5000)

    it('download-snaphots', async () => {
        await fsRestic.dump({
            format: 'zip',
            snapshotId: snapshots[0].id,
            stream: createWriteStream(downloadLocation + '/file.zip')
        })

        await fsRestic.dump({
            snapshotId: snapshots[0].id,
            stream: createWriteStream(downloadLocation + '/file2.ts'),
            path: __dirname + '/test.ts'
        })

    }).timeout(5000)

    it('prune', async () => {
        await fsRestic.prune()
    }).timeout(5000)

    it('forget', async() => {
        await fsRestic.forget({snapshotIds: [snapshots[0].id, snapshots[1].id], prune: true})
    }).timeout(5000)

    it('snapshots', async () => {
        console.log(
            snapshots = await fsRestic.snapshots()
        )
    }).timeout(5000)

    it('backup olds', async () => {
        await fsRestic.backup({
            paths: [__dirname],
            excludes: [__dirname + '/node_modules'],
            tags: ['specific-tag-all-dir'],
            time: new Date('2023-01-01T12:00:00+01:00')
        })

        await fsRestic.backup({
            paths: [__dirname],
            excludes: [__dirname + '/node_modules'],
            tags: ['specific-tag-all-dir'],
            time: new Date('2023-02-01T12:00:00+01:00')
        })

        await fsRestic.backup({
            paths: [__dirname],
            excludes: [__dirname + '/node_modules'],
            tags: ['specific-tag-all-dir'],
            time: new Date('2023-02-03T12:00:00+01:00')
        })

        await fsRestic.backup({
            paths: [__dirname + '/test.ts'],
            tags: ['specific-tag-one-file'],
            time: new Date('2023-02-06T12:00:00+01:00')
        })

        await fsRestic.backup({
            paths: [__dirname],
            excludes: [__dirname + '/node_modules'],
            tags: ['specific-tag-all-dir'],
            time: new Date('2023-02-09T12:00:00+01:00')
        })
    }).timeout(10000)

    it('snapshots', async () => {
        console.log(
            snapshots = await fsRestic.snapshots()
        )
    }).timeout(5000)

    it('forget', async() => {
        await fsRestic.forget({keepMonthly: 12, prune: true})
    }).timeout(5000)

    it('snapshots', async () => {
        console.log(
            snapshots = await fsRestic.snapshots()
        )
    }).timeout(5000)

    it('diff', async () => {
        console.log(
            await fsRestic.diff({
                snaphostIdA: snapshots[0].id,
                snaphostIdB: snapshots[1].id
            })
        )
    }).timeout(5000)

})
