import { cloneDeep, mapKeys, omit, chain } from 'lodash'
import stringify from 'safe-stable-stringify'
import { EOL } from 'os'
import { ObfuscationRule, obfuscate } from '@gallofeliz/obfuscator'
// @ts-ignore
import {flatten as flattenObject} from 'flat'

export type LogLevel = 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'
const levels: LogLevel[] = ['crit', 'error', 'warning', 'notice', 'info', 'debug']

export function getMaxLevelsIncludes(maxLogLevel: LogLevel) {
    return levels.slice(0, levels.indexOf(maxLogLevel) + 1)
}

export function shouldBeLogged(logLevel: LogLevel, maxLogLevel: LogLevel, minLogLevel?: LogLevel) {
    return levels.indexOf(logLevel) <= levels.indexOf(maxLogLevel)
        && (minLogLevel ? levels.indexOf(logLevel) >= levels.indexOf(minLogLevel) : true)
}

export function createLogger(loggerOpts: LoggerOpts = {}) {
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
    handle(log: Log, logger: Logger): Promise<void>
}

export type Processor = (log: Log, logger: Logger) => Log

export interface UniversalLogger {
    crit(message: string, metadata?: Object): Promise<void>
    error(message: string, metadata?: Object): Promise<void>
    warning(message: string, metadata?: Object): Promise<void>
    notice(message: string, metadata?: Object): Promise<void>
    info(message: string, metadata?: Object): Promise<void>
    debug(message: string, metadata?: Object): Promise<void>
    child(metadata?: Object): UniversalLogger
}

export type LoggerId = Exclude<any, undefined>

export interface LoggerOpts {
    id?: LoggerId
    metadata?: Object
    processors?: Processor[]
    handlers?: Handler[]
    errorHandler?: (e: Error) => Promise<void>,
    obfuscation?: {
        rules?: ObfuscationRule[],
        replaceDefaultRules?: boolean,
        replacement?: string
    }
}

export interface Log {
    level: LogLevel
    timestamp: Date
    logger?: LoggerId
    parentLoggers?: LoggerId[]
    message: string
    [k: string]: any
}

export class Logger implements UniversalLogger {
    protected processors: Processor[]
    protected handlers: Handler[]
    protected metadata: Object
    protected errorHandler: (e: Error) => Promise<void>
    protected obfuscation: {
        rules: ObfuscationRule[],
        replaceDefaultRules?: boolean,
        replacement?: string
    }
    protected parent?: Logger
    protected id?: LoggerId

    constructor(opts: LoggerOpts = {}) {
        this.id = opts.id
        this.metadata = opts.metadata || {}
        this.processors = opts.processors || []
        this.handlers = opts.handlers || [new ConsoleHandler]
        this.errorHandler = opts.errorHandler || ((e) => { throw e })
        this.obfuscation = {
            ...opts.obfuscation,
            rules: opts.obfuscation?.rules || [],
        }
    }

    public getMetadata() {
        return this.metadata
    }

    public setMetadata(metadata: Object) {
        this.metadata = metadata
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
        try {
            const parents: LoggerId[] = this.getParents().map(l => l.id).filter(id => id !== undefined) as LoggerId[]

            let log: Log = {
                timestamp: new Date,
                level,
                ...this.id !== undefined && {logger: this.id},
                ...parents.length > 0 && {parentLoggers: parents},
                message,
                ...ensureNotKeys(
                    cloneDeep({...this.metadata, ...metadata}),
                    ['level', 'message', 'timestamp', 'logger', 'parentLoggers']
                )
            }

            for (const processor of this.processors) {
                log = processor(log, this)

                if (!log) {
                    return
                }
            }

            log = obfuscate(log, this.obfuscation)

            await Promise.all(this.handlers.map(handler => handler.handle(log, this))) // cloneDeep to protected others handlers ?
        } catch (e) {
            await this.errorHandler(e as Error)
        }
    }

    public child(id?: LoggerId, metadata?: Object): Logger {
        const logger = new Logger({
            id,
            metadata: cloneDeep({...this.metadata, ...(metadata || {})}),
            processors: [...this.processors],
            handlers: [...this.handlers],
            errorHandler: this.errorHandler,
            obfuscation: {
                ...this.obfuscation,
                rules: [...this.obfuscation.rules]
            }
        })

        logger.parent = this

        return logger
    }

    public getId(): LoggerId | undefined {
        return this.id
    }

    public getParent(): Logger | undefined {
        return this.parent
    }

