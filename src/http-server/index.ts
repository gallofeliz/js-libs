import { UniversalLogger } from '@gallofeliz/logger'
import express from 'express'
import { Server } from 'http'
import {
    json as jsonParser,
    text as textParser,
    urlencoded as urlencodedParser,
    raw as rawParser
} from 'body-parser'
import { Socket } from 'net'
import { once } from 'events'
import morgan from 'morgan'
import { validate, SchemaObject } from '@gallofeliz/validate'
import { v4 as uuid } from 'uuid'
import * as expressCore from 'express-serve-static-core'
import { createAuthMiddleware, Auth, User , AuthMiddlewareOpts} from '@gallofeliz/auth'
import { OpenApi, OpenApiOperation, OpenApiRequestBody, OpenApiResponse, OpenApiSchema } from 'openapi-v3'
import swaggerUi from 'swagger-ui-express'
import { promisify } from 'util'
import { statSync } from 'fs'
import { resolve } from 'path'

export type HttpServerRequest<
    Params = expressCore.ParamsDictionary,
    Query = expressCore.Query,
    Body = any
> = express.Request & {
    uuid: string
    abortSignal: AbortSignal
    logger: UniversalLogger
    params: Params
    query: Query
    body: Body
    user: User | null
    auth: Auth
}

export interface HttpServerResponse<Body = any> extends expressCore.Response {
    /**
     * Send content
     */
    send(content: Body): this
    sendFile(path: string, options?: any): Promise<void>
}

export interface HttpServerConfig {
    name?: string
    version?: string
    port?: number
    host?: string
    auth?: {
        users: User[]
        authorizationsExtensions?: Record<string, string[]>
        anonymAutorisations?: string[]
        realm?: string
        defaultRequiredAuthentication?: boolean
        defaultRequiredAutorisation?: AuthMiddlewareOpts['requiredAuthorization']
    }
    routes: Array<ApiRoute | StaticRoute>
    swagger?: {
        apiPath: string
        uiPath: string
        requiredAuthentication?: boolean
        requiredAuthorization?: AuthMiddlewareOpts['requiredAuthorization']
    }
    logger: UniversalLogger
}

export interface ApiRoute {
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
    requiredAuthentication?: boolean
    requiredAuthorization?: AuthMiddlewareOpts['requiredAuthorization']
}

export interface StaticRoute {
    path: string
    srcPath: string
    requiredAuthentication?: boolean
    requiredAuthorization?: AuthMiddlewareOpts['requiredAuthorization']
}

function isStaticRoute(route: ApiRoute | StaticRoute): route is StaticRoute {
    return !!(route as StaticRoute).srcPath
}

// function nothingMiddleware() {
//     return (req: express.Request, res: express.Response, next: express.NextFunction) => next()
// }

export function runServer({abortSignal, ...config}: HttpServerConfig & {abortSignal?: AbortSignal}) {
    const httpServer = new HttpServer(config)

    httpServer.start(abortSignal)

    return httpServer
}

export class HttpServer {
    protected logger: UniversalLogger
    protected app: express.Application
    protected server?: Server
    protected connections: Record<string, Socket> = {}
    protected config: HttpServerConfig
    protected auth: Auth

