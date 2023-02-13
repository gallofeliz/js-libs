# Run process

Easily run processes:

- Pipeable processes
- get text, json or multijson output or stream
- transform output
- logged
- high level
- command one string (can precise shell) or array

```typescript
const result = await runProcess({
    inputData: createProcess({
        logger,
        command: 'md5sum | awk \'{print $1}\'',
        inputData: createProcess({
            logger,
            command: ['echo', 'hello']
        })
    }),
    logger,
    command: ['wc', '-c'],
    outputType: 'text',
    outputTransformation: '$join(["There is ", $string(),  " words"])'
})

strictEqual(result, 'There is 33 words')
```