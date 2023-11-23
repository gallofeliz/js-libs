import { deepEqual, fail, strictEqual } from 'assert'
import { validate } from '.'

describe('Validate', () => {
    it('success cases', () => {

        strictEqual(
            validate('true', { schema: {type: 'boolean'} }),
            true
        )

        deepEqual(
            validate(
                { count: '5' },
                { schema: {
                    type: 'object',
                    properties: {
                        count: { type: 'number' },
                        logs: {
                            type: 'object',
                            properties: {
                                level: { type: 'string', default: 'info' }
                            },
                            required: ['level'],
                            default: {}
                        }
                    },
                    required: ['count', 'logs'],
                } }),
            { count: 5, logs: { level: 'info' } }
        )

        deepEqual(
            validate(
                { dbPath: '/var/data/db' },
                {
                    schema: {"$id":"InputConfig","$ref":"#/definitions/Config","$schema":"http://json-schema.org/draft-07/schema#","definitions":{"Config":{"additionalProperties":false,"properties":{"dbPath":{"type":"string"},"log":{"additionalProperties":false,"default":{},"properties":{"level":{"$ref":"#/definitions/LogLevel","default":"info"}},"required":["level"],"type":"object"}},"required":["dbPath","log"],"type":"object"},"LogLevel":{"enum":["fatal","error","warning","info","debug"],"type":"string"}}}
                }
            ),
            { dbPath: '/var/data/db', log: { level: 'info' } }
        )

    })

    it('fail', () => {
        try {
            validate('true', {schema: {type: 'number'}, contextErrorMsg: 'myComponent'})
            fail('Unexpected success')
        } catch (e) {
            strictEqual((e as any).message, 'myComponent data must be number')
        }
    })

})