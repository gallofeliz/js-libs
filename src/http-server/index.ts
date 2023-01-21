import { Logger } from '../logger'
import express, { Router, Response } from 'express'
import { OutgoingHttpHeaders, Server, IncomingHttpHeaders } from 'http'
import basicAuth from 'express-basic-auth'
import {
    json as jsonParser,
    text as textParser,
    urlencoded as urlencodedParser,
    raw as rawParser
} from 'body-parser'
import { basename } from 'path'
import { Socket } from 'net'
import HtpasswdValidator from 'htpasswd-verify'
import { once } from 'events'
import morgan from 'morgan'
import validate, { Schema, SchemaObject } from '../validate'
import { extendErrors } from 'ajv/dist/compile/errors'
import { flatten, intersection } from 'lodash'
import { v4 as uuid } from 'uuid'
import stream from 'stream'

interface User {
    username: string
    password: string
    roles: string[]
}

export interface HttpServerHandlerParameters<UrlParams extends any, Query extends any, InputBody extends any, OutputBody extends any> {
    rawReq: express.Request
    urlParams: UrlParams
    query: Query
    body: Body
    abortSignal: AbortSignal
    headers: IncomingHttpHeaders
    uuid: string
    logger: Logger
    rawRes: express.Response
    response(error: Error, status?: number): HttpServerErrorResponse
    response(body: stream.Writable, contentType: string, status?: number): HttpServerResponse<OutputBody>
    response(body?: OutputBody, status?: number): HttpServerResponse<OutputBody>
}

export interface HttpServerResponse<OutputBody extends any> {
    status: number
    headers: OutgoingHttpHeaders
    body: OutputBody
}

function isHttpServerResponse(dontKnow: any): dontKnow is HttpServerResponse<any> {
    return dontKnow
        && typeof dontKnow === 'object'
        && dontKnow.status && dontKnow.headers && dontKnow.body
}

export interface HttpServerErrorResponse extends Error, HttpServerResponse<any> {}

// export type HttpServerHandler = <UrlParams extends any, Query extends any, InputBody extends any, OutputBody extends any>
//     (params: HttpServerHandlerParameters<UrlParams, Query, InputBody, OutputBody>) => Promise<HttpServerResponse<OutputBody> | OutputBody>

export type HttpServerHandler = (params: HttpServerHandlerParameters<any, any, any, any>) => Promise<HttpServerResponse<any> | any>

export interface HttpServerConfig {
    port: number
    host?: string
    auth?: {
        users: User[]
        extendedRoles?: Record<string, string[]>
    }
    webUi?: {
        filesPath: string
        auth?: {
            required?: boolean
            roles?: string[]
        }
    }
    api?: {
        prefix?: string
        routes: Array<{
            method?: string
            path: string
            handler: HttpServerHandler
            inputBodySchema?: Schema
            inputQuerySchema?: SchemaObject
            inputParamsSchema?: SchemaObject
            auth?: {
                required?: boolean
                roles?: string[]
            }
        }>
    }
    logger: Logger
}

class Auth {
    protected users: User[]
    protected extendedRoles: Record<string, string[]>
    protected htpasswordValidator: HtpasswdValidator

    constructor(users: User[], extendedRoles: Record<string, string[]>) {
        this.users = users
        this.extendedRoles = extendedRoles
        this.htpasswordValidator = new HtpasswdValidator(
            this.users.reduce((dict, user) => ({...dict, [user.username]: user.password}), {})
        )
    }

    public validate(user: string, pass: string, acceptedRoles: string[]): boolean {
        if (!this.userAuth(user, pass)) {
            return false
        }

        if (!this.rolesCheck(this.users.find(u => u.username === user)!.roles, acceptedRoles)) {
            return false
        }

        return true
    }

    public userAuth(user: string, pass: string): boolean {
        return this.htpasswordValidator.verify(user, pass)
    }

    public rolesCheck(rolesA: string[], rolesB: string[]): boolean {
        return intersection(this.extendRoles(rolesA), this.extendRoles(rolesB)).length > 0
    }

    protected extendRoles(roles: string[]): string[] {
        if (intersection(roles, Object.keys(this.extendedRoles)).length === 0) {
            return roles
        }
        return this.extendRoles(flatten(roles.map(role => this.extendedRoles[role] || role)))
    }
}

export default class HttpServer {
    protected logger: Logger
    protected app: express.Application
    protected server?: Server
    protected connections: Record<string, Socket> = {}
    protected config: HttpServerConfig
    protected auth?: Auth

