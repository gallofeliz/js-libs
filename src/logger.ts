import { EventEmitter } from 'events'
import { createLogger as createWinstonLogger, format, transports, Logger as WinstonLogger, config } from 'winston'
import { mapValues, cloneDeep } from 'lodash'
import { Writable } from 'stream'

interface EventEmittedLogsLogger {
    on(event: 'log', listener: (logObject: object) => void): this
    once(event: 'log', listener: (logObject: object) => void): this
}

export type Logger = WinstonLogger & EventEmittedLogsLogger

export type LogLevel = 'emerg' | 'alert' | 'crit' | 'error' | 'warning' | 'notice' | 'info' | 'debug'

const secrets = ['password', 'key', 'secret', 'auth', 'token', 'credential']

function sanitize(variable: any): any {
    if (typeof variable === 'object') {
        if (variable instanceof Error) {
            return variable.toString()
        }
        for (const key in variable) {
            if (typeof key !== 'string') {
                continue
            }
            if (typeof variable[key] === 'object') {
                variable[key] = sanitize(variable[key])
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

export default function createLogger(level: LogLevel): Logger {
    const stream = new Writable({objectMode: true})

    const logger = createWinstonLogger({
        levels: config.syslog.levels,
        level,
        format: format.combine(
            format.timestamp(),
            (format((info) => sanitize(cloneDeep(info))))(),
            format.json()
        ),
        transports: [new transports.Console(), new transports.Stream({ stream })]
    })

    // logger child share the same instance, this is a shitty design for me
    // Should be good to find another solution to capture child logs
    logger.setMaxListeners(100)

    stream._write = (obj, encoding, next) => {
        logger.emit('log', obj)

        next()
    }

    return logger
}
