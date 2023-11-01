# Restic

Features
- [X] Enought implementation to make backups, etc
- [ ] Add for output methods events and stream type (ex snapshots, eventEmitter.on('snaphost', () => ...) and stream with snapshots)
- [ ] Create output types (snapshots, diff, ls, find, etc)


```typescript

import { Restic } from '@gallofeliz/restic'

const restic = new Restic({
    logger: ...
})

/*
    Idea: instead of "stupid" repository, why not

    {
        provider: 's3',
        bucket: 'my-bucket',
        accessKeyId: 'bla'
        ...
    }

    and put password, that is not repository password but restic password, out
    of repository object, in options. See Repository Keys (we can use repository and various passwords)

*/
const repository = {
    location: '...',
    password: '...',
    accessKeyId: '...',
    // ...
}

await restic.init({repository})
await restic.backup({repository, paths: ['/home/me', '/my/app/data']})
// ...

const myAwsBucketRestic = restic.child({
    repository
})
// or
const myAwsBucketRestic = new Restic({
    repository,
    logger
})

await myAwsBucketRestic.init()
await myAwsBucketRestic.backup({paths: ['/etc', '/var/log']})

const myAwsBucketResticForPersoBackups = myAwsBucketRestic.child({
    tags: ['perso']
})

await myAwsBucketResticForPersoBackups.backup({paths: ['/home/me']})
// or
await myAwsBucketRestic.backup({paths: ['/home/me'], tags: ['perso']})
// or
await restic.backup({paths: ['/home/me'], tags: ['perso'], repository})
// or
await (new Restic).backup({paths: ['/home/me'], tags: ['perso'], repository, logger: /*...*/})

// Idea, not implemented yet
// import { backup } from '@gallofeliz/restic'
// await backup({paths: ['/home/me'], tags: ['perso'], repository, logger: /*...*/})

const firstSnapshot = (await myAwsBucketRestic.snapshots())[0]

await myAwsBucketRestic.dump({
    snapshotId: firstSnapshot.id,
    path: '/home/me/.bashrc',
    stream: fs.createWriteStream('/home/me/recover/.bashrc')
})

// etc
```
