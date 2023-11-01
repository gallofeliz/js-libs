import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema'

interface Blog {
    id: number
}

interface User {
    /** @pattern /a-zA-Z+/ */
    name: string
    /** @asType integer @minimum 1 */
    id: number
    blogs: Blog[]
}

type Choice = 'A' | 'B' | 'C'
/** @default A */
type ChoiceWithDefault = Choice

console.log(tsToJsSchema<User>())
console.log(tsToJsSchema<string>())
console.log(tsToJsSchema<number>())
console.log(tsToJsSchema<boolean>())
console.log(tsToJsSchema<ChoiceWithDefault>())