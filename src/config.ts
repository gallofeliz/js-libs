import fs from 'fs'
import YAML from 'yaml'
import envsubst from '@tuplo/envsubst'
import _, { valuesIn } from 'lodash'
import {hostname} from 'os'
import {extname, resolve, dirname} from 'path'
import {Logger} from './logger'
import validate, {SchemaObject} from './validate'

interface ConfigOpts<UserProvidedConfig, Config> {
    mandatoryFile?: boolean
    filename?: string
    envFilename?: string
    envPrefix?: string
    envDelimiter?: string
    defaultValues?: {[key: string]: any} // ex { 'api.port': 80 }
    finalizer?: (userProvidedConfig: UserProvidedConfig) => Config
    userProvidedConfigSchema?: SchemaObject
    envsubst?: boolean
    //logger: Logger
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

    function doEnvsubst(input: string) {
        return opts.envsubst === false ? input : envsubst(input)
    }

    if (filename) {
        try {
            switch(extname(filename)) {
                case '.yml':
                case '.yaml':
                    const ymlCwd = dirname(filename)

                        function convertType(rawValue: any, type: 'auto' | 'string' | 'number' = 'auto') {
                            if (type === 'auto') {
                                if (!isNaN(rawValue)) {
                                    type = 'number'
                                } else {
                                    type = 'string'
                                }
                            }

                            switch(type) {
                                case 'string':
                                    return rawValue
                                case 'number':
                                    return parseFloat(rawValue)
                                default:
                                    throw new Error('Unexpected type')
                            }
                        }

                        function env({name, default: defaut, type}: {name: string, default?: any, type?: 'auto' | 'string' | 'number' }) {
                            return convertType(process.env[name] || defaut, type)
                        }

                        function include({filename, type}: {filename: string, type?: 'auto' | 'string' | 'number'}) {
                            return convertType(
                                fs.readFileSync(
                                    resolve(ymlCwd, filename),
                                    'utf8'
                                ),
                                type
                            )
                        }

                        const customTags: YAML.Tags = [
                            {
                              tag: '!include',
                              collection: 'map',
                              resolve(value) {
                                return include(value.toJSON())
                              }
                            },
                            {
                              tag: '!include',
                              resolve(value: string) {
                                return include({filename: value})
                              }
                            },
                            {
                              tag: '!env',
                              collection: 'map',
                              resolve(value) {
                                return env(value.toJSON())
                              }
                            },
                            {
                              tag: '!env',
                              resolve(value: string) {
                                return env({name: value})
                              }
                            },
                        ]



                        const doc = YAML.parseDocument(
                            doEnvsubst(fs.readFileSync(filename, 'utf8')),
                            { customTags }
                        )

                        const warnOrErrors = doc.errors.concat(doc.warnings)

                        if (warnOrErrors.length) {
                            throw warnOrErrors[0]
                        }

                        userProvidedConfig = doc.toJS()
                    break
                case '.json':
                    userProvidedConfig = JSON.parse(
                        doEnvsubst(
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
        userProvidedConfig = validate(userProvidedConfig, {
            schema: {...opts.userProvidedConfigSchema, additionalProperties: false},
            removeAdditional: true,
            contextErrorMsg: 'Configuration'
        })
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

