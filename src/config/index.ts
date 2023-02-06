import fs, { existsSync } from 'fs'
import YAML from 'yaml'
import { valuesIn, mapKeys, pickBy, each, set, cloneDeep } from 'lodash'
import {hostname} from 'os'
import {extname, resolve, dirname} from 'path'
import {Logger} from '../logger'
import validate, {SchemaObject} from '../validate'
import { parseFile as parseYmlFile } from '@gallofeliz/super-yaml'
import { watchFs } from '../fs-watcher'
import { compare, Operation } from 'fast-json-patch'

/**
 * Refacto to do in this module
 */
export interface ConfigOpts<UserProvidedConfig, Config> {
    userProvidedConfigSchema: SchemaObject
    defaultFilename?: string
    envFilename?: string
    envPrefix?: string
    envDelimiter?: string
    finalizer?: (userProvidedConfig: UserProvidedConfig, logger: Logger) => Config
    logger: Logger
    watchChanges?: {
        onChange: (patch: Operation[], config: Config, previousConfig: Config) => void
        abortSignal?: AbortSignal
        // onError
    }
}

function findGoodPath(userPath: string, schema: SchemaObject) {
  const correctPath = []
  let cursor = schema

  for (const pathNode of userPath.split('.')) {

    const [, key, arrI] = pathNode.match(/([^\[]+)(\[[0-9]?\])?/) || [, pathNode]

    if (cursor.type === 'object') {
      const targetK = Object.keys(cursor.properties).find(k => k.toLowerCase() === key.toLowerCase())

      if (!targetK) {
        return
      }

      if (arrI && cursor.properties[targetK].items) {
        cursor = cursor.properties[targetK].items
        correctPath.push(targetK + arrI)
      } else {
        cursor = cursor.properties[targetK]
        correctPath.push(targetK)
      }

    }
  }

  return correctPath.join('.')
}


function extractEnvConfigPathsValues({delimiter, prefix, schema}: {delimiter: string, prefix?: string, schema: SchemaObject}): Record<string, string> {
    const fullPrefix = prefix ? prefix.toLowerCase() + (prefix.endsWith(delimiter) ? '' : delimiter) : null

    const envs = (!fullPrefix ? process.env : pickBy(process.env, (value, key) => key.toLowerCase().startsWith(fullPrefix))) as Record<string, string>

    // If prefix add warn if not found good path ?

    return mapKeys(envs, (value, key) => {
        return findGoodPath(key, schema)
    })
}

export default function loadConfig<UserProvidedConfig extends object, Config extends object>(opts: ConfigOpts<UserProvidedConfig, Config>): Config {
    let userProvidedConfig: UserProvidedConfig = {} as UserProvidedConfig
    let filename = opts.defaultFilename

    if (opts.envFilename && process.env[opts.envFilename]) {
        filename = process.env[opts.envFilename]
    }

    if (filename) {
        const exists = existsSync(filename)

        if (!exists && filename !== opts.defaultFilename) {
            throw new Error('Unable to find ' + filename)
        }

        if (exists) {
            switch(extname(filename)) {
                case '.yml':
                case '.yaml':
                    userProvidedConfig = parseYmlFile(filename)
                    break
                case '.json':
                    userProvidedConfig = JSON.parse(fs.readFileSync(filename, 'utf8'))
                    break
                case '.js':
                    userProvidedConfig = require(resolve(filename))
                    break
                case '.env':
                    // Sorry, but I always use Docker, and it does it for me
                default:
                    throw new Error('Unhandled file type')
            }
        }
    }

    const userEnvProvidedConfig = extractEnvConfigPathsValues({
        delimiter: opts.envDelimiter || '_',
        prefix: opts.envPrefix,
        schema: opts.userProvidedConfigSchema
    })

    each(userEnvProvidedConfig, (value, key) => {
        set(userProvidedConfig, key, value)
    })

    userProvidedConfig = validate(userProvidedConfig, {
        schema: {...opts.userProvidedConfigSchema, additionalProperties: false},
        removeAdditional: true,
        contextErrorMsg: 'Configuration'
    })

    if (!opts.finalizer) {
        return userProvidedConfig as any as Config
    }

    let config = opts.finalizer(userProvidedConfig, opts.logger)

    if (opts.watchChanges && filename) {
        // Here the problem is that included filename are not watched

        watchFs({
            logger: opts.logger,
            paths: [filename],
            abortSignal: opts.watchChanges.abortSignal,
            fn() {
                const newConfig = loadConfig(opts)
                const patch = compare(config, newConfig, false)

                if (patch.length === 0) {
                    return
                }

                const oldConfig = config
                config = newConfig

                opts.watchChanges!.onChange(patch, config, oldConfig)
            }
        })
    }

    return config
}
