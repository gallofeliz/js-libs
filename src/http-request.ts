import { Duration, durationToSeconds, AbortError } from './utils'
import { Logger } from './logger'
import got, { Method } from 'got'
import jsonata from 'jsonata'
import querystring from 'querystring'

/** @type integer */
type integer = number

export interface HttpRequestConfig {
   logger: Logger
   abortSignal?: AbortSignal
   url: string
   method?: Method
   outputType?: 'text' | 'json' | 'auto' // responseType
   outputTransformation?: string  // responseTransformation
   timeout?: Duration
   retries?: integer
   headers?: Record<any, string>
   params?: Record<string, string | string[]> | [string, string][]
   bodyData?: NodeJS.ReadableStream | any
   bodyType?: 'raw' | 'json' | 'form'
   auth?: {
      username: string
      password: string
   }
   // validation?: any
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
            ...Array.isArray(request.params) ? querystring.parse((new URLSearchParams(request.params)).searchParams.toString()) : request.params
        }

        urlObject.searchParams = new URLSearchParams(querystring.stringify(params))
        url = urlObject.toString()
    }

    const gotOpts = {
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

    const gotRequest = got(gotOpts)

    const onSignalAbort = () => gotRequest.cancel()
    abortSignal?.addEventListener('abort', onSignalAbort)

    try {
        const response = await gotRequest

        if (!request.outputType) {
            return undefined as Result
        }

        const isJson = request.outputType === 'auto'
            ? (response.headers['content-type'] || '').includes('json')
            : request.outputType === 'json'

        const output = (isJson ? await gotRequest.json() : await gotRequest.text())

        return (request.outputTransformation
            ? jsonata(request.outputTransformation).evaluate(output)
            : output
        ) as Result
    } catch (e) {
      if ((e as any).code === 'ERR_CANCELED') {
        throw new AbortError
      }
      throw e
    } finally {
        abortSignal?.removeEventListener('abort', onSignalAbort)
    }
}
