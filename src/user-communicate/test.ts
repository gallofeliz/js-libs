import communicate from "../src/user-communicate"
import createLogger from '../src/logger'

(async () => {

	const cmdResponse = await communicate({
		userConfig: {
			type: 'command',
			command: 'wc -w',
			outputType: 'text',
			outputTransformation: '$number()'
		},
		logger: createLogger('info'),
		data: 'There are 3 errors',
		resultSchema: { type: 'number' }
	})

	console.log(cmdResponse)

	const httpResponse = await communicate({
		userConfig: {
			type: 'http',
			method: 'POST',
			url: 'https://httpbin.org/anything',
			responseType: 'json',
			responseTransformation: '$number($split(data, " ")[2])'
		},
		logger: createLogger('info'),
		data: 'There are 3 errors',
		resultSchema: { type: 'number' }
	})

	console.log(httpResponse)
})()