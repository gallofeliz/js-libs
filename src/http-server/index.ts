import { Logger } from '../logger'
import express, { Router } from 'express'
import { OutgoingHttpHeaders, Server, IncomingHttpHeaders } from 'http'
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
import { HttpRequestConfig } from '../http-request'
import * as expressCore from 'express-serve-static-core'
import auth from 'basic-auth'

export type HttpServerRequest<
    Params = expressCore.ParamsDictionary,
    Query = expressCore.Query,
    Body = any
> = express.Request & {
    uuid: string
    abortSignal: AbortSignal
    logger: Logger
    params: Params
    query: Query
    body: Body
    user: User | null
}

export interface HttpServerResponse<Body = any> extends express.Response {
    /**
     * Send content
     */
    send(content: Body): this
}

export interface HttpServerConfig {
    port: number
    host?: string
    auth?: {
        users: User[]
        extendedRoles?: Record<string, string[]>
        anonymRoles?: string | string[]
        realm?: string
        defaultRoutesRoles?: string | string[]
    }
    webUi?: {
        filesPath: string
        auth?: {
            roles?: string | string[]
        }
    }
    api?: {
        prefix?: string
        routes: Array<{
            method?: string
            path: string
            handler(request: HttpServerRequest<any>, response: HttpServerResponse): Promise<void>
            inputBodySchema?: Schema
            inputQuerySchema?: SchemaObject
            inputParamsSchema?: SchemaObject
            auth?: {
                roles?: string | string[] | ((request: HttpServerRequest<any>) => string | string[])
            }
        }>
    }
    logger: Logger
}

interface User {
    username: string
    password: string
    roles: string | string[]
}

class Authenticator {
    protected users: User[]
    protected htpasswordValidator: HtpasswdValidator

    constructor(users: User[]) {
        this.users = users
        this.htpasswordValidator = new HtpasswdValidator(
            this.users.reduce((dict, user) => ({...dict, [user.username]: user.password}), {})
        )
    }

    public authenticate(username: string, password: string): User | null {
        if (this.htpasswordValidator.verify(username, password)) {
            return this.users.find(u => u.username === username)!
        }

        return null
    }
}

class Authorizator {
    protected extendedRoles: Record<string, string[]>

    constructor(extendedRoles: Record<string, string[]>) {
        this.extendedRoles = extendedRoles
    }

    public isAutorised(userRoles: string | string[], roles: string | string[]): boolean {
       const userExtendedRoles = this.extendRoles(userRoles)
       const testedExtendedRoles = this.extendRoles(roles)

       if (userExtendedRoles.includes('*') || testedExtendedRoles.includes('*')) {
          return true
       }

       if (intersection(userExtendedRoles, testedExtendedRoles).length > 0) {
          return true
       }

       // const userWillcardExtendeRoles = userExtendedRoles.filter(r => r.includes('*'))
       // const testedWillcardExtendeRoles = testedExtendedRoles.filter(r => r.includes('*'))

       return false
    }

    protected extendRoles(roles: string | string[]): string[] {
        roles = Array.isArray(roles) ? roles : [roles]
        if (intersection(roles, Object.keys(this.extendedRoles)).length === 0) {
            return roles
        }
        return this.extendRoles(flatten(roles.map(role => this.extendedRoles[role] || role)))
    }
}

function nothingMiddleware() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => next()
}

function authMiddleware(
    {realm, anonymRoles, routeRoles, authenticator, authorizator}:
    {realm: string, anonymRoles: string | string[], routeRoles: string | string[], authenticator: Authenticator, authorizator: Authorizator}
) {
    function demandAuth(res: express.Response) {
        res.set('WWW-Authenticate', 'Basic realm="'+realm+'"').status(401).end()
    }

    return function (req: express.Request, res: express.Response, next: express.NextFunction) {
        const userPassFromHeaders = auth(req)

        if (!userPassFromHeaders) {
            // Anonym
            if (!authorizator.isAutorised(anonymRoles, routeRoles)) {
                return demandAuth(res)
            }

            (req as HttpServerRequest).user = null
        } else {
            // Not anonym
            const user = authenticator.authenticate(userPassFromHeaders.name, userPassFromHeaders.pass)

            if (!user) {
                return demandAuth(res)
            }

            if (!authorizator.isAutorised(user.roles, routeRoles)) {
                res.status(403).end()
                return
            }

            (req as HttpServerRequest).user = user
        }

        next()
    }
}

export default class HttpServer {
    protected logger: Logger
    protected app: express.Application
    protected server?: Server
    protected connections: Record<string, Socket> = {}
    protected config: HttpServerConfig
    protected authenticator: Authenticator
    protected authorizator: Authorizator

