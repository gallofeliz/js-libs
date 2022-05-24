import { EventEmitter } from 'events'
import { mapValues, cloneDeep } from 'lodash'
import stringify from 'safe-stable-stringify'

export type LogLevel = 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'
const levels = ['crit', 'error', 'warning', 'notice', 'info', 'debug']

interface LoggerOpts {
    level?: LogLevel
    secrets?: string[]
    metadata?: Object
    transports?: Transport[]
    logUnhandled?: boolean
}

interface Transport {
    write(log: Object): Promise<void>
}

export class JsonConsoleTransport implements Transport {
    public async write(log: Object) {
        console.log(stringify(log))
    }
}

export class Logger extends EventEmitter {
    protected metadata: Object
    protected secrets: string[]
    protected level: LogLevel
    protected transports: Transport[]

    /**
        Add bumble events ? But so use parent transport ?
    **/
    public constructor({level, secrets, metadata, transports, logUnhandled}: LoggerOpts = {}) {
        super()
        this.level = level || 'info'
        this.secrets = secrets || ['password', 'key', 'secret', 'auth', 'token', 'credential']
        this.metadata = metadata || {}
        this.transports = transports || []

        if (logUnhandled) {
            this.logUnhandled()
        }
    }

    protected logUnhandled() {
        process.on('unhandledRejection', async (reason) => {
            await this.crit('Unhandled Rejection', {reason})
            process.exit(1)
        })
        process.on('uncaughtException', async (err, origin) => {
            await this.crit('UncaughtException', {err, origin})
            process.exit(1)
        })
        process.on('warning', async (warning) => {
            await this.warning('Warning', {warning})
        })
    }

    public async crit(message: string, metadata?: Object) {
        return this.log('crit', message, metadata)
    }
    public async error(message: string, metadata?: Object) {
        return this.log('error', message, metadata)
    }
    public async warning(message: string, metadata?: Object) {
        return this.log('warning', message, metadata)
    }
    public async notice(message: string, metadata?: Object) {
        return this.log('notice', message, metadata)
    }
    public async info(message: string, metadata?: Object) {
        return this.log('info', message, metadata)
    }
    public async debug(message: string, metadata?: Object) {
        return this.log('debug', message, metadata)
    }
    public child(metadata?: Object) {
        return new Logger({
            level: this.level,
            secrets: this.secrets,
            metadata: {...this.metadata, ...(metadata || {})},
            transports: this.transports,
            logUnhandled: false
        })
    }
    protected async log(level: LogLevel, message: string, metadata?: Object) {
        if (levels.indexOf(level) > levels.indexOf(this.level)) {
            return
        }

        const log = sanitize({...this.metadata, level, message, ...metadata, timestamp: new Date}, this.secrets)

        this.emit('log', log) //, cb)

        await Promise.all(this.transports.map(transport => transport.write(log)))
    }
}

function sanitize(variable: any, secrets: string[]): any {
    if (typeof variable === 'object') {
        if (variable instanceof Error) {
            return {
                name: variable.name,
                message: variable.message,
                stack: variable.stack
            }
        }
        for (const key in variable) {
            if (typeof key !== 'string') {
                continue
            }
            if (typeof variable[key] === 'object') {
                variable[key] = sanitize(variable[key], secrets)
                continue
            }
            for (const secret of secrets) {
                if (key.toLowerCase().includes(secret)) {
                    variable[key] = '***'
                }
            }

        }

    }

    return variable
}

export default function createLogger(level: LogLevel) {
    return new Logger({
        level,
        transports: [new JsonConsoleTransport],
        logUnhandled: true
    })
}
