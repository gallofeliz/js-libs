import createPersistantObject, { PersistantObjectFileHandler } from '.'

interface MyState {
	count: number
}

(async () => {

	const o = await createPersistantObject<MyState>({ count: 0 }, new PersistantObjectFileHandler('/tmp/count.json'))

	console.log('The value is', o.count)

	o.count++

	console.log('The value is', o.count)
})()
