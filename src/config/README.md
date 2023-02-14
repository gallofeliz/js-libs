# Config

Advanced config:
- from files (super-yaml, json) and envs (scoped or not)
- Validated user config (with validate component with cast and defaults values)
- Finalization fn to transform user config to config
- watch changes and emit on change new config

Example:

```typescript
import {loadConfig} from '@gallofeliz/config'

deepEqual(
    await loadConfig<Config, Config>({
        defaultFilename: __dirname + '/config.test.yml',
        logger: createLogger(),
        envFilename: 'config',
        envPrefix: 'app',
        userProvidedConfigSchema: tsToJsSchema<Config>()
    }),
    {
        machin: {
            truc: {
                bidule: true
            }
        },
        envShell: 'hello world'
    }
)
```
