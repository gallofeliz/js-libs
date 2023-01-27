import { obfuscate, createObjectValuesByKeysObfuscatorProcessor, createValuesObfuscatorProcessor } from "../src/obfuscator"

const data = {
			id: 54,
			context: {
				user: 'root',
				password: 'root'
			},
			urls: {
				main: 'https://user:pass@localhost'
			},
			email: 'toto@gmail.com',
			firstName: 'Albert',
			lastName: 'Dupont',
			fullname: 'Albert Dupont',
			age: 34,
			sex: 'M',
			very: {
				deep: {
					object: {
						with: [
							[ '4444-3333-2222-1111', '192.168.0.1', 'ok' ]
						]
					}
				}
			}
		}

console.log(
	obfuscate(
		data
	)
)

console.log(
	JSON.stringify(
	obfuscate(
		data,
		[
			createObjectValuesByKeysObfuscatorProcessor(['email', /name/i, (v) => v === 'sex']),
			createValuesObfuscatorProcessor([/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/, 'root', (v) => v === '192.168.0.1'])
		],
		'SECRET'
	), undefined, 4)
)