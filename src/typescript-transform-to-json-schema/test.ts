import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'

interface User {
    /** @pattern /a-zA-Z+/ */
    name: string
    /** @asType integer @minimum 1 */
    id: number
}

console.log(tsToJsSchema<User>())
console.log(tsToJsSchema<string>())
console.log(tsToJsSchema<number>())
console.log(tsToJsSchema<boolean>())