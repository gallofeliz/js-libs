export interface User {
	setId(id: number): void
	getId(): number | undefined
}

export class RealUser implements User {
	protected id?: number
	protected name: string

	constructor(name: string) {
		this.name = name
	}

	 public getId(): number | undefined {
	     return this.id
	 }

	 public setId(id: number): void {
	     this.id = id
	 }
}

export function saveUser(user: User) {
	user.setId(50)
	return user.getId()
}