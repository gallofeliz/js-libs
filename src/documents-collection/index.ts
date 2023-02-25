import Datastore from '@seald-io/nedb'
import {Aggregator} from 'mingo'
import { useOperators, OperatorType } from "mingo/core"
import * as pip from "mingo/operators/pipeline"
import * as acc from "mingo/operators/accumulator"
import * as exp from "mingo/operators/expression"

// @ts-ignore
useOperators(OperatorType.PIPELINE, pip)
// @ts-ignore
useOperators(OperatorType.ACCUMULATOR, acc)
// @ts-ignore
useOperators(OperatorType.EXPRESSION, exp)

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

export interface DocumentCollectionFindCursor<Document extends GenericDocument> extends AsyncIterable<Document> {
    toArray: () => Promise<Document[] | Partial<Document>[]>
    forEach: (fn: (document: Document) => void) => void
    map: <T>(fn: (document: Document) => T) => Promise<T[]>
    // count
    // etc
}

export interface DocumentCollectionAggregateCursor<Document extends GenericDocument> extends AsyncIterable<Document> {
    toArray: () => Promise<Document[] | Partial<Document>[]>
    forEach: (fn: (document: Document) => void) => void
    map: <T>(fn: (document: Document) => T) => Promise<T[]>
    // count
    // etc
}


export interface DocumentCollection<Document extends GenericDocument> {
    insert(document: Omit<Document, '_id'>, {returnDocument}: {returnDocument: true}): Promise<Document>
    insert(document: Omit<Document, '_id'>, {returnDocument}?: {returnDocument?: false}): Promise<string>
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
    updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument}: {returnDocument: true}): Promise<Document | undefined>
    updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument}?: {returnDocument?: false}): Promise<boolean>

    removeOne(query: DocumentCollectionQuery): Promise<boolean>
    remove(query: DocumentCollectionQuery): Promise<number>

    aggregate(pipeline: AggregationPipeline): DocumentCollectionAggregateCursor<Document>
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

export class MingoAggregateCursor<Document extends GenericDocument> implements DocumentCollectionAggregateCursor<Document> {
    protected mingoAgg: any
    protected cursor: any

    constructor(mingoAgg: any, cursor: any) {
        this.mingoAgg = mingoAgg
        this.cursor = cursor
    }

    public async toArray() {
        return this.mingoAgg.run(await this.cursor.toArray())
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

    public constructor({filePath, indexes}: {filePath: string | null, indexes?: Datastore.EnsureIndexOptions[]}) {
        this.datastore = new Datastore(filePath ? {filename: filePath} : {inMemoryOnly: true})
        this.load(indexes || [])
    }

    public aggregate(pipeline: AggregationPipeline) {
        let agg = new Aggregator(pipeline);
        const cursor = this.find({}) as any

        return new MingoAggregateCursor(agg, cursor) as any
    }

    public async insert(documentDocuments: Omit<Document, '_id'> | Omit<Document, '_id'>[], {returnDocument}: {returnDocument?: boolean} = {}) {
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
    public async updateOne(query: DocumentCollectionQuery, update: DocumentCollectionUpdate<Document>, {returnDocument}: {returnDocument?: boolean} = {}): any {
        const upd = await this.datastore.updateAsync(query, update, {multi: false, returnUpdatedDocs: returnDocument})

        if (returnDocument) {
            return upd.affectedDocuments ? upd.affectedDocuments : undefined
        }

        return upd.numAffected === 1
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
