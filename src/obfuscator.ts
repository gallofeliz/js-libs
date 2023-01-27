import traverse from 'traverse'
import { cloneDeep } from 'lodash'

export type ObfuscatorProcessor<T = any> = (data: T, obfuscateString: string) => T | string
export type ObfuscatorMatcher = (data: any) => boolean

export function createObjectValuesByKeysObfuscatorProcessor<T>(keyMatches: Array<string | RegExp | ObfuscatorMatcher>): ObfuscatorProcessor<T> {
    return (data: T, obfuscateString: string) => {
        if (data instanceof Object) {
            for (const key in data) {
                keyMatches.forEach(keyMatch => {
                    if (typeof keyMatch === 'string' && typeof key === 'string') {
                        if (key.toLowerCase() === keyMatch.toLowerCase()) {
                            (data as Record<string, any>)[key] = obfuscateString
                        }
                        return
                    }
                    if (keyMatch instanceof RegExp && typeof key === 'string') {
                        if (key.match(keyMatch)) {
                            (data as Record<string, any>)[key] = obfuscateString
                        }
                        return
                    }
                    if (keyMatch instanceof Function) {
                        if (keyMatch(key)) {
                            (data as Record<any, any>)[key] = obfuscateString
                        }
                    }
                })
            }
        }
        return data
    }
}

export function createValuesObfuscatorProcessor<T>(valueMatches: Array<string | RegExp | ObfuscatorMatcher>): ObfuscatorProcessor<T> {
    return (data: T, obfuscateString: string) => {
        for (const valueMatch of valueMatches) {
            if (typeof valueMatch === 'string' && typeof data === 'string') {
                if (data.toLowerCase() === valueMatch.toLowerCase()) {
                    return obfuscateString
                }
            }
            if (valueMatch instanceof RegExp && typeof data === 'string') {
                if (data.match(valueMatch)) {
                    return data.replace(valueMatch, obfuscateString)
                }
            }
            if (valueMatch instanceof Function) {
                if (valueMatch(data)) {
                    return obfuscateString
                }
            }
        }

        return data
    }
}


class Obfuscator {
    protected processors: ObfuscatorProcessor[]
    protected obfuscateString: string

    constructor(processors: ObfuscatorProcessor[] = defaultProcessors, obfuscateString: string = '***') {
        this.processors = processors
        this.obfuscateString = obfuscateString
    }
    obfuscate<T>(data: T): T extends Object ? T : T | string  {
        const wrap = cloneDeep({data})

        traverse(wrap).forEach((data: any) => {
            for (const processor of this.processors) {
                data = processor(data, this.obfuscateString)
            }
            return data
        })

        return wrap.data as any
    }
}

export const defaultProcessors = [
    createValuesObfuscatorProcessor([/(?<=\/\/[^:]+:)[^@]+(?=@)/g]),
    createObjectValuesByKeysObfuscatorProcessor(['password', 'key', 'secret', 'auth', 'token', 'credential'])
]

export function obfuscate<T>(data: T, processors?: ObfuscatorProcessor[], obfuscateString?: string): T extends Object ? T : T | string {
    return (new Obfuscator(processors, obfuscateString)).obfuscate(data)
}
