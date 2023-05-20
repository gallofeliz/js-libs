# Obfuscator

Obfuscate sensible data:
- direct obfuscate() call
- instanciate Obfuscator for regular calls
- built-in obfuscations or yours (based on helpers or free callback obfuscators)
- [ ] See To improve builder (or Rule object/fn)
  - builder.ifPathContains('request.body').stringifyJsonByKey(['password']) ...
  - Rule { conditions: Condition[], obfuscations?: Function } and/or ?
  - Jsonata or MongoLike Condition { path: { $regex: /request\.body/ } }

```typescript
import {
    obfuscate,
    rulesBuilder
} from "@gallofeliz/obfuscator"

const obfuscated = obfuscate(
    {
        url: 'https://root:root@gmail.com',
        user: 'root',
        password: 'root',
        email: 'root@localhost',
        age: 42
    },
    {
        rules: [
            rulesBuilder.pathMatchs(/age$/),
            rulesBuilder.urlEncodedMatchsCredentials('response.body'),
            rulesBuilder.jsonStringifiedMatchsCredentials('response.body2'),
            rulesBuilder.cookieMatchsCredentials(/headers.Cookie*/)
        ]
    }
)

/*
    {
        url: 'https://root:(obfucated)@gmail.com',
        user: 'root',
        password: '(obfucated)',
        email: '(obfucated)',
        age: 42
    }
*/
```
