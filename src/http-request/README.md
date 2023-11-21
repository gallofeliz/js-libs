# Http Request

Got more hight level.

- [ ] Replace transformation by custom fn and retry ?

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
        abortSignal,
        timeout: 5000
    }),
    { name: 'delectus aut autem' }
)
```