    /**
    * From bottom to top ancestors
    */
    public getParents(): Logger[] {
        let cursor: Logger | undefined = this
        const parents = []

        while(cursor = cursor.getParent()) {
            parents.push(cursor)
        }

        return parents
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

interface CreateJsonFormatterOpts {
    customReplacements?: Array<(key: any, value: any) => any>
    replaceDefaultReplacements?: boolean
    indentation?: number
}

export function createJsonFormatter(opts: CreateJsonFormatterOpts = {}): Formatter {
    const replacer = (key: any, value: any) => {
        if (opts.customReplacements && opts.customReplacements.length > 0) {
            value = opts.customReplacements.reduce((value, replacer) => replacer(key, value), value)
        }


        if (!opts.replaceDefaultReplacements) {

            if (value instanceof Object && value.toJSON) {
                return value
            }

            if (value instanceof Error) {
                return {
                    ...value,
                    name: value.name,
                    message: value.message,
                    stack: value.stack
                }
            }

            // if (value instanceof Function) {
            //     return value.toString()
            // }

            // if (typeof value === 'symbol') {
            //     return value.toString()
            // }

        }

        return value
    }

    return (log: Log) => {
        return stringify(log, replacer, opts.indentation)
    }
}

export function createLogfmtFormatter(): Formatter {
    const toJson = createJsonFormatter()

    return (log: Log) => {
        return chain(
            flattenObject<Log, object>(JSON.parse(toJson(log)), {delimiter: '.'})
        )
        .omitBy(v => v === undefined)
        .mapKeys((_, k: string) => k.replace(/ /g, '_'))
        .mapValues(v => {
            if (typeof v === 'string' && !v.match(/\s/)) {
                return v
            }

            return JSON.stringify(v)
        })
        .omitBy(v => v === '' || v === undefined)
        .toPairs()
        .map(kv => kv.join('='))
        .join(' ')
        .value()
    }
}

export type Formatter<T extends any = any> = (log: Log) => T

export class BaseHandler implements Handler {
    protected maxLevel: LogLevel
    protected minLevel: LogLevel
    protected formatter: Formatter
    protected processors: Processor[]

    constructor(opts: BaseHandlerOpts = {}) {
        this.maxLevel = opts.maxLevel || 'debug'
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

    public async handle(log:Log, logger: Logger) {
        if (!this.willHandle(log)) {
            return
        }

        for (const processor of this.processors) {
            log = processor(log, logger)

            if (!log) {
                return
            }
        }

        return this.write(this.formatter(log), log, logger)
    }

    protected write(formatted: any, log: Log, logger: Logger): any {
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

export class MemoryHandler extends BaseHandler {
    protected writtenLogs: Array<any> = []

    constructor(opts: BaseHandlerOpts) {
        super({formatter: log => log, ...opts})
    }

    protected async write(formatted: any, log: Log) {
        this.writtenLogs.push(formatted)
    }

    public getWrittenLogs(consume: boolean = false) {
        const writtenLogs = this.writtenLogs

        if (consume) {
            this.clearWrittenLogs()
        }

        return writtenLogs
    }

    public clearWrittenLogs() {
        this.writtenLogs = []
    }
}

export type LoggerProxyHandlerOpts = Omit<BaseHandlerOpts, 'formatter'> & {
    logger: UniversalLogger
}

export class LoggerProxyHandler extends BaseHandler {
    protected logger: UniversalLogger

    constructor({logger, ...opts}: LoggerProxyHandlerOpts) {
        super({...opts, formatter: log => log})
        this.logger = logger
    }

    protected async write(formatted: any, log: Log) {
        return this.logger[log.level](log.message, omit(log, ['level', 'message', 'timestamp']))
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

    protected async write(formatted: any, log: Log, logger: Logger) {
        return this.cb(formatted, log, logger)
    }
}

export function createCallbackHandler(opts: CallbackHandlerOpts) {
    return new CallbackHandler(opts)
}

export function createBreadCrumbHandler(opts: BreadCrumbHandlerOpts) {
    return new BreadCrumbHandler(opts)
}

export type BreadCrumbHandlerOpts = Omit<BaseHandlerOpts, 'formatter'> & {
    handler: Handler
    flushMinLevel?: LogLevel
    flushMaxLevel?: LogLevel
    passthroughMinLevel?: LogLevel
    passthroughMaxLevel?: LogLevel
    crumbStackSize?: number
}

export class BreadCrumbHandler extends BaseHandler {
    protected handler: Handler
    protected stack = new WeakMap<Logger, Log[]>
    protected flushMinLevel: LogLevel
    protected flushMaxLevel: LogLevel
    protected passthroughMinLevel: LogLevel
    protected passthroughMaxLevel: LogLevel
    protected crumbStackSize: number

    constructor({handler, ...opts}: BreadCrumbHandlerOpts) {
        super(opts)
        this.handler = handler
        this.flushMaxLevel = opts.flushMaxLevel || 'notice'
        this.flushMinLevel = opts.flushMinLevel || 'crit'
        this.passthroughMaxLevel = opts.passthroughMaxLevel || 'info'
        this.passthroughMinLevel = opts.passthroughMinLevel || 'crit'
        this.crumbStackSize = opts.crumbStackSize || 10
    }

    protected async write(formatted: any, log: Log, logger: Logger) {
        // Flushing
        if (shouldBeLogged(log.level, this.flushMaxLevel, this.flushMinLevel)) {
            const previousLogs = this.stack.get(logger) || []
            this.stack.delete(logger)
            return await Promise.all([...previousLogs, log].map(log => this.handler.handle(log, logger)))
        }

        // Passthrough
        if (shouldBeLogged(log.level, this.passthroughMaxLevel, this.passthroughMinLevel)) {
            return this.handler.handle(log, logger)
        }

        // breadcrumbing
        [logger, ...logger.getParents()].forEach(loggerBubble => {
            if (!this.stack.has(loggerBubble)) {
                this.stack.set(loggerBubble, [])
            }
            this.stack.get(loggerBubble)!.push(log)
            if (this.stack.get(loggerBubble)!.length > this.crumbStackSize) {
                this.stack.get(loggerBubble)!.shift()
            }
        })
    }
}
