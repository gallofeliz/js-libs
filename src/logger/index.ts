import { EventEmitter } from 'events'
import { mapValues, cloneDeep, last, mapKeys } from 'lodash'
import stringify from 'safe-stable-stringify'
import { EOL } from 'os'
import { Obfuscator, ObfuscatorProcessors } from '@gallofeliz/obfuscator'
import traverse from 'traverse'

export type LogLevel = 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'
const levels: LogLevel[] = ['crit', 'error', 'warning', 'notice', 'info', 'debug']

export function shouldBeLogged(logLevel: LogLevel, maxLogLevel: LogLevel) {
    return levels.indexOf(logLevel) <= levels.indexOf(maxLogLevel)
}

export interface LoggerOpts {
    level?: LogLevel
    metadata?: Object
    transports?: Transport[]
    logUnhandled?: boolean
    logWarnings?: boolean
    obfuscator?: {
        processors?: ObfuscatorProcessors
        obfuscateString?: string
    }
    secrets?: string[]
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
        this.level = level || 'info'
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

export interface UniversalLogger {
    crit(message: string, metadata?: Object): Promise<void>
    error(message: string, metadata?: Object): Promise<void>
    warning(message: string, metadata?: Object): Promise<void>
    notice(message: string, metadata?: Object): Promise<void>
    info(message: string, metadata?: Object): Promise<void>
    debug(message: string, metadata?: Object): Promise<void>
    child(metadata?: Object): UniversalLogger
    log(level: LogLevel, message: string, metadata?: Object): Promise<void>
}

export class Logger extends EventEmitter implements UniversalLogger {
    protected metadata: Object
    protected level: LogLevel
    protected transports: Transport[]
    protected obfuscator: Obfuscator

    /**
        Add bumble events ? But so use parent transport ?
    **/
    public constructor({level, metadata, transports, logUnhandled, logWarnings, obfuscator}: LoggerOpts = {}) {
        super()
        this.level = level || 'info'
        this.metadata = metadata || {}
        this.transports = transports || [new JsonConsoleTransport]
        this.obfuscator = new Obfuscator(obfuscator?.processors, obfuscator?.obfuscateString)

        if (logUnhandled !== false) {
            this.logUnhandled()
        }

        if (logWarnings !== false) {
            this.logWarnings()
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
    }

    protected logWarnings() {
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
            metadata: {...this.metadata, ...(metadata || {})},
            transports: this.transports,
            logUnhandled: false
        })
    }
    public async log(level: LogLevel, message: string, metadata?: Object) {
        if (!shouldBeLogged(level, this.level)) {
            return
        }

        const data = traverse({
            ...ensureNotKeys({...this.metadata, ...metadata}, ['level', 'message', 'timestamp']),
            timestamp: new Date,
            level,
            message,
        }).map((v) => {
            if (v instanceof Error) {
                return {
                    ...v,
                    name: v.name,
                    message: v.message,
                    stack: v.stack
                }
            }
            return v
        })

        const log = this.obfuscator.obfuscate(data)

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
