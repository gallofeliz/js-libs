import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscatorProcessor<T = any> = (data: T, key: any, obfuscateString: string) => T | string
export type ObfuscatorMatcher = (data: any) => boolean
export type ObfuscatorProcessors = ObfuscatorProcessor[] | Record<string, ObfuscatorProcessor>

export function createObjectValuesByKeysObfuscatorProcessor<T>(keyMatch: RegExp | ObfuscatorMatcher | any): ObfuscatorProcessor<T> {
    return (data: T, key: any, obfuscateString: string) => {
        if (keyMatch instanceof RegExp) {
            if (typeof key === 'string' && key.match(keyMatch)) {
                return obfuscateString
            }
        } else if (keyMatch instanceof Function) {
            if (keyMatch(key)) {
                return obfuscateString
            }
        } else {
            if (key === keyMatch) {
                return obfuscateString
            }
        }

        return data
    }
}

export function createValuesObfuscatorProcessor<T>(valueMatch: RegExp | ObfuscatorMatcher | any): ObfuscatorProcessor<T> {
    return (data: T, _, obfuscateString: string) => {
        if (valueMatch instanceof RegExp) {
            if (typeof data === 'string' && data.match(valueMatch)) {
                return data.replace(valueMatch, obfuscateString)
            }
        } else if (valueMatch instanceof Function) {
            if (valueMatch(data)) {
                return obfuscateString
            }
        } else {
            if (data === valueMatch) {
                return obfuscateString
            }
        }

        return data
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
    objKeysAreSecrets: createObjectValuesByKeysObfuscatorProcessor(/^auth$/i)
}

export function obfuscate<T>(data: T, processors?: ObfuscatorProcessors, obfuscateString?: string): T extends Object ? T : T | string {
    return (new Obfuscator(processors, obfuscateString)).obfuscate(data)
}
