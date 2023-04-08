# Obfuscator

Obfuscate sensible data:
- direct obfuscate() call
- instanciate Obfuscator for regular calls
- built-in obfuscations or yours (based on helpers or free callback obfuscators)

```typescript
import {
    obfuscate,
    builtinRulesBuilders
} from "@gallofeliz/obfuscator"

const obfuscated = obfuscate(
    {
        url: 'https://root:root@gmail.com',
        user: 'root',
        password: 'root',
        email: 'root@localhost',
        age: 42
    },
    [
        builtinRulesBuilders.authInUrls(),
        builtinRulesBuilders.objKeysLooksLikeSecrets(),
        builtinRulesBuilders.keyMatchs('email')
    ],
    '(obfucated)'
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
