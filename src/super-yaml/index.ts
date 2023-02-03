import fs from 'fs'
import YAML from 'yaml'
import {extname, resolve, dirname} from 'path'

export function parseContent<T>(content: string, ymlCwd: string): T {

    function convertType(rawValue: any, filename?: string, type: 'auto' | 'string' | 'number' | 'yaml' | 'json' = 'auto') {
        if (type === 'auto') {
            if (filename && filename.match(/\.ya?ml$/)) {
                type = 'yaml'
            } else if (filename && filename.match(/\.json/$)) {
                type = 'json'
            } else if (!isNaN(rawValue)) {
                type = 'number'
            } else {
                type = 'string'
            }
        }

        switch(type) {
            case 'yaml':
                throw new Error('Not implemented yet')
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

    function include({filename, type}: {filename: string, type?: 'auto' | 'string' | 'number'}) {
        return convertType(
            fs.readFileSync(
                resolve(ymlCwd, filename),
                'utf8'
            ),
            filename,
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
        content,
        { customTags }
    )

    const warnOrErrors = doc.errors.concat(doc.warnings)

    if (warnOrErrors.length) {
        throw warnOrErrors[0]
    }

    return doc.toJS()
}

export function parseFile<T>(filename: string): T {
    return parseContent<T>(fs.readFileSync(filename, 'utf8'), dirname(filename))
}