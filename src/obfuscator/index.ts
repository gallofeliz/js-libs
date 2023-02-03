import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscatorProcessor<T = any> = (data: T, obfuscateString: string) => T | string
export type ObfuscatorMatcher = (data: any) => boolean
export type ObfuscatorProcessors = ObfuscatorProcessor[] | Record<string, ObfuscatorProcessor>

export function createObjectValuesByKeysObfuscatorProcessor<T>(keyMatch: RegExp | ObfuscatorMatcher | any): ObfuscatorProcessor<T> {
    return (data: T, obfuscateString: string) => {
        if (!(data instanceof Object)) {
            return data
        }
        for (const key in data) {
            if (keyMatch instanceof RegExp) {
                if (typeof key === 'string' && key.match(keyMatch)) {
                    (data as Record<string, any>)[key] = obfuscateString
                }
            } else if (keyMatch instanceof Function) {
                if (keyMatch(key)) {
                    (data as Record<any, any>)[key] = obfuscateString
                }
            } else {
                if (key === keyMatch) {
                    (data as Record<string, any>)[key] = obfuscateString
                }
            }
        }
        return data
    }
}

export function createValuesObfuscatorProcessor<T>(valueMatch: RegExp | ObfuscatorMatcher | any): ObfuscatorProcessor<T> {
    return (data: T, obfuscateString: string) => {
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
        const wrap = cloneDeep({data})

        traverse(wrap).forEach((data: any) => {
            for (const processor of Array.isArray(this.processors) ? this.processors : Object.values(this.processors)) {
                data = processor(data, this.obfuscateString)
                if (data === this.obfuscateString) {
                    break
                }
            }
            return data
        })

        return wrap.data as any
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
