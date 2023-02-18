# User-communicate

Handle separation between app and user triggers:
- Give data, expect result schema
- User gives action to exec : currently command or http request, data will be injected and user configure transformation to match its results with app expected result schema

```typescript

const userConfig = {
    type: 'command',
    command: 'wc -w',
    outputType: 'text',
    outputTransformation: '$number()'
}
// or
const userConfig = {
    type: 'http',
    method: 'POST',
    url: 'https://httpbin.org/anything',
    responseType: 'json',
    responseTransformation: '$number($split(data, " ")[2])'
}

const result = await communicate({
    userConfig,
    logger: createLogger(),
    data: 'There are 4 errors',
    resultSchema: { type: 'number' }
})
```

Here, in both case the user receives 'There are 4 errors', and app will have number 4 :)
