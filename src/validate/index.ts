import {SchemaObject, default as Ajv, Schema} from 'ajv'
import {clone} from 'lodash'
export {SchemaObject}

export interface ValidateConfig {
    schema: SchemaObject
    removeAdditional?: boolean
    contextErrorMsg?: string
}

export default function validate<Data extends any>(data:Data, config: ValidateConfig): Data {
    const ajv = new Ajv({
        coerceTypes: true,
        removeAdditional: !!config.removeAdditional,
        useDefaults: true,
        strict: true
    })
    const wrapData = {data: clone(data)} // Don't modify caller data !



    const wrapSchema = {
        type: 'object',
        properties: {
            data: ((schema: SchemaObject) => {
                if (schema.$ref) {
                    const ref = schema.$ref.replace('#/definitions/', '')
                    return schema.definitions[ref]
                }

                return schema
            })(config.schema)
        }
    }

    if (!ajv.validate(wrapSchema, wrapData)) {
        const firstError = ajv.errors![0]
        const message = (config.contextErrorMsg ? config.contextErrorMsg + ' ' : '')
            + (firstError.instancePath ? firstError.instancePath.substring(1).replace('/', '.') + ' ' : '')
            + firstError.message

        throw new Error(message)
    }

    return wrapData.data
}