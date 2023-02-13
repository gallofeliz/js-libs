import { runApp } from '.'
import { Logger } from '@gallofeliz/logger'
import { tsToJsSchema } from '@gallofeliz/typescript-transform-to-json-schema/transformer-def';

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

// @ts-ignore
describe('Application', () => {
	// @ts-ignore
	it('test', () => {
		process.env.dbPath = '/usr/local/db/file.db'

		runApp<Config>({
			config: {
				userProvidedConfigSchema: tsToJsSchema<UserConfig>() /* {
					type: 'object',
					properties: { dbPath: {type: 'string'} }
				} */
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
				let st: NodeJS.Timeout

				abortSignal.addEventListener('abort', () => {
					clearTimeout(st)
					console.log('clean')
					userService.clean()
				})

				// setTimeout(() => {
				// 	throw new Error('fyc')

				// }, 500)

				await new Promise(resolve => st = setTimeout(resolve, 10000))

				console.log('Should never reach if aborted')
				userService.clean()
			}
		})



	})
})
