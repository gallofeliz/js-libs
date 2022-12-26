import {SchemaObject, default as Ajv, Schema} from 'ajv'
import {clone} from 'lodash'
export {SchemaObject, Schema}

export interface ValidateConfig {
    schema: Schema
    removeAdditional?: boolean
    contextErrorMsg?: string
}

export default function validate<Data extends any>(data:Data, config: ValidateConfig): Data {
    const ajv = new Ajv({
        coerceTypes: data instanceof Object ? true : false,
        removeAdditional: !!config.removeAdditional,
        useDefaults: true
    })
    data = clone(data) // Don't modify caller data !
    if (!ajv.validate(config.schema, data)) {
        const firstError = ajv.errors![0]
        const message = (config.contextErrorMsg ? config.contextErrorMsg + ' ' : '')
            + (firstError.instancePath ? firstError.instancePath.substring(1).replace('/', '.') + ' ' : '')
            + firstError.message

        throw new Error(message)
    }
    return data
}