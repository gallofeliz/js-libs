import fs, { existsSync } from 'fs'
import { mapKeys, pickBy, each, set, get, omit } from 'lodash'
import { extname, resolve } from 'path'
import { Logger } from '@gallofeliz/logger'
import { validate, SchemaObject } from '@gallofeliz/validate'
import { parseFile as parseYmlFile } from '@gallofeliz/super-yaml'
import { compare, Operation } from 'fast-json-patch'
import chokidar from 'chokidar'
import { EventEmitter } from 'events'

export type ChangePatchOperation = Operation

export interface WatchChangesEventEmitter<Config> extends EventEmitter {
    on(event: 'change', listener: (arg: {patch: ChangePatchOperation[], config: Config, previousConfig: Config}) => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: string, listener: (arg: {value: unknown, previousValue: unknown, config: Config, previousConfig: Config}) => void): this
}

/**
 * Refacto to do in this module
 */
export interface ConfigOpts<Config> {
    schema: SchemaObject
    defaultFilename?: string
    envFilename?: string
    envPrefix?: string
    envDelimiter?: string
    logger?: Pick<Logger, 'warning'>
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

function unrefSchema(schema: Object) {
    const traverse = require('traverse')

    function resolveRef(o: any): any {
        if (!(o instanceof Object && o.$ref)) {
            return o
        }
        const $ref = o.$ref
        if ($ref.substring(0, 1) !== '#') {
            throw new Error('Unexpected external resource')
        }
        const path = $ref.substring(2).replace(/\//g, '.')
        return {
            ...omit(o, '$ref'),
            ...resolveRef(get(schema, path))
        }
    }

    const resolved = traverse(schema).map(resolveRef)
    delete resolved.definitions

    return resolved
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
    schema = unrefSchema(schema)
    const envs = (!fullPrefix ? process.env : mapKeys(pickBy(process.env, (value, key) => key.toLowerCase().startsWith(fullPrefix)), (v, k) => k?.substring(fullPrefix.length))) as Record<string, string>
    // If prefix add warn if not found good path ?

    return mapKeys(envs, (value, key) => {
        return findGoodPath(key.split(delimiter).join('.'), schema)
    })
}

export async function loadConfig<Config extends object>(opts: ConfigOpts<Config>): Promise<Config> {
    let configInProgress: Partial<Config> = {}
    let filename = opts.defaultFilename
    const readFilenames: string[] = []

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
                    configInProgress = await parseYmlFile(filename, { onFileRead: (f) => readFilenames.push(f) })
                    break
                case '.json':
                    configInProgress = JSON.parse(fs.readFileSync(filename, 'utf8'))
                    break
                case '.js':
                    configInProgress = require(resolve(filename))
                    break
                case '.env':
                    // Sorry, but I always use Docker, and it does it for me
                default:
                    throw new Error('Unhandled file type')
            }
        }
    }

    let configSchema = opts.schema

    const userEnvProvidedConfig = extractEnvConfigPathsValues({
        delimiter: opts.envDelimiter || '_',
        prefix: opts.envPrefix,
        schema: configSchema
    })

    each(userEnvProvidedConfig, (value, key) => {
        set(configInProgress, key, value)
    })

    let config: Config = validate(configInProgress, {
        schema: {...configSchema, additionalProperties: false},
        removeAdditional: true,
        contextErrorMsg: 'Configuration'
    }) as Config

    if (opts.watchChanges && filename) {

        const handleError = (error: Error, context: string) =>  {
            if (opts.watchChanges!.onError || opts.watchChanges!.eventEmitter?.listenerCount('error')) {
                if (opts.watchChanges!.onError) {
                    opts.watchChanges!.onError(error)
                }
                if (opts.watchChanges!.eventEmitter?.listenerCount('error')) {
                    opts.watchChanges!.eventEmitter.emit('error', error)
                }
            } else if (opts.logger) {
                opts.logger.warning('Config ' + context + ' error', {error})
            } else {
                throw error
            }
        }

        const watcher = chokidar.watch(readFilenames.length > 0 ? readFilenames : filename)
        .on('all', async () => {
            let newConfig: Config

            try {
                newConfig = await loadConfig({...opts, watchChanges: undefined})
            } catch (error) {
                handleError(error as Error, 'watch reload')
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
                const hasGlobalChangeListener = opts.watchChanges!.eventEmitter!.emit('change', changeArg)
                patch.forEach(op => {
                    let pathHasListener = false
                    op.path.split('.').reduce((rootToLeafNodes: string[], node) => {
                        rootToLeafNodes = rootToLeafNodes.concat(node)
                        const nodeHasListener = opts.watchChanges!.eventEmitter!.emit('change:' + rootToLeafNodes.join('.') as 'change:xxx', {
                            config,
                            previousConfig,
                            value: get(config, rootToLeafNodes),
                            previousValue: get(previousConfig, rootToLeafNodes),
                        })

                        if (nodeHasListener) {
                            pathHasListener = true
                        }

                        return rootToLeafNodes
                    }, [])

                    if (!pathHasListener && !hasGlobalChangeListener) {
                        handleError(new Error('Unhandled config watch change for ' + op.path), 'watchChanges')
                    }

                })
            }
        })
        .on('error', (error) => handleError(error as Error, 'watch'))

        opts.watchChanges.abortSignal?.addEventListener('abort', () => {
            watcher.close().catch(error => handleError(error as Error, 'watch close'))
        })
    }

    return config
}