    constructor(config: HttpServerConfig) {
        this.config = config
        this.logger = config.logger

        this.auth = new Auth({
            users: this.config.auth?.users,
            anonymAutorisations: this.config.auth?.anonymAutorisations,
            authorizationsExtensions: this.config.auth?.authorizationsExtensions
        })

        this.app = express()
            .disable('x-powered-by')
            .use(jsonParser({
                strict: false
            }))
            .use(textParser())
            .use(urlencodedParser({ extended: true }))
            .use(rawParser())
            .use((req, res, next) => {
                (req as HttpServerRequest).auth = this.auth;
                (req as HttpServerRequest).uuid = uuid()
                const reqAbortController = new AbortController;
                (req as HttpServerRequest).abortSignal = reqAbortController.signal

                req.once('close', () => {
                    if (!res.finished) {
                        reqAbortController.abort()
                    }
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

        this.configureRoutes()

        this.app.use((err: Error, req: any, res: express.Response, next: any) => {
            this.logger.notice('Http Server error', { e: err })
            res.status(500).end()
        })
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

        this.server = this.app.listen(this.config.port || 80, this.config.host || '0.0.0.0')

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

    protected configureRoutes() {
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

        if (this.config.swagger) {

            const swaggerAuthMiddleware = createAuthMiddleware({
                realm: this.config.auth?.realm || this.config.name || 'app',
                requiredAuthentication: this.config.swagger.requiredAuthentication !== undefined
                    ? this.config.swagger.requiredAuthentication
                    : this.config.auth?.defaultRequiredAuthentication || false,
                requiredAuthorization: this.config.swagger.requiredAuthorization !== undefined
                    ? this.config.swagger.requiredAuthorization
                    : (this.config.auth?.defaultRequiredAutorisation === undefined
                        ? null
                        : this.config.auth?.defaultRequiredAutorisation
                    ),
                auth: this.auth
            })

            this.app.get(
                this.config.swagger.apiPath,
                swaggerAuthMiddleware,
                (req, res) => {
                    res.send({
                        ...swaggerDocument,
                        servers: [{
                            url: req.protocol + '://' + req.header('host')
                        }]
                    })
                }
            )

            this.app.use(
                this.config.swagger.uiPath,
                swaggerAuthMiddleware,
                swaggerUi.serve
            );

            this.app.get(this.config.swagger.uiPath,
                swaggerAuthMiddleware,
                swaggerUi.setup(null as any, {
                        swaggerOptions: {
                            url: this.config.swagger.apiPath
                        }
                    }
                )
            )

        }

        this.config.routes.forEach(route => {

            const routeAuthMiddlewareOpts = {
                realm: this.config.auth?.realm || this.config.name || 'app',
                requiredAuthentication: route.requiredAuthentication !== undefined
                    ? route.requiredAuthentication
                    : this.config.auth?.defaultRequiredAuthentication || false,
                requiredAuthorization: route.requiredAuthorization !== undefined
                    ? route.requiredAuthorization
                    : (this.config.auth?.defaultRequiredAutorisation === undefined
                        ? null
                        : this.config.auth?.defaultRequiredAutorisation
                    ),
                auth: this.auth
            }

            if (isStaticRoute(route)) {

                if (!statSync(route.srcPath).isDirectory()) {
                    this.app.get(
                        route.path,
                        createAuthMiddleware(routeAuthMiddlewareOpts),
                        (_, res, next) => {
                            res.sendFile(resolve(process.cwd(), route.srcPath), next)
                        }
                    )
                } else {
                    this.app.use(
                        route.path,
                        createAuthMiddleware(routeAuthMiddlewareOpts),
                        express.static(route.srcPath)
                    )
                }

                return
            }

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

            ;(swaggerDocument.paths[swaggerRoutePath][method as 'get'] as OpenApiOperation) = {
                description: route.description,
                security: (() => {
                    if (routeAuthMiddlewareOpts.requiredAuthentication) {
                        return [{basic: []}]
                    }
                    if (routeAuthMiddlewareOpts.requiredAuthorization instanceof Function) {
                        // Unable to determine
                        return [{basic: []}]
                    }
                    return !this.auth.isAuthorized(null, routeAuthMiddlewareOpts.requiredAuthorization)
                        ? [{basic: []}]
                        : []
                })(),
                parameters,
                requestBody,
                responses: {
                    '200': {
                        description: '',
                        content: swaggerResponseContent
                    }
                }
            }

            this.app[method as 'all'](route.path,
                createAuthMiddleware(routeAuthMiddlewareOpts),
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

                    let calledSendFile = false

                    res.sendFile = ((fn: Function) => {
                        return async(...args) => {
                            calledSendFile = true
                            return fn(...args)
                        }
                    })(promisify(res.sendFile.bind(res)))

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
                        if ((req as HttpServerRequest).abortSignal.reason === e) {
                            if (!res.finished) {
                                res.end()
                            }
                            return
                        }
                        return
                    }

                    if (!res.finished && !calledSendFile) {
                        res.end()
                        return
                    }
                }
            )
        })
    }
}
