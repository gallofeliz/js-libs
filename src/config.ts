import fs from 'fs'
import YAML from 'yaml'
import envsubst from '@tuplo/envsubst'
import _ from 'lodash'
import {hostname} from 'os'
import {extname, resolve} from 'path'
import {Logger} from './logger'
import {SchemaObject, default as Ajv} from 'ajv'

interface ConfigOpts<UserProvidedConfig, Config> {
    mandatoryFile?: boolean
    filename?: string
    envFilename?: string
    envPrefix?: string
    envDelimiter?: string
    defaultValues?: {[key: string]: any} // ex { 'api.port': 80 }
    finalizer?: (userProvidedConfig: UserProvidedConfig) => Config
    userProvidedConfigSchema?: SchemaObject
    //logger: Logger
    // dockerSecrets
}

export default function loadConfig<UserProvidedConfig extends object, Config extends object>(opts: ConfigOpts<UserProvidedConfig, Config>): Config {
    let userProvidedConfig: UserProvidedConfig = {} as UserProvidedConfig
    let filename = opts.filename

    const envDelimiter = opts.envDelimiter || '_'
    const fullPrefix = opts.envPrefix ? opts.envPrefix.toLowerCase() + (opts.envPrefix.endsWith(envDelimiter) ? '' : envDelimiter) : null

    const envs = !fullPrefix ? process.env : _.pickBy(process.env, (value, key) => key.toLowerCase().startsWith(fullPrefix))

    const envDict = _.mapKeys(envs, (value, key) => {
        const goodCaseKey = key.toUpperCase() === key ? key.toLowerCase() : key
        return goodCaseKey.substr(fullPrefix ? fullPrefix.length : 0).split(envDelimiter).join('.')
    })

    if (opts.envFilename && envDict[opts.envFilename]) {
        filename = envDict[opts.envFilename]
    }

    // Todo : add defaultFilename

    if (filename) {
        try {
            switch(extname(filename)) {
                case '.yml':
                case '.yaml':
                    userProvidedConfig = YAML.parse(
                        envsubst(
                            fs.readFileSync(filename, 'utf8')
                        )
                    )
                    break
                case '.json':
                    userProvidedConfig = JSON.parse(
                        envsubst(
                            fs.readFileSync(filename, 'utf8')
                        )
                    )
                    break
                case '.js':
                    userProvidedConfig = require(resolve(filename))
                    break
                case '.env':
                    // Sorry, but I always use Docker, and it does it for me
                default:
                    throw new Error('Unhandled file type')
            }
        } catch (e: any) {
            if (!(e.code === 'ENOENT' && (opts.mandatoryFile === false || filename !== opts.filename))) {
                throw e
            }
        }
    }

    _.each(envDict, (value, key) => {
        _.set(userProvidedConfig, key, value)
    })

    if (opts.userProvidedConfigSchema) {
        const ajv = new Ajv({coerceTypes: true, removeAdditional: true, useDefaults: true})
        if (!ajv.validate({...opts.userProvidedConfigSchema, additionalProperties: false}, userProvidedConfig)) {
            const firstError = ajv.errors![0]
            const message2 = 'Configuration '
                + (firstError.instancePath ? firstError.instancePath.substring(1).replace('/', '.') + ' ' : '')
                + firstError.message

            throw new Error(message2)
        }
    }

    if (opts.defaultValues) {
        _.each(opts.defaultValues, (value, key) => {
            if (!_.has(userProvidedConfig, key)) {
                _.set(userProvidedConfig, key, value)
            }
        })
    }

    if (!opts.finalizer) {
        return userProvidedConfig as any as Config
    }

    return opts.finalizer(userProvidedConfig)
}

