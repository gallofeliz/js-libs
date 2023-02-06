import { Observable } from 'object-observer'
import { readFile, writeFile, access, constants } from 'fs/promises'
import { UniversalLogger } from '@gallofeliz/logger'

export interface CreateFilePersistantObjectOpts {
    filename: string
    onSaveError?: (error: Error) => void
    logger?: UniversalLogger
}

export async function createFilePersistantObject<T>({filename, onSaveError}: CreateFilePersistantObjectOpts): Promise<Partial<T>> {
    try {
        await access(filename, constants.W_OK)
    } catch (e) {
        if ((e as any).code === 'ENOENT') {
            await writeFile(filename, '{}')
        } else {
            throw e
        }
    }

    const observable = Observable.from(
        JSON.parse(await readFile(filename, { encoding: 'utf8' })),
        { async: true }
    )

    Observable.observe(observable, async () => {
        // Use of https://github.com/npm/write-file-atomic ?
        try {
            await writeFile(filename, JSON.stringify(observable, undefined, 4), { encoding: 'utf8' })
        } catch (e) {
            onSaveError(e as Error)
        }
    })

    return observable
}
