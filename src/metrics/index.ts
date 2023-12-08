type Tags = Record<string, string>
type Measurement = string[] | string

interface MetricsHandler {
    increment(value: number, measurement: string[], tags: Tags): Promise<void>
}

interface MetricsOpts {
    handlers: MetricsHandler[]
    measurementPrefix?: Measurement
    measurementSeparator?: string
    tags?: Tags
}

function resolveMeasurement(measurement: Measurement, separator: string) {
    return Array.isArray(measurement) ? measurement.map(m => m.replaceAll(separator, '')).join(separator) : measurement.replaceAll(separator, '')
}

export class Metrics {
    protected handlers: MetricsHandler[]
    protected measurementPrefix: Measurement
    protected tags: Tags
    protected measurementSeparator?: string

    public constructor(opts: MetricsOpts) {
        this.measurementSeparator = opts.measurementSeparator
        this.handlers = opts.handlers
        this.measurementPrefix = opts.measurementPrefix
            ? Array.isArray(opts.measurementPrefix) ? opts.measurementPrefix : [opts.measurementPrefix]
            : []
        this.tags = opts.tags || {}

        if (this.measurementSeparator && typeof opts.measurementPrefix === 'string') {
            this.measurementPrefix = opts.measurementPrefix.split(this.measurementSeparator)
        }
    }

    public increment(measurement: string | string[], value?: number, tags?: Tags): Promise<void>
    public increment(value: number, tags?: Tags): Promise<void>
    public increment(tags?: Tags): Promise<void>
    //public increment(args?: {value?: number, measurement?: Measurement, tags?: Tags}): Promise<void>

    public async increment(...args: any[]) {
        let measurement: string | string[] = []
        let value: number = 1
        let tags: Tags = {}

        if (args.length === 0) {
        } else if (typeof args[0] === 'object' && !Array.isArray(args[0])) {
            tags = args[0]
        } else if (typeof args[0] === 'number') {
            value = args[0]
            if (args[1]) {
                tags = args[1]
            }
        } else {
            measurement = args[0]
            if (args[1] !== undefined) {
                value = args[1]
            }
            if (args[2]) {
                tags = args[2]
            }
        }

        if (measurement) {
            if (typeof measurement === 'string' && this.measurementSeparator) {
                measurement = measurement.split(this.measurementSeparator)
            }
            measurement = [...this.measurementPrefix, ...Array.isArray(measurement) ? measurement : [measurement]]
        } else {
            measurement = this.measurementPrefix
        }
        tags = {...this.tags, ...tags}

        await Promise.all(this.handlers.map(handler => handler.increment(value, measurement as string[], tags as Tags)))
    }

    public child(subMeasurementPrefix: Measurement, tags?: Tags) {
        if (typeof subMeasurementPrefix === 'string' && this.measurementSeparator) {
            subMeasurementPrefix = subMeasurementPrefix.split(this.measurementSeparator)
        }

        return new Metrics({
            handlers: this.handlers,
            measurementPrefix: [
                ...this.measurementPrefix,
                ...Array.isArray(subMeasurementPrefix) ? subMeasurementPrefix : [subMeasurementPrefix]
            ],
            tags: {...this.tags, ...tags},
            measurementSeparator: this.measurementSeparator
        })
    }
}

export class StatsDHandler implements MetricsHandler {
    protected tagSupport: boolean

    public constructor(opts: {tagSupport?: boolean} = {}) {
        this.tagSupport = !!opts.tagSupport
    }

    public async increment(value: number, measurement: Measurement, tags?: Tags) {
        measurement = resolveMeasurement(measurement, '.').replace(/:/g, '')

        if (this.tagSupport && tags && Object.values(tags).length > 0) {
            console.log('PUSH to statsd', measurement + ':'+value+'|c' + '|#' + Object.keys(tags).map(tag => [tag, tags[tag]].join(':')).join(','))
        } else {
            console.log('PUSH to statsd', measurement + '.' + Object.values(tags || {}).map(v => v.replace(/\./g, '')).join('.') + ':'+value+'|c')
        }

    }
}

export class InfluxDbHandler implements MetricsHandler {
    public async increment(value: number, measurement: Measurement, tags?: Tags) {
        console.log('PUSH to influx', {
            measurement: resolveMeasurement(measurement, '_'),
            tags,
            fields: { count: value }
        })
    }
}

interface PrometheusRegistry {
    counters: {
        [measurementWithTags: string]: number
    }
}

export class PrometheusHandler implements MetricsHandler {
    protected registry: PrometheusRegistry = {
        counters: {}
    }

    public async increment(value: number, measurement: Measurement, tags?: Tags) {
        const measurementWithTags = resolveMeasurement(measurement, '_') + (JSON.stringify(tags) || '')

        if (!this.registry.counters[measurementWithTags]) {
            this.registry.counters[measurementWithTags] = 0
        }
        this.registry.counters[measurementWithTags]+=value
    }

    public getMetrics() {
        return Object.keys(this.registry.counters).map(measurementWithTags => {
            return '# TYPE ' + measurementWithTags.split('{')[0] + ' counter'
                + '\n'
                + measurementWithTags  + ' ' + this.registry.counters[measurementWithTags]
        }).join('\n\n')
    }
}

export function createMetrics(opts: MetricsOpts) {
    return new Metrics(opts)
}
