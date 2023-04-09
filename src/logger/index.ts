import { EventEmitter } from 'events'
import { cloneDeep, mapKeys } from 'lodash'
import stringify from 'safe-stable-stringify'
import { EOL } from 'os'
import { Obfuscator } from '@gallofeliz/obfuscator'
import { JsToJSONCompatibleJS, JsToJSONCompatibleJSRule } from './js-json'

export type LogLevel = 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'
const levels: LogLevel[] = ['crit', 'error', 'warning', 'notice', 'info', 'debug']

export function getMaxLevelsIncludes(maxLogLevel: LogLevel) {
    return levels.slice(0, levels.indexOf(maxLogLevel) + 1)
}

export function shouldBeLogged(logLevel: LogLevel, maxLogLevel: LogLevel, minLogLevel?: LogLevel) {
    return levels.indexOf(logLevel) <= levels.indexOf(maxLogLevel)
        && (minLogLevel ? levels.indexOf(logLevel) > levels.indexOf(minLogLevel) : true)
}

export function createLogger(loggerOpts?: LoggerOpts) {
    return new Logger(loggerOpts)
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

// v3

export interface Handler {
    // willHandle(log: Log): boolean
    handle(log: Log): Promise<void>
}

export type Processor = (log: Log) => Log

export function logUnhandled(logger: UniversalLogger) {
    process.on('unhandledRejection', async (reason) => {
        await logger.crit('Unhandled Rejection', {reason})
        process.exit(1)
    })
    process.on('uncaughtException', async (err, origin) => {
        await logger.crit('UncaughtException', {err, origin})
        process.exit(1)
    })
}

export function logWarnings(logger: UniversalLogger) {
    process.on('warning', async (warning) => {
        await logger.warning('Warning', {warning})
    })
}

export interface UniversalLogger {
    crit(message: string, metadata?: Object): Promise<void>
    error(message: string, metadata?: Object): Promise<void>
    warning(message: string, metadata?: Object): Promise<void>
    notice(message: string, metadata?: Object): Promise<void>
    info(message: string, metadata?: Object): Promise<void>
    debug(message: string, metadata?: Object): Promise<void>
    child(metadata?: Object): UniversalLogger
}

export interface LoggerOpts {
    metadata?: Object
    processors?: Processor[]
    handlers?: Handler[]
    errorHandler?: (e: Error) => Promise<void>
}

export interface Log {
    level: LogLevel
    timestamp: Date
    message: string
    [k: string]: any
}

export class Logger implements UniversalLogger {
    protected processors: Processor[]
    protected handlers: Handler[]
    protected metadata: Object
    protected errorHandler: (e: Error) => Promise<void>

    constructor(opts: LoggerOpts = {}) {
        this.metadata = opts.metadata || {}
        this.processors = opts.processors || []
        this.handlers = opts.handlers || [new ConsoleHandler]
        this.errorHandler = opts.errorHandler || ((e) => { throw e })
    }

    public getMetadata() {
        return this.metadata
    }

    public getProcessors() {
        return this.processors
    }

    public getHandlers() {
        return this.handlers
    }

    public async log(level: LogLevel, message: string, metadata?: Object): Promise<void> {
        let log: Log = {
            ...ensureNotKeys(cloneDeep({...this.metadata, ...metadata}), ['level', 'message', 'timestamp']),
            timestamp: new Date,
            level,
            message,
        }

        for (const processor of this.processors) {
            log = processor(log)

            if (!log) {
                return
            }
        }

        try {
            await Promise.all(this.handlers.map(handler => handler.handle(log))) // cloneDeep to protected others handlers ?
        } catch (e) {
            await this.errorHandler(e as Error)
        }
    }

    public child(metadata?: Object): Logger {
        return new Logger({
            metadata: cloneDeep({...this.metadata, ...(metadata || {})}),
            processors: [...this.processors],
            handlers: [...this.handlers],
            errorHandler: this.errorHandler
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
}

export interface BaseHandlerOpts {
    maxLevel?: LogLevel
    minLevel?: LogLevel
    processors?: Processor[]
    formatter?: Formatter
}

export const jsonFormatter = (log: Log) => stringify(log)

export type Formatter<T extends any = any> = (log: Log) => T

export class BaseHandler implements Handler {
    protected maxLevel: LogLevel
    protected minLevel: LogLevel
    protected formatter: Formatter
    protected processors: Processor[]

    constructor(opts: BaseHandlerOpts = {}) {
        this.maxLevel = opts.maxLevel || 'info'
        this.minLevel = opts.minLevel || 'crit'
        this.processors = opts.processors || []
        this.formatter = opts.formatter || jsonFormatter
    }

    protected willHandle(log: Log) {
        return shouldBeLogged(log.level, this.maxLevel, this.minLevel)
    }

    public async handle(log:Log) {
        if (!this.willHandle(log)) {
            return
        }

        for (const processor of this.processors) {
            log = processor(log)

            if (!log) {
                return
            }
        }

        return this.write(this.formatter(log), log)
    }

    protected async write(formatted: any, log: Log) {
        throw new Error('To implement in handler')
    }
}

export interface StreamHandlerOpts extends BaseHandlerOpts {
    stream: NodeJS.WritableStream
}

export class StreamHandler extends BaseHandler {
    protected stream: NodeJS.WritableStream

    constructor(opts: StreamHandlerOpts) {
        super(opts)
        this.stream = opts.stream
    }

    protected async write(formatted: any, log: Log) {
        this.stream.write(formatted.toString() + EOL)
    }
}

export class ConsoleHandler extends BaseHandler {
    protected async write(formatted: any, log: Log) {
        if (['debug', 'info'].includes(log.level)) {
            process.stdout.write(formatted)
        } else {
            process.stderr.write(formatted)
        }
    }
}




// old (v2)

export interface OldLoggerOpts {
    level?: LogLevel
    metadata?: Object
    handler?: Handler
    logUnhandled?: boolean
    logWarnings?: boolean
    obfuscation?: {
        rules?: any[]
        replacement?: string
    }
    convertion?: {
        customRules: JsToJSONCompatibleJSRule[]
    },
    parentLogger?: Logger
}









// export class LoggerOld extends EventEmitter implements UniversalLogger {
//     protected metadata: Object
//     protected level: LogLevel
//     protected handler: Handler
//     protected obfuscator: Obfuscator
//     protected jsToJSONCompatibleJS: JsToJSONCompatibleJS
//     protected parentLogger: Logger | null = null

//     /**
//         Add bumble events ? But so use parent transport ?
//     **/
//     public constructor({level, metadata, handler, logUnhandled, logWarnings, obfuscation, convertion, parentLogger}: LoggerOpts = {}) {
//         super()
//         this.level = level || 'info'
//         this.metadata = metadata || {}
//         this.handler = handler || new JsonConsoleHandler
//         this.obfuscator = new Obfuscator(obfuscation?.rules || [], obfuscation?.replacement)
//         this.jsToJSONCompatibleJS = new JsToJSONCompatibleJS(convertion?.customRules)

//         if (parentLogger) {
//             this.parentLogger = parentLogger
//         }

//         if (logUnhandled !== false) {
//             this.logUnhandled()
//         }

//         if (logWarnings !== false) {
//             this.logWarnings()
//         }
//     }


//     public child(metadata?: Object): Logger {
//         const child = new Logger({
//             level: this.level,
//             metadata: {...this.metadata, ...(metadata || {})},
//             handler: this.handler,
//             logUnhandled: false,
//             logWarnings: false,
//             parentLogger: this
//         })

//         child.obfuscator = this.obfuscator
//         child.jsToJSONCompatibleJS = this.jsToJSONCompatibleJS

//         return child
//     }
//     public async log(level: LogLevel, message: string, metadata?: Object) {
//         if (!shouldBeLogged(level, this.level)) {
//             return
//         }

//         // Processors
//         const log = this.obfuscator.obfuscate(
//             this.jsToJSONCompatibleJS.convert(
//             {
//                 ...ensureNotKeys({...this.metadata, ...metadata}, ['level', 'message', 'timestamp']),
//                 timestamp: new Date,
//                 level,
//                 message,
//             }
//         ))

//         this.emit('log', log)

//         if (this.parentLogger) {
//             this.parentLogger.onChildEmit(log)
//         }

//         await this.handler.write(log)
//     }

//     protected onChildEmit(log: Log) {
//         this.emit('log', log)

//         if (this.parentLogger) {
//             this.parentLogger.onChildEmit(log)
//         }
//     }
// }


