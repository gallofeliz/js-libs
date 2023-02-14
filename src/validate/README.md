# Validate

Validate your data with ajv:
- Cast types
- Set default
- Validate
- Ideal for user inputs

```typescript
import { validate } from '@gallofeliz/validate'

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
```