import { createFilePersistantObservableObject } from '.'
import { writeFile } from 'fs/promises'

interface MyState {
	count: number
}

(async () => {

	const abortC = new AbortController

	const o = await createFilePersistantObservableObject<MyState>({ count: 0 }, '/tmp/count.json', true, abortC.signal)

	o.once('change', () => console.log('My object has changed !!!'))

	console.log('The value is', o.count)

	o.count++

	console.log('The value is', o.count)

	setTimeout(() => writeFile('/tmp/count.json', '{"count":'+(o.count + 10)+'}', {encoding: 'utf8'}), 250)

	setTimeout(() => console.log('The value is', o.count), 500)

	setTimeout(() => abortC.abort(), 1000)
})()
