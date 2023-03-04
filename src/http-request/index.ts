import { UniversalLogger } from '@gallofeliz/logger'
import got, { CancelableRequest, Response, Method, Options } from 'got'
import jsonata from 'jsonata'
import querystring from 'querystring'
import { validate, SchemaObject } from '@gallofeliz/validate'
import { v4 as uuid } from 'uuid'
import { pipeline } from 'stream/promises'

export interface HttpRequestConfig {
   logger: UniversalLogger
   abortSignal?: AbortSignal
   url: string
   method?: Method
   responseStream?: NodeJS.WritableStream
   responseType?: 'text' | 'json' | 'auto'
   responseTransformation?: string
   timeout?: number
   retries?: number
   headers?: Record<string, string | string[]>
   params?: Record<string, string | string[]> | [string, string][]
   bodyData?: NodeJS.ReadableStream | any
   bodyType?: 'text' | 'json' | 'form' | string
   auth?: {
      username: string
      password: string
   },
   resultSchema?: SchemaObject
}

export class AbortError extends Error {
    name = 'AbortError'
    code = 'ABORT_ERR'
    constructor(message: string = 'This operation was aborted') {
        super(message)
    }
}

export async function httpRequest<Result extends any>({abortSignal, logger, ...request}: HttpRequestConfig): Promise<Result> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason
    }

    if (request.responseStream && request.responseType) {
        throw new Error('Unable to stream and responseType')
    }

    logger = logger.child({ httpRequestUid: uuid() })
    let url = request.url

    if (request.params) {
        const urlObject = new URL(url)
        const params = {
            ...querystring.parse(urlObject.searchParams.toString()),
            ...Array.isArray(request.params) ? querystring.parse((new URLSearchParams(request.params)).toString()) : request.params
        }

        urlObject.search = '?' + querystring.stringify(params)
        url = urlObject.toString()
    }

    const gotOpts: Partial<Options> = {
        method: request.method as Method || 'GET',
        url: url,
        timeout: { request: request.timeout },
        retry: { limit: request.retries || 0},
        headers: request.headers || {},
        ...(request.auth ? {
            username: request.auth.username,
            password: request.auth.password,
        } : {}),
        hooks: {
            init: [],
            beforeRedirect: [],
            beforeRetry: [],
            beforeRequest: [options  => { logger.info('Calling http request ' + options.url)}],
            afterResponse: [response => { logger.info('Http Request returned code ' + response.statusCode) ; return response }],
            beforeError: [error => { logger.info('Http Request returned error ' + error.message) ; return error }]
        }
    }

    if (request.bodyData) {
        switch (request.bodyType) {
            case 'text':
                gotOpts.body = request.bodyData
                gotOpts.headers = {...(gotOpts.headers || {}), 'Content-Type': 'text/plain'}
                break
            case 'json':
                gotOpts.json = request.bodyData
                break
            case 'form':
                gotOpts.form = request.bodyData
                break
            default:
                gotOpts.body = request.bodyData
                if (request.bodyType) {
                    gotOpts.headers = {...(gotOpts.headers || {}), 'Content-Type': request.bodyType}
                }
        }
    }

    if (request.responseStream) {
        gotOpts.isStream = true
    }

    const gotRequest = got(gotOpts) as CancelableRequest<Response<string>>

    const onSignalAbort = () => {
        if (request.responseStream) {
            (gotRequest as any).destroy()
        } else {
            gotRequest.cancel()
        }
    }
    abortSignal?.addEventListener('abort', onSignalAbort)

    try {
        if (request.responseStream) {
            await pipeline(gotRequest as any, request.responseStream)
            return undefined as Result
        }

        const response = await gotRequest

        if (!request.responseType) {
            return undefined as Result
        }

        const isJson = request.responseType === 'auto'
            ? (response.headers['content-type'] || '').includes('json')
            : request.responseType === 'json'

        const output = (isJson ? await gotRequest.json() : await gotRequest.text())
        const result = (request.responseTransformation
            ? await jsonata(request.responseTransformation).evaluate(output)
            : output
        )

        return request.resultSchema
            ? validate<Result>(result, {schema: request.resultSchema})
            : result as Result

    } catch (e) {
        if (abortSignal?.aborted) {
            throw abortSignal.reason
        }
      throw e
    } finally {
        abortSignal?.removeEventListener('abort', onSignalAbort)
    }
}
