import { Logger } from '../logger'
import express, { Router } from 'express'
import { Server } from 'http'
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

interface User {
    username: string
    password: string
    roles: string[]
}

interface RouteHandlerParameters<Params, Query, Body> {
    req: express.Request,
    res: express.Response,
    logger: Logger
    params: Params
    body: Body
    query: Query
    uuid: string
    abortSignal: AbortSignal
}

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
            handler/*<Params, Query, Body, OutputBody>*/(parameters: RouteHandlerParameters<any, any, any>): Promise<any>
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
                try {
                    const logger = this.logger.child({ serverRequestUuid: (req as any).uuid })

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

                    const reqAbortController = new AbortController

                    req.once('close', () => {
                        reqAbortController.abort()
                    })

                    const response = await route.handler({
                        req,
                        res,
                        abortSignal: reqAbortController.signal,
                        logger,
                        params: req.params,
                        body: req.body,
                        query: req.query,
                        uuid: (req as any).uuid
                    })

                    if (!res.finished && response !== res) {
                        if (response === undefined) {
                            res.status(201).end()
                        } else {
                            //if (req.accepts('json')) {
                            res.json(response).end()
                        }
                    }
                } catch (e) {
                    next(e)
                }
            })
        })
    }
}
