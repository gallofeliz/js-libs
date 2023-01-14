import { Observable, Change,  } from 'object-observer'
import { readFile, writeFile } from 'fs/promises'

export interface PersistantObjectHandler {
    load(): Promise<Object|void>
    save(object: Object, changes: Change[]): Promise<void>
}

export class PersistantObjectFileHandler {
    protected filename

    constructor(filename: string) {
        this.filename = filename
    }

    async load() {
        try {
            return JSON.parse(await readFile(this.filename, { encoding: 'utf8' }))
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                return
            }
            throw e
        }
    }

    async save(object: Object, changes: Change[]) {
        // No matter changes with files, we will update all the file
        await writeFile(this.filename, JSON.stringify(object), { encoding: 'utf8' })
    }
}

class PersistantObject {
    protected handler: PersistantObjectHandler
    constructor(handler: PersistantObjectHandler) {
        this.handler = handler
    }

    protected onChange(changes: Change[]) {
        this.handler.save(this, changes)
    }
}

export default async function createPersistantObject<T>(initialValue: T, handler: PersistantObjectHandler): Promise<T> {
    const loadedValue = await handler.load()

    const observable = Observable.from(loadedValue || {}, { async: true })

    Observable.observe(observable, changes => handler.save(observable, changes))

    if (!loadedValue) {
    	Object.assign(observable, initialValue)
    }

    return observable as T
}