    constructor(config: HttpServerConfig) {
        this.config = config
        this.logger = config.logger

        this.app = express()

        this.app.use(jsonParser({
            strict: false
        }))

        this.app.use(textParser())

        this.app.use(urlencodedParser({
            extended: true
        }))

        this.app.use(rawParser())

        this.app.use((req, res, next) => {
            (req as any).uuid = uuid()
            next()
        })

        morgan.token('uuid', function getId (req) {
          return (req as any).uuid
        })


        this.app.use(morgan(':uuid :method :url :status :res[content-length] - :response-time ms', {stream: {
            write: (message: string) => {
                const [uuid, ...logParts] = message.trim().split(' ')
                this.logger.info(logParts.join(' '), { serverRequestUuid: uuid })
            }
        }}))

        if (this.config.auth) {
            this.auth = new Auth(this.config.auth.users, this.config.auth.extendedRoles || {})
        }

        this.configureApi()

        if (this.config.webUi) {
            const needAuth = this.auth ? this.config.webUi.auth?.required !== false : false
            if (needAuth) {
                this.app.use('/', basicAuth({
                    authorizer: (inputUsername: string, inputPassword: string) => {
                        return this.auth!.validate(inputUsername, inputPassword, this.config.webUi!.auth!.roles || [])
                    },
                    challenge: true
                }))
            }
            this.app.use('/', express.static(this.config.webUi.filesPath))
        }

        this.app.use((err: Error, req: any, res: any, next: any) => {
            this.logger.notice('Http Server error', { e: err })
            res.status(500).send(err.toString());
        });

    }

    public getAuth() {
        return this.auth
    }

    public async start() {
        if (this.server) {
            return
        }
        this.server = this.app.listen(this.config.port, this.config.host || '0.0.0.0')

        this.server.on('connection', (conn) => {
            const key = conn.remoteAddress + ':' + conn.remotePort;
            this.connections[key] = conn;
            conn.on('close', () => {
                delete this.connections[key];
            });
        });

        await once(this.server, 'listening')
    }

    public stop() {
        if (!this.server) {
            return
        }

        this.server.close()

        Object.keys(this.connections).forEach(key => this.connections[key].destroy())

        delete this.server
    }

    protected configureApi() {
        if (!this.config.api) {
            return
        }

        const apiRouter = express.Router()
        this.app.use('/' + (this.config.api.prefix ? this.config.api.prefix.replace(/^\//, '') : ''), apiRouter)

        this.config.api.routes.forEach(route => {
            const needAuth = this.auth ? route.auth?.required !== false : false
            const method = route.method?.toLowerCase() || 'get'

            if (needAuth) {
                apiRouter[method as 'all'](route.path, basicAuth({
                    authorizer: (inputUsername: string, inputPassword: string) => {
                        return this.auth!.validate(inputUsername, inputPassword, route.auth?.roles || [])
                    },
                    challenge: true
                }))
            }

            apiRouter[method as 'all'](route.path, async (req, res, next) => {
                const uuid = (req as any).uuid
                const logger = this.logger.child({ serverRequestUuid: uuid })

                const reqAbortController = new AbortController

                req.once('close', () => {
                    reqAbortController.abort()
                })

                const createErrorResponse = (error: Error, status?: number): HttpServerErrorResponse => {
                    const errorResponse = error as HttpServerErrorResponse
                    errorResponse.status = status || 500
                    errorResponse.headers = {}
                    errorResponse.body = error.message

                    return errorResponse
                }

                const createSuccessResponse = (body?: any, status?: number, headers: OutgoingHttpHeaders = {}): HttpServerResponse<any> => {
                    return {
                        status: status || (body === undefined ? 204 : 200),
                        headers,
                        body
                    }
                }

                const createResponse = (...args: any[]) => {
                    if (args[0] instanceof Error) {
                        return createErrorResponse(args[0], args[1])
                    }

                    if (args[0] instanceof stream.Writable) {
                        return createSuccessResponse(args[0], args[2], {'Content-Type': args[2]})
                    }

                    return createSuccessResponse(args[0], args[1])
                }

                let httpServerHandlerParameters: HttpServerHandlerParameters<any, any, any, any>

                try {
                    httpServerHandlerParameters = {
                        rawReq: req,
                        rawRes: res,
                        logger,
                        urlParams: route.inputParamsSchema
                            ? validate(req.params, {
                                schema: route.inputParamsSchema,
                                contextErrorMsg: 'params'
                            })
                            : req.params,
                        query: route.inputQuerySchema
                            ? validate(req.query, {
                                schema: route.inputQuerySchema,
                                contextErrorMsg: 'query'
                            })
                            : req.query,
                        body: route.inputBodySchema
                            ? validate(req.body, {
                                schema: route.inputBodySchema,
                                contextErrorMsg: 'body'
                            })
                            : req.body,
                        abortSignal: reqAbortController.signal,
                        headers: req.headers,
                        uuid,
                        response: createResponse as HttpServerHandlerParameters<any, any, any, any>['response']
                    }

                } catch (e) {
                    res.status(400).send((e as Error).message)
                    return
                }

                let response

                try {
                    response = await route.handler(httpServerHandlerParameters)
                } catch (e) {
                    if (isHttpServerResponse(e)) {
                        response = e
                    } else {
                        next(e)
                        return
                    }
                }

                if (res.finished) {
                    // Do nothing
                    return
                }

                if (response instanceof stream.Writable) {
                    // Do nothing
                    return
                }

                if (!isHttpServerResponse(response)) {
                    response = createSuccessResponse(response)
                }

                res.status(response.status)
                for (const headerName in response.headers) {
                    res.setHeader(headerName, response.headers[headerName] as string)
                }
                if (response.body !== undefined) {
                    res.json(response.body)
                }
                res.end()
            })
        })
    }
}
