# typescript-transform-to-json-schema

Convert typescript type to jsonSchema during typescript compilation, using https://www.npmjs.com/package/ts-json-schema-generator (supporting jsDoc for example to precise regex, min, max, etc)

## Configure

- Use ttypescript (because typescript does not support custom transformers)
- Configure tsconfig.json
```json
{
  "compilerOptions": {
    "plugins": [
      { "transform": "@gallofeliz/typescript-transform-to-json-schema" }
    ]
  }
}
```

## Run

`ttsc` or `ts-node -C ttypescript index.ts`

## What

Resolve typescript type to JSON Schema :
```typescript
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema';

interface User {
    /** @pattern /a-zA-Z+/ */
    name: string
    /** @asType integer @minimum 1 */
    id: number
}

const schema = tsToJsSchema<MyObject>();

console.log(schema);

/*
Output :
{
  '$id': 'User',
  '$schema': 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    name: { type: 'string', pattern: '/a-zA-Z+/' },
    id: { type: 'integer', minimum: 1 }
  },
  required: [ 'name', 'id' ],
  additionalProperties: false
}
*/
```

Will be resolved during typescript compilation to :
```javascript
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schema = JSON.parse("{\"$id\":\"User\",\"$schema\":\"http://json-schema.org/draft-07/schema#\",\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"pattern\":\"/a-zA-Z+/\"},\"id\":{\"type\":\"integer\",\"minimum\":1}},\"required\":[\"name\",\"id\"],\"additionalProperties\":false,\"definitions\":{}}");
console.log(schema);
```

Then, we can have :
```typescript
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema';

type LightStatus = 'on' | 'off'

const myApiRoute = {
    method: 'POST',
    uri: '/light/status',
    inputBodySchema: tsToJsSchema<LightStatus>(),
    handle<LightStatus, void>(req, res): void {
        light.turn(req.body) // req.body is either on or off
    }
}
```

## Dev

index.d.ts and index.js are commited because needed for js-libs with ts-node to avoid memory loop problems.