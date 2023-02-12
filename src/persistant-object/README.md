# Persistant Object

```typescript
import { createFilePersistantObject } from '@gallofeliz/persistant-object'

interface MyState {
	count: number
}

const obj = await createFilePersistantObject<MyState>({
	filename: '/save.json',
	onSaveError: (e) => { console.error(e) }
})

if (!obj.count) {
	obj.count = 0
}

obj.count++

// /save.json will be {"count": 1} and next run will increment
```
