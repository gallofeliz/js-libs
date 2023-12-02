import got, { CancelableRequest, Response, Method, Options } from 'got'
import jsonata from 'jsonata'
import querystring from 'querystring'
import { validate, SchemaObject } from '@gallofeliz/validate'
import { pipeline } from 'stream/promises'
import EventEmitter from 'events'

export interface HttpRequestConfig {
   abortSignal?: AbortSignal
   url: string
   timeout: number | Options['timeout'] | null
   method?: Method
   responseStream?: NodeJS.WritableStream
   responseType?: 'text' | 'json' | 'auto' // | 'buffer'
   responseTransformation?: string
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
   eventEmitter?: EventEmitter
}

export async function httpRequest<Result extends any>({abortSignal, eventEmitter, ...request}: HttpRequestConfig): Promise<Result> {
    if (abortSignal?.aborted) {
      throw abortSignal.reason
    }

    if (request.responseStream && request.responseType) {
        throw new Error('Unable to stream and responseType')
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

    const gotOpts: Partial<Options> = {
        method: request.method as Method || 'GET',
        url: url,
        ...request.timeout && { timeout: request.timeout instanceof Object ? request.timeout : { request: request.timeout } },
        retry: { limit: request.retries || 0},
        headers: {
            'user-agent':  '@gallofeliz/http-request',
            ...request.headers || {}
        },
        ...(request.auth ? {
            username: request.auth.username,
            password: request.auth.password,
        } : {}),
        hooks: {
            init: [],
            beforeRedirect: [],
            beforeRetry: [],
            beforeRequest: [options  => {
                eventEmitter?.emit('http.request', {
                    url: options.url,
                    method: options.method,
                    headers: options.headers,
                    body: options.body
                })
            }],
            afterResponse: [response => {
                eventEmitter?.emit('http.response', {
                    durations: response.timings.phases,
                    statusCode: response.statusCode,
                    headers: response.headers,
                    body: request.responseStream ? undefined : response.body
                })

                return response
            }],
            beforeError: [error => {
                eventEmitter?.emit('http.error', {
                    error
                })
                return error
            }]
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
