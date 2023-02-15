# Config

Advanced config:
- from files (super-yaml, json) and envs (scoped or not)
- Validated user config (with validate component with cast and defaults values)
- Finalization fn to transform user config to config
- watch changes and emit on change new config

Example:

```typescript
import {loadConfig} from '@gallofeliz/config'

const watchEventEmitter = new EventEmitter

watchEventEmitter.on('change:machin.truc', ({value/*, previousValue, config, previousConfig*/}) => {
    // Update service
    machinService.setTruc(value)
})

deepEqual(
    await loadConfig<Config, Config>({
        defaultFilename: __dirname + '/config.test.yml',
        logger: createLogger(),
        envFilename: 'config',
        envPrefix: 'app',
        userProvidedConfigSchema: tsToJsSchema<Config>(),
        watchChanges: {
            onChange({config/*, previousConfig, patch*/}) {
                console.log('My new config', config)
            }
            eventEmitter: watchEventEmitter
        }
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

const machinService = new MachinService(config.machin)
```
