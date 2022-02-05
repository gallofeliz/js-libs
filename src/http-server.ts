import { Logger } from './logger'
import express from 'express'
import { Server } from 'http'
import basicAuth from 'express-basic-auth'
import { json as jsonParser } from 'body-parser'
import { basename } from 'path'
import { Socket } from 'net'
import HtpasswdValidator from 'htpasswd-verify'

export interface HttpServerConfig {
    port: number
    auth?: {
        users: Array<{
            username: string
            password: string
        }>
    }
    webUiFilesPath?: string
    api?: {
        prefix?: string
        routes: Array<{
            method: string
            path: string
            handler: (req: express.Request, res: express.Response, next?: express.NextFunction) => any
        }>
    }
    logger: Logger
}

export default class HttpServer {
    protected logger: Logger
    protected app: express.Application
    protected server?: Server
    protected connections: Record<string, Socket> = {}
    protected config: HttpServerConfig

    constructor(config: HttpServerConfig) {
        this.config = config
        this.logger = config.logger

        this.app = express()

        this.configureAuth()

        this.app.use(jsonParser())

        this.configureApi()

        if (this.config.webUiFilesPath) {
            this.app.use('/', express.static(this.config.webUiFilesPath))
        }

        this.app.use((err: Error, req: any, res: any, next: any) => {
            this.logger.notice('Http Server error', { e: err })
            res.status(500).send(err.toString());
        });

    }

    public start() {
        if (this.server) {
            return
        }
        this.server = this.app.listen(this.config.port)

        this.server.on('connection', (conn) => {
            const key = conn.remoteAddress + ':' + conn.remotePort;
            this.connections[key] = conn;
            conn.on('close', () => {
                delete this.connections[key];
            });
        });
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
        if (!this.config.api) {
            return
        }

        if (this.config.webUiFilesPath && !this.config.api.prefix) {
            throw new Error('Api needs prefix if webUiFilesPath is not empty')
        }

        const apiRouter = express.Router()
        this.app.use('/' + (this.config.api.prefix ? this.config.api.prefix.replace(/^\//, '') : ''), apiRouter)

        this.config.api.routes.forEach(route => {
            apiRouter[route.method.toLowerCase() as 'all'](route.path, async (req, res, next) => {
                try {
                    const response = await route.handler(req, res, next)

                    if (response !== undefined) {
                        res.send(response)
                    }
                } catch (e) {
                    next(e)
                }
            })
        })
    }

    protected configureAuth() {
        if (!this.config.auth) {
            return
        }

        const htpasswordValidator = new HtpasswdValidator(this.config.auth.users.reduce((dict, user) => ({...dict, [user.username]: user.password}), {}))

        this.app.use(basicAuth({
            authorizer(inputUsername: string, inputPassword: string) {
                return htpasswordValidator.verify(inputUsername, inputPassword)
            },
            challenge: true
        }))
    }
}