    constructor(config: HttpServerConfig) {
        this.config = config
        this.logger = config.logger

        morgan.token('uuid', (req: HttpServerRequest) => req.uuid)

        this.authenticator = new Authenticator(this.config.auth?.users || [])
        this.authorizator = new Authorizator(this.config.auth?.extendedRoles || {})

        this.app = express()
            .disable('x-powered-by')
            .use(jsonParser({
                strict: false
            }))
            .use(textParser())
            .use(urlencodedParser({ extended: true }))
            .use(rawParser())
            .use((req, res, next) => {
                (req as HttpServerRequest).uuid = uuid()
                next()
            })
            .use(morgan(':uuid :method :url :status :res[content-length] - :response-time ms', {stream: {
                write: (message: string) => {
                    const [uuid, ...logParts] = message.trim().split(' ')
                    this.logger.info(logParts.join(' '), { serverRequestUuid: uuid })
                }
            }}))

        this.configureApi()

        if (this.config.webUi) {
            this.app.use('/',
                this.config.auth
                    ? authMiddleware({
                        realm: this.config.auth.realm || 'app',
                        routeRoles: this.config.webUi.auth?.roles || this.config.auth.defaultRoutesRoles || [],
                        anonymRoles: this.config.auth.anonymRoles || [],
                        authenticator: this.authenticator,
                        authorizator: this.authorizator
                    })
                    : nothingMiddleware(),
                express.static(this.config.webUi.filesPath)
            )
        }

        this.app.use((err: Error, req: any, res: any, next: any) => {
            this.logger.notice('Http Server error', { e: err })
            res.status(500).send(err.toString());
        });
    }

    public getAuthorizator() {
        return this.authorizator
    }

    public getConfig() {
        return this.config
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
            const method = route.method?.toLowerCase() || 'get'

            if (typeof route.auth?.roles === 'function') {
                throw Error('Generating roles depending to request is not implemented et should be with wildcard support'
                    + ' (example read-book-* matches with read-book-36 with url is GET /books/36')
            }

            apiRouter[method as 'all'](route.path,
                this.config.auth
                    ? authMiddleware({
                        realm: this.config.auth.realm || 'app',
                        routeRoles: route.auth?.roles || this.config.auth.defaultRoutesRoles || [],
                        anonymRoles: this.config.auth.anonymRoles || [],
                        authenticator: this.authenticator,
                        authorizator: this.authorizator
                    })
                    : nothingMiddleware(),
                async (req, res, next) => {
                    const uuid = (req as any).uuid
                    const logger = this.logger.child({ serverRequestUuid: uuid })

                    const reqAbortController = new AbortController

                    req.once('close', () => {
                        reqAbortController.abort()
                    })

                    try {

                        if (route.inputParamsSchema) {
                            req.params = validate(req.params, {
                                schema: route.inputParamsSchema,
                                contextErrorMsg: 'params'
                            })
                        }

                        if (route.inputQuerySchema) {
                            req.query = validate(req.query, {
                                schema: route.inputQuerySchema,
                                contextErrorMsg: 'query'
                            })
                        }

                        if (route.inputBodySchema) {
                            req.body = validate(req.body, {
                                schema: route.inputBodySchema,
                                contextErrorMsg: 'body'
                            })
                        }

                    } catch (e) {
                        res.status(400).send((e as Error).message)
                        return
                    }

                    (req as HttpServerRequest).abortSignal = reqAbortController.signal

                    res.send = (content) => {

                        var isCompatibleText = !content
                            || typeof content === 'string'
                            || typeof content === 'number'
                            || content instanceof Date

                        const accepts = isCompatibleText
                            ? ['text/plain', 'json']
                            : ['json', 'multipart/form-data']

                        if (!req.acceptsCharsets('utf8') || !req.acceptsEncodings('identity')) {
                            res.status(406).end()
                            return res
                        }

                        switch(req.accepts(accepts)) {
                            case 'text/plain':
                                res.contentType('text/plain; charset=utf-8')
                                res.write(content.toString())
                                break
                            case 'json':
                                res.contentType('application/json; charset=utf-8')
                                res.write(JSON.stringify(content))
                                break
                            case 'multipart/form-data':
                                throw new Error('Not implemented yet')
                            default:
                                res.status(406)
                        }

                        res.end()

                        return res
                    }

                    try {
                        await route.handler(req as HttpServerRequest, res as HttpServerResponse)
                    } catch (e) {
                        next(e)
                        return
                    }

                    if (!res.finished) {
                        logger.notice('Route handler ended but res open ; closing for conveniance')
                        res.end()
                        return
                    }
                }
            )
        })
    }
}
