# Application

Application runner

```typescript
import { runApp } from '@gallofeliz/application'

// ...

runApp<Config>({
    config: {
        userProvidedConfigSchema: tsToJsSchema<UserConfig>()
    },
    services: {
        userService({logger, db}): UserService {
            return new UserService(logger, db)
        },
        db({config}): Db {
            return new Db(config.dbPath)
        }
    },
    async run({userService, logger}, abortSignal) {
        userService.start(abortSignal)

        // or

        userService.start()

        abortSignal.addEventListener('abort', () => userService.stop())

        logger.info('Let\'s go !')
    }
})

```

- Easy Dependencies injection
- Kill signal catched and converted to abortSignal
- Structured
- Built-in config and logger
