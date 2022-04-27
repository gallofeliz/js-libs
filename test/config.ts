import loadConfig from '../src/config'

console.log(loadConfig({
    filename: __dirname + '/config.yml',
    envPrefix: 'app',
    defaultValues: { 'machin2.port': 443 },
    schema: require('./config.schema.json')
}))
