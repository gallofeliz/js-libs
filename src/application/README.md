# Application

Application runner:

- Easy Dependencies injection
- Kill signal catched and converted to abortSignal
- Structured
- Built-in config (load from files, envs, validation, watches, etc) and logger

```typescript
import { runApp } from '@gallofeliz/application'

// ...

runApp<Config>({
    name: '@gallofeliz/Pikatchu',
    config: {
        watchChanges: true,
        userProvidedConfigSchema: tsToJsSchema<UserConfig>()
    },
    services: {
        userService({logger, db}): UserService {
            return new UserService(logger, db)
        },
        db({config, configWatcher}): Db {
            const db = new Db(config.dbPath)

            configWatcher.on('change:dbPath', ({value}) => db.setPath(value as string))

            return db
        }
    },
    async run({userService, logger, abortSignal, abortController}) {
        userService.doAJob()
        let st: NodeJS.Timeout

        abortSignal.addEventListener('abort', () => {
            clearTimeout(st)
            console.log('clean')
            userService.clean()
            resolve(undefined)
        })

        await new Promise(resolve => st = setTimeout(resolve, 5000))

        abortController.abort()
    }
})
```
