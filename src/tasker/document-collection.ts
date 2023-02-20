import Datastore from '@seald-io/nedb'

export interface DocumentCollectionQuery {
    [filter: string]: any
}

export interface DocumentCollectionSort {
    [filter: string]: 1 | -1
}

export type DocumentCollectionUpdate<T> = T | {
    [filter: string]: any
}

export interface GenericDocument {
    _id: string
    [key: string]: any
}

export interface DocumentCollection<Document extends GenericDocument> {
    insert(t: Omit<Document, '_id'>): Promise<Document>
    update(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>): Promise<number>
    updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument, assertUpdated}?: {returnDocument?: boolean, assertUpdated?: boolean}): typeof returnDocument extends true ? Promise<Document | undefined> : Promise<boolean>
    remove(query: DocumentCollectionQuery): Promise<number>
    removeOne(query: DocumentCollectionQuery, {assertRemoved}?: {assertRemoved?: boolean}): Promise<boolean>
    find(query: DocumentCollectionQuery, sort?: DocumentCollectionSort, limit?: number, skip?: number): Promise<Document[]>
    findOne(query: DocumentCollectionQuery, sort?: DocumentCollectionSort, {assertFound}?: {assertFound?: boolean}): Promise<Document | undefined>
    count(query: DocumentCollectionQuery): Promise<number>
    has(query: DocumentCollectionQuery): Promise<boolean>
}

export class NeDbDocumentCollection<Document extends GenericDocument> implements DocumentCollection<Document> {
    protected datastore: Datastore

    public constructor({filePath, indexes}: {filePath: string, indexes?: Datastore.EnsureIndexOptions[]}) {
        this.datastore = new Datastore({filename: filePath})
        this.load(indexes || [])
    }

    public async insert(document: Omit<Document, '_id'>) {
        return await this.datastore.insertAsync(document) as Document
        // if (await this.findOne({uuid: job.getUuid()})) {
        //     return
        // }
    }

    public async update(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>) {
        return (await this.datastore.updateAsync(query, update, {multi: true})).numAffected
    }

    public async updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument = false, assertUpdated = true}: {returnDocument?: boolean, assertUpdated?: boolean} = {}) {
        const upd = await this.datastore.updateAsync(query, update, {multi: false, returnUpdatedDocs: returnDocument})
        if (assertUpdated && upd.numAffected !== 1) {
            throw new Error('No updated document')
        }

        if (!returnDocument) {
            return upd.numAffected === 1
        }
        return upd.affectedDocuments as any
        //return await this.findOne({ _id: (upd.affectedDocuments as any)._id}, undefined, {assertFound: true}) as any
    }

    public async remove(query: DocumentCollectionQuery) {
        return await this.datastore.removeAsync(query, {multi: true})
    }

    public async removeOne(query: DocumentCollectionQuery, {assertRemoved}: {assertRemoved?: boolean} = {}) {
        const numAffected = await this.datastore.removeAsync(query, {multi: false})

        if (assertRemoved && numAffected !== 1) {
            throw new Error('No removed document')
        }

        return numAffected === 1
    }


    public async find(query: DocumentCollectionQuery, sort?: DocumentCollectionSort, limit?: number, skip?: number) {
        return await this.datastore.findAsync(query).sort(sort).limit(limit || Infinity).skip(skip || 0).execAsync() as Document[]
    }

    public async findOne(query: DocumentCollectionQuery, sort?: DocumentCollectionSort, {assertFound}: {assertFound?: boolean} = {}) {
        const founds = await this.find(query, sort, 1)

        if (assertFound && founds.length === 0) {
            throw new Error('No found document')
        }

        return founds[0]
    }

    public async count(query: DocumentCollectionQuery) {
        return await this.datastore.countAsync(query).execAsync()
    }

    public async has(query: DocumentCollectionQuery) {
        return (await this.count(query)) === 1
    }

    protected async load(indexes: Datastore.EnsureIndexOptions[]) {
         await this.datastore.loadDatabaseAsync()
         await Promise.all(indexes.map(index => this.datastore.ensureIndexAsync(index)))
    }
}

export {NeDbDocumentCollection as DefaultDocumentCollection}