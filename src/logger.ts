import { EventEmitter } from 'events'
import { mapValues, cloneDeep, last, mapKeys } from 'lodash'
import stringify from 'safe-stable-stringify'
import { EOL } from 'os'

export type LogLevel = 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'
const levels: LogLevel[] = ['crit', 'error', 'warning', 'notice', 'info', 'debug']

export function getLowerLevel(): LogLevel {
    return last(levels) as LogLevel
}

export function shouldBeLogged(logLevel: LogLevel, maxLogLevel: LogLevel) {
    return levels.indexOf(logLevel) <= levels.indexOf(maxLogLevel)
}

export interface LoggerOpts {
    level?: LogLevel
    secrets?: string[]
    metadata?: Object
    transports?: Transport[]
    logUnhandled?: boolean
}

export interface Log {
    level: LogLevel
    timestamp: Date
    message: string
    [k: string]: any
}

export interface Transport {
    write(log: Log): Promise<void>
}

export abstract class BaseTransport implements Transport {
    protected level: LogLevel

    public constructor(level?: LogLevel) {
        this.level = level || getLowerLevel()
    }

    public async write(log: Log) {
        if (!shouldBeLogged(log.level, this.level)) {
            return
        }

        return this._write(log)
    }

    protected abstract _write(log: Log): Promise<void>
}

export class JsonConsoleTransport extends BaseTransport {

    public async _write(log: Log) {
        const strLog = stringify(log) + EOL
        if (['debug', 'info'].includes(log.level)) {
            process.stdout.write(strLog)
        } else {
            process.stderr.write(strLog)
        }
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
        this.level = level || getLowerLevel()
        this.secrets = secrets || ['password', 'key', 'secret', 'auth', 'token', 'credential']
        this.metadata = metadata || {}
        this.transports = transports || []

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
            metadata: {...this.metadata, ...(metadata || {})},
            transports: this.transports,
            logUnhandled: false
        })
    }
    protected async log(level: LogLevel, message: string, metadata?: Object) {
        if (!shouldBeLogged(level, this.level)) {
            return
        }

        const log = sanitize({
            ...ensureNotKeys({...this.metadata, ...metadata}, ['level', 'message', 'timestamp']),
            timestamp: new Date,
            level,
            message,
        }, this.secrets)

        this.emit('log', log) //, cb)

        await Promise.all(this.transports.map(transport => transport.write(log)))
    }
}

function ensureNotKeys(object: Object, keys: string[]): Object {
    return mapKeys(object, (value, key) => {
        if (!keys.includes(key)) {
            return key
        }
        let newKey = key

        while (object.hasOwnProperty(newKey)) {
            newKey = '_' + newKey
        }
        return newKey
    })
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
