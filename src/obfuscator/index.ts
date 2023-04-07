import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscatorProcessor<T = any> = (data: T, key: any, obfuscateString: string) => T | string
export type ObfuscatorMatcher = (data: any) => boolean
export type ObfuscatorProcessors = ObfuscatorProcessor[] | Record<string, ObfuscatorProcessor>

export function createObjectValuesByKeysObfuscatorProcessor<T>(keyMatch: RegExp | ObfuscatorMatcher | any): ObfuscatorProcessor<T> {
    if (keyMatch instanceof RegExp) {
        return (data: T, key: any, obfuscateString: string) => {
            return typeof key === 'string' && key.match(keyMatch) ? obfuscateString : data
        }
    }

    if (keyMatch instanceof Function) {
        return (data: T, key: any, obfuscateString: string) => {
            return keyMatch(key) ? obfuscateString : data
        }
    }

    return (data: T, key: any, obfuscateString: string) => {
        return key === keyMatch ? obfuscateString : data
    }
}

export function createValuesObfuscatorProcessor<T>(valueMatch: RegExp | ObfuscatorMatcher | any): ObfuscatorProcessor<T> {
    if (valueMatch instanceof RegExp) {
        return (data: T, _, obfuscateString: string) => {
            return typeof data === 'string' && data.match(valueMatch) ? data.replace(valueMatch, obfuscateString) : data
        }
    }

    if (valueMatch instanceof Function) {
        return (data: T, _, obfuscateString: string) => {
            return valueMatch(data) ? obfuscateString : data
        }
    }

    return (data: T, _, obfuscateString: string) => {
        return data === valueMatch ? obfuscateString : data
    }
}

export class Obfuscator {
    protected processors: ObfuscatorProcessors
    protected obfuscateString: string

    constructor(processors: ObfuscatorProcessors = defaultProcessors, obfuscateString: string = '***') {
        this.processors = processors
        this.obfuscateString = obfuscateString
    }
    obfuscate<T>(data: T): T extends Object ? T : T | string  {
        const processors: ObfuscatorProcessor[] = Array.isArray(this.processors) ? this.processors : Object.values(this.processors)
        const obfuscateString = this.obfuscateString

        if (processors.length === 0) {
            return data as any
        }

        return traverse(cloneDeep(data)).forEach(function (data: any) {
            for (const processor of processors) {
                data = processor(data, this.key, obfuscateString)
                if (data === obfuscateString) {
                    break
                }
            }
            return data
        }) as any
    }
}

export const defaultProcessors = {
    authInUrls: createValuesObfuscatorProcessor(/(?<=\/\/[^:]+:)[^@]+(?=@)/gi),
    objKeysLooksLikeSecrets: createObjectValuesByKeysObfuscatorProcessor(/password|crendential|secret|token/i),
    objKeysAreSecrets: createObjectValuesByKeysObfuscatorProcessor(/^auth$/i),
    secretsInUrlsEncodedLike: createValuesObfuscatorProcessor(/(?<=(password|credentials|token)=)[^&; ]+/gi),
    secretsInJsonLike: createValuesObfuscatorProcessor(/(?<="(password|credentials|token)": ?")(\\"|[^"])+(?=")/gi),
    authInHeaders: createValuesObfuscatorProcessor(/(?<=authorization: ?\w+ )\w+/gi),
    sessionsInCookies: createValuesObfuscatorProcessor(/(?<=Cookie:.*)(?<=(phpsessid|session)=)\w+/gi),
}

export function obfuscate<T>(data: T, processors?: ObfuscatorProcessors, obfuscateString?: string): T extends Object ? T : T | string {
    return (new Obfuscator(processors, obfuscateString)).obfuscate(data)
}
