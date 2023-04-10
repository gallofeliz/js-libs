import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscationRule<T = any> = (data: T, key: any, obfuscateString: string) => T | string

// export interface ObfuscationRule2 {
//     test: (value: any, key: string) => boolean
//     obfuscate?: (value: any) => any
// }

export interface ObfuscatorOpts {
    rules?: ObfuscationRule[]
    replaceDefaultRules?: boolean
    replacement?: string
    softMode?: boolean
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

    constructor(opts: ObfuscatorOpts = {}) {
        this.rules = (opts.rules || []).concat(opts.replaceDefaultRules ? [] : createDefaultRules())
        this.replacement = opts.replacement || '***'
    }

    public obfuscate<T>(data: T): T extends Object ? T : T | string  {
        if (this.rules.length === 0) {
            return data as any
        }
        const self = this

        return traverse(cloneDeep(data)).forEach(function (data: any) {
            if (data instanceof Error) {
                const newRawData = self.obfuscate({
                    ...data,
                    // name: data.name,
                    message: data.message,
                    stack: data.stack
                })

                const newData = Object.create(data)

                Object.assign(newData, newRawData)

                return newData
            }

            for (const rule of self.rules) {
                data = rule(data, this.key, self.replacement)
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
    keyMatchs(keyMatch: RegExp | ((data: any) => boolean) | any): ObfuscationRule {
        if (keyMatch instanceof RegExp) {
            return (data: any, key: any, obfuscateString: string) => {
                return typeof key === 'string' && key.match(keyMatch) ? obfuscateString : data
            }
        }

        if (keyMatch instanceof Function) {
            return (data: any, key: any, obfuscateString: string) => {
                return keyMatch(key) ? obfuscateString : data
            }
        }

        return (data: any, key: any, obfuscateString: string) => {
            return key === keyMatch ? obfuscateString : data
        }
    },
    matchs(valueMatch: RegExp | ((data: any) => boolean) | any): ObfuscationRule {
        if (valueMatch instanceof RegExp) {
            return (data, _, obfuscateString: string) => {
                return typeof data === 'string' && data.match(valueMatch) ? data.replace(valueMatch, obfuscateString) : data
            }
        }

        if (valueMatch instanceof Function) {
            return (data, _, obfuscateString: string) => {
                return valueMatch(data) ? obfuscateString : data
            }
        }

        return (data, _, obfuscateString: string) => {
            return data === valueMatch ? obfuscateString : data
        }
    },
    matchsUriCredentials: () => rulesBuilder.matchs(/(?<=\/\/[^:]+:)[^@]+(?=@)/gi),
    keyMatchsSecret: () => rulesBuilder.keyMatchs(/^password|crendentials|secretKey/i),
    secretsInUrlsEncodedLike: () => rulesBuilder.matchs(/(?<=(password|credentials|token)=)[^&; ]+/gi),
    secretsInJsonLike: () => rulesBuilder.matchs(/(?<="(password|credentials|token)": ?")(\\"|[^"])+(?=")/gi),
    authInHeaders: () => rulesBuilder.matchs(/(?<=authorization: ?\w+ )\w+/gi),
    sessionsInCookies: () => rulesBuilder.matchs(/(?<=Cookie:.*)(?<=(phpsessid|session)=)\w+/gi)
}
