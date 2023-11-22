import { Observable } from 'object-observer'
import { readFile, writeFile, access, constants } from 'fs/promises'
import { Logger } from '@gallofeliz/logger'

export type CreateFilePersistantObjectOpts = {
    filename: string
    onSaveError?: (error: Error) => void
    logger?: Pick<Logger, 'error'>
} & (
    { onSaveError: (error: Error) => void }
    | { logger: Pick<Logger, 'error'> }
)

export async function createFilePersistantObject<T>({filename, onSaveError, logger}: CreateFilePersistantObjectOpts): Promise<Partial<T>> {
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
        } catch (error) {
            if (logger) {
                logger.error('Unable to save persistant object', { error })
            }
            if (onSaveError) {
                onSaveError(error as Error)
            }
        }
    })

    return observable
}
