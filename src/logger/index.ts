import { cloneDeep, mapKeys } from 'lodash'
import stringify from 'safe-stable-stringify'
import { EOL } from 'os'
import { Obfuscator, ObfuscatorRule } from '@gallofeliz/obfuscator'
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

    public setProcessors(processors: Processor[]) {
        this.processors = processors
    }

    public getHandlers() {
        return this.handlers
    }

    public setHandlers(handlers: Handler[]) {
        this.handlers = handlers
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

export function createJsonFormatter(rules?: JsToJSONCompatibleJSRule[], replaceDefaultRules?: boolean) {
    const f = new JsToJSONCompatibleJS(rules, replaceDefaultRules)
    return (log: Log) => {
        return stringify(f.convert(log))
    }
}

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
        this.formatter = opts.formatter || createJsonFormatter()
    }

    public getProcessors() {
        return this.processors
    }

    public setProcessors(processors: Processor[]) {
        this.processors = processors
    }

    public getFormatter() {
        return this.formatter
    }

    public setFormatter(formatter: Formatter) {
        this.formatter = formatter
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

    protected write(formatted: any, log: Log): any {
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

export function createStreamHandler(opts: StreamHandlerOpts) {
    return new StreamHandler(opts)
}

export class ConsoleHandler extends BaseHandler {
    protected async write(formatted: any, log: Log) {
        if (['debug', 'info'].includes(log.level)) {
            process.stdout.write(formatted + EOL)
        } else {
            process.stderr.write(formatted + EOL)
        }
    }
}

export function createConsoleHandler(opts: BaseHandlerOpts = {}) {
    return new ConsoleHandler(opts)
}

export interface CallbackHandlerOpts extends BaseHandlerOpts {
    cb: BaseHandler['write']
}

export class CallbackHandler extends BaseHandler {
    protected cb: BaseHandler['write']

    constructor(opts: CallbackHandlerOpts) {
        super(opts)
        this.cb = opts.cb
    }

    protected async write(formatted: any, log: Log) {
        return this.cb(formatted, log)
    }
}

export function createCallbackHandler(opts: CallbackHandlerOpts) {
    return new CallbackHandler(opts)
}

export function createJsConvertionProcessor(rules?: JsToJSONCompatibleJSRule[]): Processor {
    const lib = new JsToJSONCompatibleJS(rules)

    return log => lib.convert(log)
}

export function createObfuscationProcessor(rules: ObfuscatorRule[], replacement?: string): Processor {
    const lib = new Obfuscator(rules, replacement)

    return log => lib.obfuscate(log)
}
