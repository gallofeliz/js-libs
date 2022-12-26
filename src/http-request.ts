import { Duration, durationToSeconds, AbortError } from './utils'
import { Logger } from './logger'
import got, { CancelableRequest, Response, Method, Options } from 'got'
import jsonata from 'jsonata'
import querystring from 'querystring'
import validate, { Schema } from './validate'

/** @type integer */
type integer = number

export interface HttpRequestConfig {
   logger: Logger
   abortSignal?: AbortSignal
   url: string
   method?: Method
   responseType?: 'text' | 'json' | 'auto'
   responseTransformation?: string
   timeout?: Duration
   retries?: integer
   headers?: Record<any, string>
   params?: Record<string, string | string[]> | [string, string][]
   bodyData?: NodeJS.ReadableStream | any
   bodyType?: 'raw' | 'json' | 'form'
   auth?: {
      username: string
      password: string
   },
   resultSchema?: Schema
}

export default async function httpRequest<Result extends any>({abortSignal, logger, ...request}: HttpRequestConfig): Promise<Result> {
    if (abortSignal?.aborted) {
      throw new AbortError
    }

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

    const gotOpts: Options = {
        method: request.method as Method || 'GET',
        url: url,
        timeout: { request: request.timeout ? durationToSeconds(request.timeout) * 1000 : undefined},
        retry: { limit: request.retries || 0},
        headers: request.headers,
        username: request.auth?.username,
        password: request.auth?.password,
        hooks: {
            beforeRequest: [options  => { logger.info('Calling http request ' + options.url)}],
            afterResponse: [response => { logger.info('Http Request returned code ' + response.statusCode) ; return response }],
            beforeError: [error => { logger.info('Http Request returned error ' + error.message) ; return error }]
        }
    }

    if (request.bodyData) {
        switch (request.bodyType) {
            case 'json':
                gotOpts.json = request.bodyData
                break
            case 'form':
                gotOpts.form = request.bodyData
                break
            default:
                gotOpts.body = request.bodyData
        }
    }

    const gotRequest = got(gotOpts) as CancelableRequest<Response<string>>

    const onSignalAbort = () => gotRequest.cancel()
    abortSignal?.addEventListener('abort', onSignalAbort)

    try {
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
      if ((e as any).code === 'ERR_CANCELED') {
        throw new AbortError
      }
      throw e
    } finally {
        abortSignal?.removeEventListener('abort', onSignalAbort)
    }
}
