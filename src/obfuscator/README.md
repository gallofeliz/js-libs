# Obfuscator

Obfuscate sensible data:
- direct obfuscate() call
- instanciate Obfuscator for regular calls
- built-in obfuscations or yours (based on helpers or free callback obfuscators)

```typescript
import {
    obfuscate,
    createObjectValuesByKeysObfuscatorProcessor,
    createValuesObfuscatorProcessor
} from "@gallofeliz/obfuscator"

const obfuscated = obfuscate(data)

const obfuscated = obfuscate(
    data,
    [
        createObjectValuesByKeysObfuscatorProcessor(['email', /name/i, (v: string) => v === 'sex']),
        createValuesObfuscatorProcessor([/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/, 'root', (v: string) => v === '192.168.0.1'])
    ]
)
```
