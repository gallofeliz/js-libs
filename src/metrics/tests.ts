
let prometheusHandler: PrometheusHandler = new PrometheusHandler

const metrics = createMetrics({
    handlers: [
        new StatsDHandler,
        new StatsDHandler({tagSupport: true}),
        new InfluxDbHandler,
        prometheusHandler
    ],
    measurementPrefix: 'backuper',
    measurementSeparator: '.'
})

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
metrics.increment({
    measurement: 'my.measurement.path.with.dots'
})
console.log('----------')
console.log('PULL Prometheus')

console.log(prometheusHandler.getMetrics())