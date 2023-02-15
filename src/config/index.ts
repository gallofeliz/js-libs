import fs, { existsSync } from 'fs'
import { valuesIn, mapKeys, pickBy, each, set, cloneDeep, get } from 'lodash'
import {hostname} from 'os'
import {extname, resolve, dirname} from 'path'
import {UniversalLogger} from '@gallofeliz/logger'
import {validate, SchemaObject} from '@gallofeliz/validate'
import { parseFile as parseYmlFile } from '@gallofeliz/super-yaml'
import { watchFs } from '@gallofeliz/fs-watcher'
import { compare, Operation } from 'fast-json-patch'
import chokidar from 'chokidar'
import { EventEmitter } from 'events'

export type ChangePatchOperation = Operation

export interface WatchChangesEventEmitter<Config> extends EventEmitter {
    on(event: 'change', listener: (arg: {patch: ChangePatchOperation[], config: Config, previousConfig: Config}) => void): this
    on(event: string, listener: (arg: {value: unknown, previousValue: unknown, config: Config, previousConfig: Config}) => void): this
}

/**
 * Refacto to do in this module
 */
export interface ConfigOpts<UserProvidedConfig, Config> {
    userProvidedConfigSchema: SchemaObject
    defaultFilename?: string
    envFilename?: string
    envPrefix?: string
    envDelimiter?: string
    finalizer?: (userProvidedConfig: UserProvidedConfig, logger: UniversalLogger) => Config
    logger: UniversalLogger
    watchChanges?: {
        onError?: (e: Error) => void
        abortSignal?: AbortSignal
    } & (
        ({
            onChange: ({patch, config, previousConfig}: {patch: ChangePatchOperation[], config: Config, previousConfig: Config}) => void
            eventEmitter?: WatchChangesEventEmitter<Config>
        })
        | ({
            onChange?: ({patch, config, previousConfig}: {patch: ChangePatchOperation[], config: Config, previousConfig: Config}) => void
            eventEmitter: WatchChangesEventEmitter<Config>
        })
    )
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

    const envs = (!fullPrefix ? process.env : mapKeys(pickBy(process.env, (value, key) => key.toLowerCase().startsWith(fullPrefix)), (v, k) => k?.substring(fullPrefix.length))) as Record<string, string>
    // If prefix add warn if not found good path ?
    return mapKeys(envs, (value, key) => {
        return findGoodPath(key, schema)
    })
}

export async function loadConfig<UserProvidedConfig extends object, Config extends object>(opts: ConfigOpts<UserProvidedConfig, Config>): Promise<Config> {
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
                    userProvidedConfig = await parseYmlFile(filename)
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

    let userProvidedConfigSchema = opts.userProvidedConfigSchema

    if (userProvidedConfigSchema.$ref) {
        const ref = userProvidedConfigSchema.$ref.replace('#/definitions/', '')
        userProvidedConfigSchema = userProvidedConfigSchema.definitions[ref]
    }

    const userEnvProvidedConfig = extractEnvConfigPathsValues({
        delimiter: opts.envDelimiter || '_',
        prefix: opts.envPrefix,
        schema: userProvidedConfigSchema
    })

    each(userEnvProvidedConfig, (value, key) => {
        set(userProvidedConfig, key, value)
    })

    userProvidedConfig = validate(userProvidedConfig, {
        schema: {...userProvidedConfigSchema, additionalProperties: false},
        removeAdditional: true,
        contextErrorMsg: 'Configuration'
    })

    let config = opts.finalizer ? opts.finalizer(userProvidedConfig, opts.logger) : userProvidedConfig as any as Config

    if (opts.watchChanges && filename) {
        // Here the problem is that included filename are not watched

        const watcher = chokidar.watch(filename)
        .on('all', async () => {
            let newConfig

            try {
                newConfig = await loadConfig({...opts, watchChanges: undefined})
            } catch (error) {
                if (opts.watchChanges!.onError) {
                    opts.watchChanges!.onError(error as Error)
                } else {
                    opts.logger.warning('Config Watch reload error', {error})
                }
                return
            }
            const patch = compare(config, newConfig, false).map(op => {
                return {
                    ...op,
                    path: op.path
                        .replace(/^\//, '')
                        .replace(/\//g, '.')
                        //.replace(/\.([0-9]+)(\.|$)/g, '[$1]$2')
                }
            })

            if (patch.length === 0) {
                return
            }

            const previousConfig = config
            config = newConfig

            const changeArg = {
                patch,
                config,
                previousConfig
            }

            if (opts.watchChanges!.onChange) {
                opts.watchChanges!.onChange(changeArg)
            }

            if (opts.watchChanges!.eventEmitter) {
                opts.watchChanges!.eventEmitter?.emit('change', changeArg)
                patch.forEach(op => {
                    op.path.split('.').reduce((rootToLeafNodes: string[], node) => {
                        rootToLeafNodes = rootToLeafNodes.concat(node)
                        opts.watchChanges!.eventEmitter?.emit('change:' + rootToLeafNodes.join('.') as 'change:xxx', {
                            config,
                            previousConfig,
                            value: get(config, rootToLeafNodes),
                            previousValue: get(previousConfig, rootToLeafNodes),
                        })
                        return rootToLeafNodes
                    }, [])

                })
            }
        })
        .on('error', (error) => {
            if (opts.watchChanges!.onError) {
                opts.watchChanges!.onError(error as Error)
            // } else if (opts.watchChanges!.eventEmitter) {
            //     // Only emit error on eventEmitter if onError is not present to separate responsabilities
            //     opts.watchChanges!.eventEmitter.emit('error', error)
            } else {
                opts.logger.warning('Watch error', {error})
            }
        })

        opts.watchChanges.abortSignal?.addEventListener('abort', () => {
            watcher.close()
        })
    }

    return config
}
