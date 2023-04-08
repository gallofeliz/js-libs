import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscatorRule<T = any> = (data: T, key: any, obfuscateString: string) => T | string

export class Obfuscator {
    protected rules: ObfuscatorRule[]
    protected replacement: string

    constructor(rules: ObfuscatorRule[], replacement: string = '***') {
        this.rules = rules
        this.replacement = replacement
    }
    obfuscate<T>(data: T): T extends Object ? T : T | string  {
        if (this.rules.length === 0) {
            return data as any
        }
        const self = this

        return traverse(cloneDeep(data)).forEach(function (data: any) {
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

export function obfuscate<T>(data: T, rules: ObfuscatorRule[], replacement?: string): T extends Object ? T : T | string {
    return (new Obfuscator(rules, replacement)).obfuscate(data)
}

export const builtinRulesBuilders = {
    keyMatchs(keyMatch: RegExp | ((data: any) => boolean) | any): ObfuscatorRule {
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
    matchs(valueMatch: RegExp | ((data: any) => boolean) | any): ObfuscatorRule {
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
    authInUrls: () => builtinRulesBuilders.matchs(/(?<=\/\/[^:]+:)[^@]+(?=@)/gi),
    objKeysLooksLikeSecrets: () => builtinRulesBuilders.keyMatchs(/password|crendential|secret|token/i),
    objKeysAreSecrets: () => builtinRulesBuilders.keyMatchs(/^auth$/i),
    secretsInUrlsEncodedLike: () => builtinRulesBuilders.matchs(/(?<=(password|credentials|token)=)[^&; ]+/gi),
    secretsInJsonLike: () => builtinRulesBuilders.matchs(/(?<="(password|credentials|token)": ?")(\\"|[^"])+(?=")/gi),
    authInHeaders: () => builtinRulesBuilders.matchs(/(?<=authorization: ?\w+ )\w+/gi),
    sessionsInCookies: () => builtinRulesBuilders.matchs(/(?<=Cookie:.*)(?<=(phpsessid|session)=)\w+/gi)
}
