import { createFilePersistantObject } from '.'

interface MyState {
	count: number
}

(async () => {

	const o = await createFilePersistantObject<MyState>('/tmp/count.json', function (e) { console.error(e) })

	if (!o.count) {
		o.count = 0
	}

	console.log('The value is', o.count)

	o.count++

	console.log('The value is', o.count)
})()
