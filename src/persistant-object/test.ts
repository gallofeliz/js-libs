import assert from 'assert'
import { unlink } from 'fs/promises'
import { createFilePersistantObject } from '.'

interface MyState {
	count: number
	sub: {
		is: Boolean
	}
}

const testFile = '/tmp/count.json'

describe('Persistant Object', () => {
	before(async () => {
		try {
			await unlink('/tmp/count.json')
		} catch (e) {
		}
	})

	it('No ACL test', async () => {
		await assert.rejects(async () => {
			await createFilePersistantObject<MyState>({
				filename: '/root/here',
				onSaveError: (e) => console.error(e)
			})
		})
	})

	it('Save error', async() => {
		const badaboom = new Error('Badaboom')
		const originalStringify = JSON.stringify

		;(JSON as any).stringify = () => {
			throw badaboom
		}

		let error = null

		const o = await createFilePersistantObject<MyState>({
			filename: testFile,
			onSaveError: (e) => { error = e }
		})

		o.count = 1

		await new Promise(resolve => process.nextTick(resolve))

		JSON.stringify = originalStringify

		assert.strictEqual(error, badaboom)

	})

	it('Normal test', async () => {

		const o = await createFilePersistantObject<MyState>({
			filename: testFile,
			onSaveError: (e) => console.error(e)
		})

		assert.deepEqual(o, {})

		if (!o.count) {
			o.count = 0
		}

		if (!o.sub) {
			o.sub = {is: false}
		}

		assert.deepEqual(o, {count: 0, sub: {is: false}})

		o.count++
		o.sub.is = !o.sub.is

		assert.deepEqual(o, {count: 1, sub: {is: true}})

		const o2 = await createFilePersistantObject<MyState>({
			filename: testFile,
			onSaveError: (e) => console.error(e)
		})

		assert.deepEqual(o2, {count: 1, sub: {is: true}})

		o.count = 44

		assert.strictEqual(o.count, 44)
		assert.strictEqual(o2.count, 1)
	})
})
