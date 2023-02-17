# Http Request

Got more hight level.

```typescript
deepEqual(
    await httpRequest({
        logger,
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        responseType: 'auto',
        responseTransformation: '{"name": title}',
        resultSchema: {
            type: 'object',
            properties: {
                name: {type: 'string'}
            },
            required: ['name']
        },
        abortSignal
    }),
    { name: 'delectus aut autem' }
)
```