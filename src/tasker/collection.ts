import Datastore from '@seald-io/nedb'

export interface CollectionQuery {
    [filter: string]: any
}

export interface CollectionSort {
    [filter: string]: 1 | -1
}

export type CollectionUpdate<T> = T | {
    [filter: string]: any
}

export interface GenericDocument {
    _id: string
    [key: string]: any
}

export interface Collection<Document extends GenericDocument> {
    insert(t: Omit<Document, '_id'>): Promise<Document>
    update(query: CollectionQuery, update: CollectionUpdate<Document>): Promise<number>
    updateOne(query: CollectionQuery, update: CollectionUpdate<Document>, {returnDocument, assertUpdated}?: {returnDocument?: boolean, assertUpdated?: boolean}): typeof returnDocument extends true ? Promise<Document | undefined> : Promise<boolean>
    remove(query: CollectionQuery): Promise<number>
    removeOne(query: CollectionQuery, {assertRemoved}?: {assertRemoved?: boolean}): Promise<boolean>
    find(query: CollectionQuery, sort?: CollectionSort, limit?: number, skip?: number): Promise<Document[]>
    findOne(query: CollectionQuery, sort?: CollectionSort, {assertFound}?: {assertFound?: boolean}): Promise<Document | undefined>
}

export class NeDbCollection<Document extends GenericDocument> implements Collection<Document> {
    protected datastore: Datastore

    constructor({filePath}: {filePath: string}) {
        this.datastore = new Datastore({filename: filePath, autoload: true})
    }

    public async insert(document: Omit<Document, '_id'>) {
        return await this.datastore.insertAsync(document) as Document
        // if (await this.findOne({uuid: job.getUuid()})) {
        //     return
        // }
    }

    public async update(query: CollectionQuery, update: CollectionUpdate<Document>) {
        return (await this.datastore.updateAsync(query, update, {multi: true})).numAffected
    }

    public async updateOne(query: CollectionQuery, update: CollectionUpdate<Document>, {returnDocument = false, assertUpdated = true}: {returnDocument?: boolean, assertUpdated?: boolean} = {}) {
        const upd = await this.datastore.updateAsync(query, update, {multi: false, returnUpdatedDocs: returnDocument})

        if (assertUpdated && upd.numAffected !== 1) {
            throw new Error('No updated document')
        }

        if (!returnDocument) {
            return upd.numAffected === 1
        }

        return upd.affectedDocuments?[0]
    }

    public async remove(query: CollectionQuery) {
        return await this.datastore.removeAsync(query, {multi: true})
    }

    public async removeOne(query: CollectionQuery, {assertRemoved}: {assertRemoved?: boolean} = {}) {
        const numAffected = await this.datastore.removeAsync(query, {multi: false})

        if (assertRemoved && numAffected !== 1) {
            throw new Error('No removed document')
        }

        return numAffected === 1
    }


    public async find(query: CollectionQuery, sort?: CollectionSort, limit?: number, skip?: number) {
        return await this.datastore.findAsync(query).sort(sort).limit(limit || Infinity).skip(skip || 0).execAsync() as Document[]
    }

    public async findOne(query: CollectionQuery, sort?: CollectionSort, {assertFound}: {assertFound?: boolean} = {}) {
        const founds = await this.find(query, sort, 1)

        if (assertFound && founds.length === 0) {
            throw new Error('No found document')
        }

        return founds[0]
    }
}
