import { createFilePersistantObject } from '.'

interface MyState {
	count: number
	sub: {
		is: Boolean
	}
}

(async () => {

	const o = await createFilePersistantObject<MyState>({
		filename: '/tmp/count.json',
		onSaveError: (e) => console.error(e)
	})

	if (!o.count) {
		o.count = 0
	}

	if (!o.sub) {
		o.sub = {is: false}
	}

	console.log('The value is', JSON.stringify(o))

	o.count++
	o.sub.is = !o.sub.is

	console.log('The value is', JSON.stringify(o))
})()
