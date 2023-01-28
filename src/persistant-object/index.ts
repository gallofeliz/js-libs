import { Observable, Change,  } from 'object-observer'
import { readFile, writeFile } from 'fs/promises'
import { watch } from 'fs'
import { EventEmitter } from 'events'

interface Obj extends Object {}
type ObservableObject<Obj> = EventEmitter&Obj

/**
 *
 * Should be good to have observable deep object like myobject.user.on('change') for myboject.user = { firstname, lastname } for example
 * A config live update
 *
 *
 * Use https://github.com/sindresorhus/on-change if validation needed (for config ?)
 *
 */

export function createObservableObject<O extends Obj>(obj: Obj = {}): ObservableObject<O> {
    const original = new EventEmitter

    Object.assign(original, obj)

    const observable = Observable.from(original, { async: true })

    const ignoreProperties = ['_eventsCount', '_events', '_maxListeners', ...Object.keys(EventEmitter.prototype)]

    Object.defineProperties(observable, ignoreProperties.reduce((properties, property) => ({...properties, [property]: {enumerable: false}}), {}))

    Observable.observe(observable, changes => {
        const filteredChanges = changes.filter((change: any) => !ignoreProperties.includes(change.path[0]))
        if (filteredChanges.length === 0) {
            return
        }
        (observable as EventEmitter).emit('change', filteredChanges)
    })

    return observable as ObservableObject<O>
}

export async function configureFileAutoSaveObservableObject<OO extends ObservableObject<Obj>>(obsObject: OO, filename: string): Promise<OO> {

    async function saveFileContent() {
        // Use of https://github.com/npm/write-file-atomic to reduce watches call ?
        await writeFile(filename, JSON.stringify(obsObject, undefined, 4), { encoding: 'utf8' })
    }

    obsObject.on('change', (changes) => {
        saveFileContent()
    })

    await saveFileContent()

    return obsObject
}

export async function configureFileAutoLoadObservableObject<OO extends ObservableObject<Obj>>(obsObject: OO, filename: string, watchChanges?: boolean, abortSignal?: AbortSignal): Promise<OO> {

    async function getFileContent(maybeWriting = false) {
        try {
            const content = await readFile(filename, { encoding: 'utf8' })
            if (!content && maybeWriting) {
                return
            }
            return JSON.parse(content)
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                return
            }
            if (e.name === 'SyntaxError' && maybeWriting) {
                return
            }
            throw e
        }
    }

    const fileContent = await getFileContent()

    if (fileContent) {
        Object.assign(obsObject, fileContent)
    }

    if (watchChanges) {
        if (!fileContent) {
            await writeFile(filename, '{}')
        }
        watch(filename, { signal: abortSignal }, async (a, b) => {
            const fileContent = await getFileContent(true)

            if (!fileContent || JSON.stringify(obsObject) === JSON.stringify(fileContent)) {
                return
            }

            Object.assign(obsObject, fileContent)
        })
    }

    return obsObject
}

export async function createFilePersistantObservableObject<O extends Obj>(obj: O, filename: string, watchChanges?: boolean, abortSignal?: AbortSignal): Promise<ObservableObject<O>> {
    return await configureFileAutoSaveObservableObject(
        await configureFileAutoLoadObservableObject(
            createObservableObject(obj || {}),
            filename,
            watchChanges,
            abortSignal
        ),
        filename
    )
}
