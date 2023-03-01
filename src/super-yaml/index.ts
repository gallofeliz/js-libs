import fs from 'fs'
import YAML from 'yaml'
import {resolve, dirname} from 'path'
import jsonata from 'jsonata'
import traverse from 'traverse'

export async function parseContent<T>(content: string, ymlCwd: string): Promise<T> {

    function convertType(rawValue: any, filename?: string, type: 'auto' | 'string' | 'number' | 'yaml' | 'json' = 'auto') {
        if (type === 'auto') {
            if (filename && filename.match(/\.ya?ml$/)) {
                type = 'yaml'
            } else if (filename && filename.match(/\.json$/)) {
                type = 'json'
            } else if (!isNaN(rawValue)) {
                type = 'number'
            } else {
                type = 'string'
            }
        }

        switch(type) {
            case 'yaml':
                return parseContent(rawValue, dirname(filename as string))
            case 'json':
                return JSON.parse(rawValue)
            case 'string':
                return rawValue
            case 'number':
                return parseFloat(rawValue)
            default:
                throw new Error('Unexpected type')
        }
    }

    function env({name, default: defaut, type}: {name: string, default?: any, type?: 'auto' | 'string' | 'number' }) {
        return convertType(process.env[name] || defaut, undefined, type)
    }

    function include({filename, type, query}: {filename: string, type?: 'auto' | 'string' | 'number', query?: string}) {
        const value = convertType(
            fs.readFileSync(
                resolve(ymlCwd, filename),
                'utf8'
            ),
            filename,
            type
        )

        if (query) {
            return value instanceof Promise
                ? value.then((value: any) => jsonata(query).evaluate(value)).then((v: any) => {
                    // https://github.com/jsonata-js/jsonata/issues/296#issuecomment-583528415
                    if (Array.isArray(v)) {
                        return [...v]
                    }
                    return v
                })
                : jsonata(query).evaluate(value)
        }
        return value
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
        content,
        { customTags }
    )

    const warnOrErrors = doc.errors.concat(doc.warnings)

    if (warnOrErrors.length) {
        throw warnOrErrors[0]
    }

    const result = doc.toJS()

    const promises: Promise<any>[] = []

    traverse(result).forEach(function (o) {
        if (o instanceof Promise) {
            promises.push(o)
            o.then((v: any) => this.update(v))
        }
    })

    await Promise.all(promises)

    return result
}

export async function parseFile<T>(filename: string): Promise<T> {
    return parseContent<T>(fs.readFileSync(filename, 'utf8'), dirname(filename))
}