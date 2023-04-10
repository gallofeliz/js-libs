import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscationRule<T = any> = (args: {
    data: T,
    key: string | undefined,
    replacement: string,
    path: string | undefined
}) => T | string

export interface ObfuscatorOpts {
    rules?: ObfuscationRule[]
    replaceDefaultRules?: boolean
    replacement?: string
    handleErrors?: boolean
}

function createDefaultRules() {
    return [
        rulesBuilder.matchsUriCredentials(),
        rulesBuilder.keyMatchsSecret()
    ]
}

export class Obfuscator {
    protected rules: ObfuscationRule[]
    protected replacement: string
    protected handleErrors: boolean

    constructor(opts: ObfuscatorOpts = {}) {
        this.rules = (opts.rules || []).concat(opts.replaceDefaultRules ? [] : createDefaultRules())
        this.replacement = opts.replacement || '***'
        this.handleErrors = opts.handleErrors === undefined ? true : opts.handleErrors
    }

    public obfuscate<T>(data: T): T extends Object ? T : T | string  {
        if (this.rules.length === 0) {
            return data as any
        }
        const self = this

        return traverse(cloneDeep(data)).forEach(function (data: any) {
            if (data instanceof Error && self.handleErrors) {
                const newRawData = self.obfuscate({
                    ...data,
                    message: data.message,
                    stack: data.stack
                })

                const newData = Object.create(data)

                Object.assign(newData, newRawData)

                return newData
            }

            for (const rule of self.rules) {
                data = rule({
                    data,
                    key: this.key,
                    replacement: self.replacement,
                    path: this.path.length ? this.path.join('.') : undefined
                })
                if (data === self.replacement) {
                    break
                }
            }
            return data
        }) as any
    }
}

export function obfuscate<T>(data: T, opts?: ObfuscatorOpts): T extends Object ? T : T | string {
    return (new Obfuscator(opts)).obfuscate(data)
}

export const rulesBuilder = {
    keyMatchs(keyMatch: RegExp | ((data: any) => boolean) | string): ObfuscationRule {
        if (keyMatch instanceof RegExp) {
            return ({data, key, replacement}) => {
                return typeof key === 'string' && keyMatch.test(key) ? replacement : data
            }
        }

        if (keyMatch instanceof Function) {
            return ({data, key, replacement}) => {
                return keyMatch(key) ? replacement : data
            }
        }

        return ({data, key, replacement}) => {
            return key === keyMatch ? replacement : data
        }
    },
    pathMatchs(pathMatch: RegExp | string): ObfuscationRule {
        if (pathMatch instanceof RegExp) {
            return ({data, path, replacement}) => {
                return typeof path === 'string' && pathMatch.test(path) ? replacement : data
            }
        }

        return ({data, path, replacement}) => {
            return path === pathMatch ? replacement : data
        }
    },
    matchs(valueMatch: RegExp | ((data: any) => boolean) | any): ObfuscationRule {
        if (valueMatch instanceof RegExp) {
            return ({data, replacement}) => {
                return typeof data === 'string' && data.match(valueMatch) ? data.replace(valueMatch, replacement) : data
            }
        }

        if (valueMatch instanceof Function) {
            return ({data, replacement}) => {
                return valueMatch(data) ? replacement : data
            }
        }

        return ({data, replacement}) => {
            return data === valueMatch ? replacement : data
        }
    },
    matchsUriCredentials: () => rulesBuilder.matchs(/(?<=\/\/[^:]+:)[^@]+(?=@)/gi),
    keyMatchsSecret: () => rulesBuilder.keyMatchs(/^password|crendentials|secretKey/i),
    urlEncodedMatchsCredentials: (pathMatchs: RegExp | string): ObfuscationRule => (({data, replacement, path}) => {
        if (pathMatchs instanceof RegExp) {
            if (!path || !pathMatchs.test(path)) {
                return data
            }
        } else {
            if (pathMatchs !== path) {
                return data
            }
        }

        return data.replace(/(?<=(password|credentials|secretKey)=)[^&; ]+/gi, replacement)
    }),
    jsonStringifiedMatchsCredentials: (pathMatchs: RegExp | string): ObfuscationRule => (({data, replacement, path}) => {
        if (pathMatchs instanceof RegExp) {
            if (!path || !pathMatchs.test(path)) {
                return data
            }
        } else {
            if (pathMatchs !== path) {
                return data
            }
        }

        return data.replace(/(?<="(password|credentials|secretKey)": ?")(\\"|[^"])+(?=")/gi, replacement)
    }),
    cookieMatchsCredentials: (pathMatchs: RegExp | string): ObfuscationRule => (({data, replacement, path}) => {
        if (pathMatchs instanceof RegExp) {
            if (!path || !pathMatchs.test(path)) {
                return data
            }
        } else {
            if (pathMatchs !== path) {
                return data
            }
        }

        return typeof data === 'string'
            ? data.split(';').map(c => c.replace(/(?<=(phpsessid|session|token)=)\w+/gi, replacement)).join(';')
            : data
    })
    // secretsInJsonLike: () => rulesBuilder.matchs(/(?<="(password|credentials|token)": ?")(\\"|[^"])+(?=")/gi),
    // authInHeaders: () => rulesBuilder.matchs(/(?<=authorization: ?\w+ )\w+/gi),
    // sessionsInCookies: () => rulesBuilder.matchs(/(?<=Cookie:.*)(?<=(phpsessid|session)=)\w+/gi)
}
