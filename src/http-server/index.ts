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
    authorizator: Authorizator
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
    //aboutEndpoint => return { name: package.json['name'], version: package.json['version']}
    auth?: {
        users: User[]
        autorisationsPolicies?: Record<string, string | string[]>
        anonymAutorisations?: string | string[]
        realm?: string
        defaultRoutesAutorisations?: string | string[]
    }
    webUi?: {
        filesPath: string
        auth?: {
            autorisations?: string | string[]
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
                //forceAuthentication?: boolean -> ensure req.user will be not null
                autorisations: string | string[]
                //roles?: string | string[] | ((request: HttpServerRequest<any>) => string | string[])
            }
        }>
    }
    logger: Logger
}

interface User {
    username: string
    password: string
    autorisations: string | string[]
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
    protected autorisationsPolicies: Record<string, string | string[]>
    protected anonymAutorisations: string[]

    constructor(autorisationsPolicies: Record<string, string | string[]>, anonymAutorisations: string | string[]) {
        this.autorisationsPolicies = autorisationsPolicies
        this.anonymAutorisations = Array.isArray(anonymAutorisations) ? anonymAutorisations : [anonymAutorisations]
    }

    public isAutorised(user: User | null, roles: string | string[]): boolean {
       const userExtendedRoles = this.extendRoles(user ? user.autorisations : this.anonymAutorisations)
       const testedExtendedRoles = this.extendRoles(roles)

       if (userExtendedRoles.length === 0 || testedExtendedRoles.length === 0) {
          return false
       }

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
        if (intersection(roles, Object.keys(this.autorisationsPolicies)).length === 0) {
            return roles
        }
        return this.extendRoles(flatten(roles.map(role => this.autorisationsPolicies[role] || role)))
    }
}

// function nothingMiddleware() {
//     return (req: express.Request, res: express.Response, next: express.NextFunction) => next()
// }

function authMiddleware(
    {realm, routeRoles, authenticator, authorizator}:
    {realm: string, routeRoles: string | string[], authenticator: Authenticator, authorizator: Authorizator}
) {
    function demandAuth(res: express.Response) {
        res.set('WWW-Authenticate', 'Basic realm="'+realm+'"').status(401).end()
    }

    return function (req: express.Request, res: express.Response, next: express.NextFunction) {
        const userPassFromHeaders = auth(req)

        if (!userPassFromHeaders) {
            // Anonym
            if (!authorizator.isAutorised(null, routeRoles)) {
                return demandAuth(res)
            }

            (req as HttpServerRequest).user = null
        } else {
            // Not anonym
            const user = authenticator.authenticate(userPassFromHeaders.name, userPassFromHeaders.pass)

            if (!user) {
                return demandAuth(res)
            }

            if (!authorizator.isAutorised(user, routeRoles)) {
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
        morgan.token('aborted', (req: HttpServerRequest) => {
            return req.abortSignal.aborted.toString()
        })

        this.authenticator = new Authenticator(this.config.auth?.users || [])
        this.authorizator = this.config.auth
            ? new Authorizator(this.config.auth.autorisationsPolicies || {}, this.config.auth.anonymAutorisations || [])
            : new Authorizator({}, '*')

        this.app = express()
            .disable('x-powered-by')
            .use(jsonParser({
                strict: false
            }))
            .use(textParser())
            .use(urlencodedParser({ extended: true }))
            .use(rawParser())
            .use((req, res, next) => {
                (req as HttpServerRequest).authorizator = this.authorizator;
                (req as HttpServerRequest).uuid = uuid()
                const reqAbortController = new AbortController;
                (req as HttpServerRequest).abortSignal = reqAbortController.signal

                res.once('close', () => {
                    reqAbortController.abort()
                })

                next()
            })
            .use(morgan(':uuid :method :url :status (:aborted) :response-time ms', {stream: {
                write: (message: string) => {
                    const [uuid, ...logParts] = message.trim().split(' ')
                    this.logger.info(logParts.join(' '), { serverRequestUuid: uuid })
                }
            }}))

        this.configureApi()

        if (this.config.webUi) {
            this.app.use('/',
                authMiddleware({
                    realm: this.config.auth?.realm || 'app',
                    routeRoles: this.config.auth
                        ? this.config.webUi.auth?.autorisations || this.config.auth.defaultRoutesAutorisations || []
                        : '*',
                    authenticator: this.authenticator,
                    authorizator: this.authorizator
                }),
                express.static(this.config.webUi.filesPath)
            )
        }

        this.app.use((err: Error, req: any, res: any, next: any) => {
            this.logger.notice('Http Server error', { e: err })
            res.status(500).end()
        })
    }

    public getAuthorizator() {
        return this.authorizator
    }

    public async start() {
        if (this.server) {
            return
        }
        this.server = this.app.listen(this.config.port, this.config.host || '0.0.0.0')

        this.server.on('connection', (conn) => {
            const key = conn.remoteAddress + ':' + conn.remotePort
            this.connections[key] = conn
            conn.on('close', () => {
                delete this.connections[key]
            })
        })

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

            apiRouter[method as 'all'](route.path,
                authMiddleware({
                    realm: this.config.auth?.realm || 'app',
                    routeRoles: this.config.auth
                        ? route.auth?.autorisations || this.config.auth.defaultRoutesAutorisations || []
                        : '*',
                    authenticator: this.authenticator,
                    authorizator: this.authorizator
                }),
                async (req, res, next) => {
                    const uuid = (req as any).uuid
                    const logger = this.logger.child({ serverRequestUuid: uuid })
                    ;(req as HttpServerRequest).logger = logger

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
                        if ((req as HttpServerRequest).abortSignal.aborted && (e as any).code === 'ABORT_ERR') {
                            // nothing to do : res and req are closed
                            return
                        }
                        next(e)
                        return
                    }

                    if (!res.finished) {
                        res.end()
                        return
                    }
                }
            )
        })
    }
}
