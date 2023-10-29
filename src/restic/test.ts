import { createLogger } from '@gallofeliz/logger'
import { Restic, ResticSnapshot } from '.'
import { rm } from 'fs/promises'

describe('restic', () => {
    const repositoryLocation = '/tmp/restic-test' + Math.random()
    const repository = {
        location: repositoryLocation,
        password: 'test'
    }
    const logger = createLogger()
    const restic = new Restic({logger, hostname: 'test-hostname'})
    const fsRestic = restic.child({repository})

    after(async () => {
        await rm(repositoryLocation, { recursive: true })
    })

    it('init', async () => {
        await restic.initRepository({
            repository
        })
    }).timeout(5000)

    it('backup', async () => {
        await fsRestic.backup({
            paths: [__dirname + '/test.ts'],
            tags: ['mon-tag']
        })
    }).timeout(5000)

    let snapshots: ResticSnapshot[]

    it('snapshots', async () => {
        console.log(
            snapshots = await fsRestic.listSnapshots()
        )
    }).timeout(5000)

    it('snapshots', async () => {
        console.log(
            await fsRestic.getSnapshot({snapshotId: snapshots[0].id })
        )
    }).timeout(5000)
})
