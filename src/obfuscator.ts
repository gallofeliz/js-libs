
const stringRegexes = [
    /(?<=\/\/[^:]+:)[^@]+(?=@)/g
]

const secrets = ['password', 'key', 'secret', 'auth', 'token', 'credential']

export default function obfuscate(variable: any): any {
    if (variable instanceof Error) {
        return {
            name: variable.name,
            message: variable.message,
            stack: variable.stack
        }
    }

    if (typeof variable === 'string') {
    	return stringRegexes.reduce((obfuscated, stringRegex) => obfuscated.replace(stringRegex, '***'), variable)
    }

    if (Array.isArray(variable)) {
    	return variable.map(obfuscate)
    }

    if (typeof variable === 'object') {
        for (const key in variable) {
            if (typeof key === 'string' && secrets.includes(key.toLowerCase())) {
        		variable[key] = '***'
        		continue
            }
            variable[key] = obfuscate(variable[key])
        }

    }

    return variable
}
