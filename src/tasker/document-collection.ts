import Datastore from '@seald-io/nedb'
import traverse from 'traverse'
import { mapKeys } from 'lodash'
import {Aggregator} from 'mingo'

export interface DocumentCollectionQuery {
    [filter: string]: any
}

export type DocumentCollectionSort<Document extends GenericDocument> = Partial<Record<keyof Document, 1 | -1>>

export type DocumentCollectionProjection<Document extends GenericDocument> = Partial<Record<keyof Document, 0 | 1>>


export type DocumentCollectionUpdate<Document extends GenericDocument> = Document | {
    [filter: string]: any
}

export interface GenericDocument {
    _id: string
    [key: string]: any
}

export type AggregationPipeline = Array<{[k: string]: any}>

export interface DocumentCollectionFindCursor<Document> extends AsyncIterable<Document> {
    toArray: () => Promise<Document[] | Partial<Document>[]>
    forEach: (fn: (document: Document) => void) => void
    map: <T>(fn: (document: Document) => T) => Promise<T[]>
    // count
    // etc
}

export interface DocumentCollection<Document extends GenericDocument> {
    insert(document: Omit<Document, '_id'>, {returnDocument}?: {returnDocument?: boolean}): Promise<string | Document>
    insert(documents: Omit<Document, '_id'>[]): Promise<string[]>

    has(query: DocumentCollectionQuery): Promise<boolean>
    findOne(
        query: DocumentCollectionQuery,
        {sort, projection}?: { sort?: DocumentCollectionSort<Document>, projection?: DocumentCollectionProjection<Document>}
    ): Promise<Document | undefined | Partial<Document>>
    count(query: DocumentCollectionQuery): Promise<number>
    find(
        query: DocumentCollectionQuery,
        {sort, limit, skip, projection}?: {sort?: DocumentCollectionSort<Document>, limit?: number, skip?: number, projection?: DocumentCollectionProjection<Document>}
    ): DocumentCollectionFindCursor<Document>

    update(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>): Promise<number>
    updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument}?: {returnDocument?: boolean}): Promise<boolean | Document | undefined>

    removeOne(query: DocumentCollectionQuery): Promise<boolean>
    remove(query: DocumentCollectionQuery): Promise<number>

    aggregate(pipeline: AggregationPipeline): Promise<any>
}

export class DocumentAssertionError extends Error {
    name = 'DocumentAssertionError'
}

export class NeDbDocumentCollectionCursor<Document extends GenericDocument> implements DocumentCollectionFindCursor<Document> {
    protected nedbCursor: Datastore.Cursor<Document[]>

    constructor(nedbCursor: Datastore.Cursor<Document[]>) {
        this.nedbCursor = nedbCursor
    }

    public async toArray() {
        return this.nedbCursor.execAsync()
    }

    public map(fn: (document: Document) => any): Promise<any[]> {
        return this.toArray().then(docs => docs.map(fn))
    }

    public forEach(fn: (document: Document) => void) {
        this.toArray().then(docs => docs.forEach(fn))
    }

    public async *[Symbol.asyncIterator]() {
        for (const doc of await this.toArray()) {
            yield doc as any
        }
    }
}

export class NeDbDocumentCollection<Document extends GenericDocument> implements DocumentCollection<Document> {
    protected datastore: Datastore

    public constructor({filePath, indexes}: {filePath: string, indexes?: Datastore.EnsureIndexOptions[]}) {
        this.datastore = new Datastore({filename: filePath})
        this.load(indexes || [])
    }

    public async aggregate(pipeline: AggregationPipeline) {
        let agg = new Aggregator(pipeline);

        return agg.run(await this.find({}).toArray())
    }

    // @ts-ignore
    public async insert(documentDocuments: Omit<Document, '_id'> | Omit<Document, '_id'>[], {returnDocument}: {returnDocument?: boolean} = {}): Promise<string | string[] | Document>  {
        if (Array.isArray(documentDocuments)) {
            return (await this.datastore.insertAsync(documentDocuments)).map(d => d._id)
        }
        const doc = await this.datastore.insertAsync(documentDocuments)

        return returnDocument ? doc : doc._id as any
    }

    public async update(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>) {
        return (await this.datastore.updateAsync(query, update, {multi: true})).numAffected
    }

    // @ts-ignore
    public async updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument}: {returnDocument?: boolean} = {}) {
        const upd = await this.datastore.updateAsync(query, update, {multi: false, returnUpdatedDocs: returnDocument})

        if (upd.numAffected === 0) {
            return returnDocument ? undefined : false
        }

        return returnDocument ? upd.affectedDocuments : true
    }

    public async remove(query: DocumentCollectionQuery) {
        return await this.datastore.removeAsync(query, {multi: true})
    }

    public async removeOne(query: DocumentCollectionQuery) {
        return (await this.datastore.removeAsync(query, {multi: false})) === 1
    }

    public find(
        query: DocumentCollectionQuery,
        {sort, limit, skip, projection}: {sort?: DocumentCollectionSort<Document>, limit?: number, skip?: number, projection?: DocumentCollectionProjection<Document>} = {}
    ): DocumentCollectionFindCursor<Document> {
        return new NeDbDocumentCollectionCursor(this.datastore.findAsync(query, projection).sort(sort).limit(limit || Infinity).skip(skip || 0) as any) as any
    }

    public async findOne(query: DocumentCollectionQuery, {sort, projection}: { sort?: DocumentCollectionSort<Document>, projection?: DocumentCollectionProjection<Document>} = {}) {
        const cursor = this.find(query, {sort, limit: 1, projection})
        return (await cursor.toArray())[0] // .next() does not exist
    }

    public async count(query: DocumentCollectionQuery) {
        return await this.datastore.countAsync(query).execAsync()
    }

    public async has(query: DocumentCollectionQuery) {
        const has = (await this.datastore.countAsync(query).limit(1).execAsync()) === 1

        return has
    }

    protected async load(indexes: Datastore.EnsureIndexOptions[]) {
         await this.datastore.loadDatabaseAsync()
         await Promise.all(indexes.map(index => this.datastore.ensureIndexAsync(index)))
    }
}

export {NeDbDocumentCollection as DefaultDocumentCollection}