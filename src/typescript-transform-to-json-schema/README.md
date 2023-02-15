# typescript-transform-to-json-schema

Convert typescript type to jsonSchema during typescript compilation, using https://www.npmjs.com/package/ts-json-schema-generator (supporting jsDoc for example to precise regex, min, max, etc)

## Configure

- Use ttypescript
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

`ttsc` or `ts-node -C ttypescript mainfile.ts`

## What

Resolve typescript type to JSON Schema :
```typescript
    import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema';
    import { Ext } from './types'

    interface MyObject {
      id: string;
      name: string;
      age: number;
    }
    const schema = tsToJsSchema<MyObject>();
    const schema2 = tsToJsSchema<Ext>();

    console.log(schema, schema2);
```

Will be resolved during typescript compilation to :
```javascript
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schema = JSON.parse("{\"$id\":\"MyObject\",\"$schema\":\"http://json-schema.org/draft-07/schema#\",\"additionalProperties\":false,\"definitions\":{},\"properties\":{\"age\":{\"type\":\"number\"},\"id\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"}},\"required\":[\"id\",\"name\",\"age\"],\"type\":\"object\"}");
const schema2 = JSON.parse("{\"$id\":\"Ext\",\"$schema\":\"http://json-schema.org/draft-07/schema#\",\"additionalProperties\":false,\"definitions\":{},\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"],\"type\":\"object\"}");
console.log(schema, schema2);

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
