import fs from 'fs'
import YAML from 'yaml'
import envsubst from '@tuplo/envsubst'
import _ from 'lodash'
import {hostname} from 'os'
import {extname} from 'path'

interface ConfigOpts<Config> {
    filename?: string
    envPrefix?: string
    envDelimiter?: string
    defaultValues?: {[key: string]: any} // ex { 'api.port': 80 }
    finalizer?: (config: Config) => Config
    // dockerSecrets
}

export default function loadConfig<Config extends object>(opts: ConfigOpts<Config>): Config {
    let config: Config = {} as Config

    if (opts.filename) {
        switch(extname(opts.filename)) {
            case '.yml':
            case '.yaml':
                config = YAML.parse(
                    envsubst(
                        fs.readFileSync(opts.filename, 'utf8')
                    )
                )
                break
            case '.json':
                config = JSON.parse(
                    envsubst(
                        fs.readFileSync(opts.filename, 'utf8')
                    )
                )
                break
            case '.env':
                // Sorry, but I always use Docker, and it does it for me
            default:
                throw new Error('Unhandled file type')
        }
    }

    const envDelimiter = opts.envDelimiter || '_'
    const fullPrefix = opts.envPrefix ? opts.envPrefix.toLowerCase() + (opts.envPrefix.endsWith(envDelimiter) ? '' : envDelimiter) : null

    const envs = !fullPrefix ? process.env : _.pickBy(process.env, (value, key) => key.toLowerCase().startsWith(fullPrefix))

    _.each(envs, (value, key) => {
        const goodCaseKey = key.toUpperCase() === key ? key.toLowerCase() : key
        _.set(config, goodCaseKey.substr(fullPrefix ? fullPrefix.length : 0).split(envDelimiter).join('.'), value)
    })

    if (opts.defaultValues) {
        _.each(opts.defaultValues, (value, key) => {
            if (!_.has(config, key)) {
                _.set(config, key, value)
            }
        })
    }

    if (opts.finalizer) {
        config = opts.finalizer(config)
    }

    return config
}

