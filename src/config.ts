import fs, { existsSync } from 'fs'
import YAML from 'yaml'
import _, { valuesIn } from 'lodash'
import {hostname} from 'os'
import {extname, resolve, dirname} from 'path'
import {Logger} from './logger'
import validate, {SchemaObject} from './validate'
import { parseFile as parseYmlFile } from './super-yaml'

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
    watchChanges?: boolean
}

export default function loadConfig<UserProvidedConfig extends object, Config extends object>(opts: ConfigOpts<UserProvidedConfig, Config>): Config {
    if (opts.watchChanges) {
        throw new Error('Not implemented yet')
    }

    let userProvidedConfig: UserProvidedConfig = {} as UserProvidedConfig
    let filename = opts.defaultFilename

    if (opts.envFilename && process.env[opts.envFilename]) {
        filename = process.env[opts.envFilename]
    }

    const envDelimiter = opts.envDelimiter || '_'
    const fullPrefix = opts.envPrefix ? opts.envPrefix.toLowerCase() + (opts.envPrefix.endsWith(envDelimiter) ? '' : envDelimiter) : null

    const envs = !fullPrefix ? process.env : _.pickBy(process.env, (value, key) => key.toLowerCase().startsWith(fullPrefix))

    const envDict = _.mapKeys(envs, (value, key) => {
        const goodCaseKey = key.toUpperCase() === key ? key.toLowerCase() : key
        return goodCaseKey.substr(fullPrefix ? fullPrefix.length : 0).split(envDelimiter).join('.')
    })

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

    _.each(envDict, (value, key) => {
        _.set(userProvidedConfig, key, value)
    })

    userProvidedConfig = validate(userProvidedConfig, {
        schema: {...opts.userProvidedConfigSchema, additionalProperties: false},
        removeAdditional: true,
        contextErrorMsg: 'Configuration'
    })

    if (!opts.finalizer) {
        return userProvidedConfig as any as Config
    }

    return opts.finalizer(userProvidedConfig, opts.logger)
}

/*

import { Observable, Change,  } from 'object-observer'
import { readFile, writeFile } from 'fs/promises'
import { watch } from 'fs'
import { EventEmitter } from 'events'

interface Obj extends Object {}
type ObservableObject<Obj> = EventEmitter&Obj

/**
 *
 * Should be good to have observable deep object like myobject.user.on('change') for myboject.user = { firstname, lastname } for example
 * A config live update
 *
 *
 * Use https://github.com/sindresorhus/on-change if validation needed (for config ?)
 *


export function createObservableObject<O extends Obj>(obj: Obj = {}): ObservableObject<O> {
    const original = new EventEmitter

    Object.assign(original, obj)

    const observable = Observable.from(original, { async: true })

    const ignoreProperties = ['_eventsCount', '_events', '_maxListeners', ...Object.keys(EventEmitter.prototype)]

    Object.defineProperties(observable, ignoreProperties.reduce((properties, property) => ({...properties, [property]: {enumerable: false}}), {}))

    Observable.observe(observable, changes => {
        const filteredChanges = changes.filter((change: any) => !ignoreProperties.includes(change.path[0]))
        if (filteredChanges.length === 0) {
            return
        }
        (observable as EventEmitter).emit('change', filteredChanges)
    })

    return observable as ObservableObject<O>
}

export async function configureFileAutoSaveObservableObject<OO extends ObservableObject<Obj>>(obsObject: OO, filename: string): Promise<OO> {

    async function saveFileContent() {
        // Use of https://github.com/npm/write-file-atomic to reduce watches call ?
        await writeFile(filename, JSON.stringify(obsObject, undefined, 4), { encoding: 'utf8' })
    }

    obsObject.on('change', (changes) => {
        saveFileContent()
    })

    await saveFileContent()

    return obsObject
}

export async function configureFileAutoLoadObservableObject<OO extends ObservableObject<Obj>>(obsObject: OO, filename: string, watchChanges?: boolean, abortSignal?: AbortSignal): Promise<OO> {

    async function getFileContent(maybeWriting = false) {
        try {
            const content = await readFile(filename, { encoding: 'utf8' })
            if (!content && maybeWriting) {
                return
            }
            return JSON.parse(content)
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                return
            }
            if (e.name === 'SyntaxError' && maybeWriting) {
                return
            }
            throw e
        }
    }

    const fileContent = await getFileContent()

    if (fileContent) {
        Object.assign(obsObject, fileContent)
    }

    if (watchChanges) {
        if (!fileContent) {
            await writeFile(filename, '{}')
        }
        watch(filename, { signal: abortSignal }, async (a, b) => {
            const fileContent = await getFileContent(true)

            if (!fileContent || JSON.stringify(obsObject) === JSON.stringify(fileContent)) {
                return
            }

            Object.assign(obsObject, fileContent)
        })
    }

    return obsObject
}

export async function createFilePersistantObservableObject<O extends Obj>(obj: O, filename: string, watchChanges?: boolean, abortSignal?: AbortSignal): Promise<ObservableObject<O>> {
    return await configureFileAutoSaveObservableObject(
        await configureFileAutoLoadObservableObject(
            createObservableObject(obj || {}),
            filename,
            watchChanges,
            abortSignal
        ),
        filename
    )
}

*/