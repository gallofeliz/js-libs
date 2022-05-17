import loadConfig from '../src/config'

export interface Config {
    machin: {
        truc: {
            bidule: boolean
        }
    }
    envShell?: string
}

console.log(loadConfig<Config, Config>({
    filename: __dirname + '/config.yml',
    envFilename: 'config',
    envPrefix: 'app',
    defaultValues: { 'machin2.port': 443 },
    userProvidedConfigSchema: require('./config.schema.json')
}))
