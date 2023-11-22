

import {clone} from 'lodash'
var logfmt = require('logfmt');
import dayjs from 'dayjs'
var customParseFormat = require('dayjs/plugin/customParseFormat')

dayjs.extend(customParseFormat)

const logLogfmt = 'lvl=wrn ts=2023-11-13T23:14:42.50547654Z caller=retry.go:73 org_id=fake traceID=6f23f0eb8bd39358 msg="error processing request" try=0 query="count_over_time({compose_project=\"test\"} | json | keep status=~\"done|failed\" | status!=\"\"[5m])" err="context canceled"'
const logNginx = '192.168.1.28 - - [17/Nov/2023:19:42:18 +0000] "POST /recepcion_datos_4.cgi HTTP/1.1" 200 44 "-" "got (https://github.com/sindresorhus/got)" "-"'
const logJson1 = '{"id":"test","level":"info","message":"Oh yeah !","sessionId":"10095497-e8d6-45dc-b236-727ff8554b00","status":"done","timestamp":"2023-11-17T19:40:34.700Z"}'
const logJson2 = '{"id":"test","lvl":"err","msg":"Oh noooo !","sessionId":"10095497-e8d6-45dc-b236-727ff8554b00","status":"fail","timestamp":"2023-11-17T19:40:34.700Z"}'

class JsonLogParser {
    public parse(log: string) {
        return JSON.parse(log)
    }
}

class RegexLogParser {
    protected parseRegex: RegExp
    public constructor(parse: RegExp) {
        this.parseRegex = parse
    }
    public parse(log: string) {
        return {...log.match(this.parseRegex)?.groups}
    }
}

class LogfmtLogParser {
    public parse(log: string) {
        return logfmt.parse(log)
    }
}

interface LogMapping {
    [key: string]: {
        pickFrom?: string
        mapValues?: Record<string, any>
        defaultValue?: any
        fromDateFormat?: string
    }
}

class LogMapper {
    protected opts: LogMapping
    public constructor(opts: LogMapping) {
        this.opts = opts
    }

    public map(parsedLog: object) {
        const mappedLog: any = clone(parsedLog)

        Object.keys(this.opts).forEach(key => {
            const mapping = this.opts[key]

            let value

            if (mapping.pickFrom) {
                value = mappedLog[mapping.pickFrom]
                delete mappedLog[mapping.pickFrom]
            } else {
                value = mappedLog[key]
            }

            if (value !== undefined && mapping.fromDateFormat) {
                value = dayjs(value, mapping.fromDateFormat).toJSON()
            }

            if (value !== undefined && mapping.mapValues && mapping.mapValues[value]) {
                value = mapping.mapValues[value]
            }

            if (value === undefined) {
                value = mapping.defaultValue
            }


            mappedLog[key] = value

        })

        return mappedLog as object
    }
}

const parser = new JsonLogParser
const mapper = new LogMapper({
    level: {
        pickFrom: 'lvl',
        mapValues: {
            inf: 'info',
            err: 'error'
        }
    },
    message: {
        pickFrom: 'msg'
    }
})

console.log(parser.parse(logJson1))

console.log(mapper.map(parser.parse(logJson2)))

const parser2 = new RegexLogParser(/^(?<ip>[^ ]+) - - \[(?<timestamp>[^\]]+)\] (?<message>.*)$/)
const mapper2 = new LogMapper({
    level: {
        defaultValue: 'info'
    },
    timestamp: {
        fromDateFormat: 'DD/MMM/YYYY:hh:mm:ss ZZ'
    }
})

console.log(mapper2.map(parser2.parse(logNginx)))

const parser3 = new LogfmtLogParser

const mapper3 = new LogMapper({
    level: {
        pickFrom: 'lvl',
        mapValues: {
            inf: 'info',
            err: 'error',
            wrn: 'warning'
        }
    },
    message: {
        pickFrom: 'msg'
    },
    timestamp: {
        pickFrom: 'ts'
    }
})

console.log(mapper3.map(parser3.parse(logLogfmt)))