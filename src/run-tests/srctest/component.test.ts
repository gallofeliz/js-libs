import assert from "node:assert";
import { saveUser, RealUser, User } from './component'
import * as TypeMoq from "typemoq"

describe('User', () => {
	it('create with RealUser', () => {
		const user = new RealUser('Thomas')
		assert.strictEqual(saveUser(user), 50)
	})
	it('create with User', () => {
		const mock: TypeMoq.IMock<User> = TypeMoq.Mock.ofType<User>()

		mock.setup(x => x.setId(50)).verifiable(TypeMoq.Times.once())
		mock.setup(x => x.getId()).returns(() => 50)

		const user = mock.object
		assert.strictEqual(saveUser(user), 50)

		mock.verifyAll()
	})
})