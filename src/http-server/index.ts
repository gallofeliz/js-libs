import { Logger } from '../logger'
import express, { Router } from 'express'
import { OutgoingHttpHeaders, Server, IncomingHttpHeaders, request } from 'http'
import {
    json as jsonParser,
    text as textParser,
    urlencoded as urlencodedParser,
    raw as rawParser
} from 'body-parser'
import { basename } from 'path'
import { Socket } from 'net'
import { HtpasswdValidator } from '@gallofeliz/htpasswd-verify'
import { once } from 'events'
import morgan from 'morgan'
import validate, { SchemaObject } from '../validate'
import { extendErrors } from 'ajv/dist/compile/errors'
import { flatten, intersection } from 'lodash'
import { v4 as uuid } from 'uuid'
import stream from 'stream'
import { HttpRequestConfig } from '../http-request'
import * as expressCore from 'express-serve-static-core'
import auth from 'basic-auth'
import { OpenApi, OpenApiOperation, OpenApiRequestBody, OpenApiResponse, OpenApiSchema } from 'openapi-v3'
import swaggerUi from 'swagger-ui-express'


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
    name?: string
    version?: string
    port: number
    host?: string
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
        swagger?: {
            apiPath?: string
            uiPath?: string
            auth?: {
                autorisations?: string | string[]
            }
        }
        routes: Array<{
            description?: string
            method?: string
            path: string
            handler(request: HttpServerRequest<any>, response: HttpServerResponse): Promise<void>
            inputBodySchema?: SchemaObject
            inputQuerySchema?: SchemaObject
            inputParamsSchema?: SchemaObject
            outputBodySchema?: SchemaObject
            inputContentType?: string
            outputContentType?: string
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
            // I think we can remove morgan ...
            .use(morgan((tokens, req, res) => {
                this.logger.info('httpServer response', {
                    serverRequestUuid: (req as HttpServerRequest).uuid,
                    aborted: (req as HttpServerRequest).abortSignal.aborted,
                    status: res.statusCode,
                    user: (req as HttpServerRequest).user?.username || null,
                    method: req.method,
                    url: tokens.url(req, res),
                    responseTime: parseFloat(tokens['response-time'](req, res) as string),
                    totalTime: parseFloat(tokens['total-time'](req, res) as string),
                })

                return ''
            }, {stream: { write: () => {} }}))

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

        this.app.use((err: Error, req: any, res: express.Response, next: any) => {
            this.logger.notice('Http Server error', { e: err })
            res.status(500).end()
        })
    }

    public getAuthorizator() {
        return this.authorizator
    }

    public async start(abortSignal?: AbortSignal) {
        if (this.server) {
            abortSignal?.addEventListener('abort', () => {
                this.stop()
            })
            return
        }

        if (abortSignal?.aborted) {
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

        if (abortSignal?.aborted) {
            this.stop()
            return
        }

        abortSignal?.addEventListener('abort', () => {
            this.stop()
        })

        this.logger.info('Ready')
    }

    public async stop() {
        if (!this.server) {
            return
        }

        if (!this.server.listening) {
            await once(this.server, 'listening')
        }

        this.server.close()

        Object.keys(this.connections).forEach(key => this.connections[key].destroy())

        delete this.server
    }

    protected configureApi() {
        if (!this.config.api) {
            return
        }

        const swaggerDocument: OpenApi = {
              "openapi": "3.0.0",
              "info": {
                "title": this.config.name || 'API',
                "version": this.config.version || 'Current'
              },
              "paths": {
              }
            }

        if (this.config.auth) {
            swaggerDocument.components = {
                securitySchemes: {
                    basic: {
                        type: 'http',
                        scheme: 'basic'
                    }
                }
            }

        }

        const apiRouter = express.Router()
        this.app.use('/' + (this.config.api.prefix ? this.config.api.prefix.replace(/^\//, '') : ''), apiRouter)

        apiRouter.use(this.config.api.swagger?.uiPath || this.config.api.routes.some(r => r.path === '/') ? '/swagger-ui' : '/', swaggerUi.serve, swaggerUi.setup(null as any, {
            swaggerOptions: {
                url: this.config.api.swagger?.apiPath || '/swagger'
            }
        }));

        apiRouter.get(this.config.api.swagger?.apiPath || '/swagger', (req, res) => {
            res.send({
                ...swaggerDocument,
                servers: [{
                    url: req.protocol + '://' + req.header('host')
                }]
            })
        })

        this.config.api.routes.forEach(route => {
            const method = route.method?.toLowerCase() || 'get'
            const swaggerRoutePath = route.path.replace(/:([a-z]+)/gi, '{$1}')

            if (!swaggerDocument.paths[swaggerRoutePath]) {
                swaggerDocument.paths[swaggerRoutePath] = {}
            }

            const parameters: OpenApiOperation['parameters'] = [];

            if (route.inputQuerySchema) {
                Object.keys(route.inputQuerySchema.properties).forEach(key => {
                    parameters.push({
                        name: key,
                        in: 'query',
                        required: (route.inputQuerySchema!.required || []).includes(key),
                        schema: route.inputQuerySchema!.properties[key]
                    })
                })
            }

            if (route.inputParamsSchema) {
                Object.keys(route.inputParamsSchema.properties).forEach(key => {
                    parameters.push({
                        name: key,
                        in: 'path',
                        required: true,
                        schema: route.inputParamsSchema!.properties[key]
                    })
                })
            }

            const swaggerOutputBodySchema: OpenApiSchema = (route.outputBodySchema as OpenApiSchema) || {};

            const swaggerResponseContent: OpenApiResponse['content'] = {};

            if (route.outputContentType) {
                swaggerResponseContent[route.outputContentType] = {schema: swaggerOutputBodySchema}
            } else {
                if (!swaggerOutputBodySchema.type) {
                    swaggerResponseContent['*/*'] = {schema: swaggerOutputBodySchema}
                } else {
                    if (['string', 'number'].includes(swaggerOutputBodySchema.type)) {
                        swaggerResponseContent['text/plain'] = { schema: swaggerOutputBodySchema }
                        swaggerResponseContent['application/json'] = { schema: swaggerOutputBodySchema }
                    } else {
                        swaggerResponseContent['application/json'] = { schema: swaggerOutputBodySchema }
                        swaggerResponseContent['text/yaml'] = { schema: swaggerOutputBodySchema }
                        swaggerResponseContent['multipart/form-data'] = { schema: swaggerOutputBodySchema }
                    }
                }
            }

            let requestBody: OpenApiRequestBody | undefined = undefined;

            if (route.inputContentType) {
                requestBody = {
                    required: true,
                    content: {
                        [route.inputContentType]: { schema: route.inputBodySchema as any}
                    }
                }
            } else {
                if (route.inputBodySchema) {
                    if (['string', 'number'].includes(route.inputBodySchema.type)) {
                        requestBody = {
                            required: true,
                            content: {
                                'text/plain': { schema: route.inputBodySchema as any},
                                'application/json': { schema: route.inputBodySchema as any }
                            }
                        }
                    } else {
                        requestBody = {
                            required: true,
                            content: {
                                'application/json': { schema: route.inputBodySchema as any },
                                'application/x-www-form-urlencoded': { schema: route.inputBodySchema as any },
                            }
                        }
                    }
                }
            }

            (swaggerDocument.paths[swaggerRoutePath][method as 'get'] as OpenApiOperation) = {
                description: route.description,
                security: !this.config.auth || this.authorizator.isAutorised(null, route.auth?.autorisations || []) ? [] : [{basic: []}],
                parameters,
                requestBody,
                responses: {
                    '200': {
                        description: '',
                        content: swaggerResponseContent
                    }
                }
            }

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

                        if (route.outputContentType) {
                            throw new Error('Not handled')
                        }

                        var isCompatibleText = !content
                            || typeof content === 'string'
                            || typeof content === 'number'
                            || content instanceof Date

                        const accepts = isCompatibleText
                            ? ['text/plain', 'json']
                            : ['json', 'multipart/form-data', 'yaml']

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
                            case 'yaml':
                                res.contentType('text/yaml; charset=utf-8')
                                res.write(require('yaml').stringify(content))
                                break
                            default:
                                res.status(406)
                        }

                        res.end()

                        return res
                    }

                    try {
                        if (route.outputContentType) {
                            res.once('pipe', () => {
                                res.contentType(route.outputContentType as string)
                            })
                        }

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
