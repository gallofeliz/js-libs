import { Duration, durationToSeconds, AbortError } from './utils'
import { Logger } from './logger'
import got, { Method } from 'got'

/** @type integer */
type integer = number

export interface HttpRequestConfig {
   logger: Logger
   abortSignal?: AbortSignal
   outputType?: 'text' | 'json' | 'auto'
   url: string
   method?: Method
   timeout?: Duration
   retries?: integer
   headers?: Record<any, string>

   // searchParams?: Record<string, string>
   // body?: any
   // bodyType?: 'text' | 'json' | 'form'
   // auth?: any
}

export default async function httpRequest<Result extends any>({abortSignal, logger, ...request}: HttpRequestConfig): Promise<Result> {
    if (abortSignal?.aborted) {
      throw new AbortError
    }

    const gotRequest = got({
        method: request.method as Method || 'GET',
        url: request.url,
        timeout: { request: request.timeout ? durationToSeconds(request.timeout) * 1000 : undefined},
        retry: { limit: request.retries || 0},
        headers: request.headers,
        hooks: {
            beforeRequest: [options  => { logger.info('Calling http request ' + options.url)}],
            afterResponse: [response => { logger.info('Http Request returned code ' + response.statusCode) ; return response }],
            beforeError: [error => { logger.info('Http Request returned error ' + error.message) ; return error }]
        }
    })

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

        return (isJson ? await gotRequest.json() : await gotRequest.text()) as Result
    } catch (e) {
      if ((e as any).code === 'ERR_CANCELED') {
        throw new AbortError
      }
      throw e
    } finally {
        abortSignal?.removeEventListener('abort', onSignalAbort)
    }
}
