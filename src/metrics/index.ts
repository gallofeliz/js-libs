type Tags = Record<string, string>
type Measurement = string[] | string

interface MetricsHandler {
    increment(value: number, measurement: Measurement, tags?: Tags): Promise<void>
}

interface MetricsOpts {
    handlers: MetricsHandler[]
    measurementPrefix?: Measurement
    tags?: Tags
}

function resolveMeasurement(measurement: Measurement, separator: string) {
    return Array.isArray(measurement) ? measurement.map(m => m.replaceAll(separator, '')).join(separator) : measurement.replaceAll(separator, '')
}

class Metrics {
    protected handlers: MetricsHandler[]
    protected measurementPrefix: Measurement
    protected tags: Tags

    public constructor(opts: MetricsOpts) {
        this.handlers = opts.handlers
        this.measurementPrefix = opts.measurementPrefix
            ? Array.isArray(opts.measurementPrefix) ? opts.measurementPrefix : [opts.measurementPrefix]
            : []
        this.tags = opts.tags || {}
    }

    public async increment({value = 1, measurement, tags}: {value?: number, measurement?: Measurement, tags?: Tags} = {}) {
        if (measurement) {
            measurement = [...this.measurementPrefix, ...Array.isArray(measurement) ? measurement : [measurement]]
        } else {
            measurement = this.measurementPrefix
        }
        tags = {...this.tags, ...tags}

        await Promise.all(this.handlers.map(handler => handler.increment(value, measurement as Measurement, tags)))
    }

    public child(subMeasurementPrefix: Measurement, tags?: Tags) {
        return new Metrics({
            handlers: this.handlers,
            measurementPrefix: [
                ...this.measurementPrefix,
                ...Array.isArray(subMeasurementPrefix) ? subMeasurementPrefix : [subMeasurementPrefix]
            ],
            tags: {...this.tags, ...tags}
        })
    }
}

class StatsDHandler implements MetricsHandler {
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

class InfluxDbHandler implements MetricsHandler {
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

class PrometheusHandler implements MetricsHandler {
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

let prometheusHandler: PrometheusHandler = new PrometheusHandler

export function createMetrics() {
    return new Metrics({
        handlers: [
            new StatsDHandler,
            new StatsDHandler({tagSupport: true}),
            new InfluxDbHandler,
            prometheusHandler
        ],
        measurementPrefix: 'backuper'
    })
}

const metrics = createMetrics()

metrics.increment({
    measurement: ['backups', 'before'],
    tags: {name: 'home', status: 'start'}
})
console.log('----------')
metrics.increment({
    measurement: 'backups',
    tags: {name: 'home', status: 'success'}
})
console.log('----------')
const httpMetrics = metrics.child('http')

httpMetrics.increment({
    measurement: 'incomingreq',
    value: 2
})
console.log('----------')
httpMetrics.increment({
    measurement: 'accesslog',
    tags: { statusCode: '200', path: '/my/home/index.php' }
})

const forgetMetrics = metrics.child(['operations', 'forget'], { repository: 'home', policy: 'home-policy' })
console.log('----------')
forgetMetrics.increment({
    tags: { status: 'success' }
})
console.log('----------')
console.log('PULL Prometheus')

console.log(prometheusHandler.getMetrics())