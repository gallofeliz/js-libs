# typescript-transform-to-json-schema

POC passed. Now to create a plugin (if possible without JSON.parse).

## Run

`ttsc`

## What

Resolve typescript type to JSON Schema :
```typescript
	import { tsToJsSchema } from './transformer-def';
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
    import { tsToJsSchema } from './transformer-def';

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

You can imagine that the component that receives myApiRoute can without inputBodySchema know that body type is LightStatus and transform itself, but so we need to use Typescript at runtime or more complex job. Here we have a small redondance of type but no need to create a ts type AND a jsonSchema type