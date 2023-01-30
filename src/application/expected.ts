import { runApp } from '.'
import { Logger } from '../logger'
import { tsToJsSchema } from '../typescript-transform-to-json-schema/transformer-def';

interface Config {
	dbPath: string
}

type UserConfig = Config

class Db {
	protected path: string
	constructor(path: string) {
		this.path = path
	}
}

class UserService {
	protected logger: Logger

	constructor(logger: Logger, db: Db) {
		this.logger = logger
		console.log('db', db)
	}

	doAJob() {
		this.logger.info('I do a job')
	}

	clean() {
		this.logger.info('I am cleaning')
	}
}

process.env.dbPath = '/usr/local/db/file.db'

runApp<Config>({
	config: {
		userProvidedConfigSchema: {
			type: 'object',
			properties: { dbPath: {type: 'string'} }
		} //tsToJsSchema<UserConfig>()
	},
	// api ?
	services: {
		userService({logger, db}): UserService {
			return new UserService(logger, db)
		},
		db({config}): Db {
			return new Db(config.dbPath)
		}
	},
	async run({userService, logger}, abortSignal) {
		userService.doAJob()

		abortSignal.addEventListener('abort', () => {
			console.log('clean')
		})

		// setTimeout(() => {
		// 	throw new Error('fyc')

		// }, 500)

		await new Promise(resolve => setTimeout(resolve, 10000))

		userService.clean()
	}
})
