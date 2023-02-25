# Documents Collection

Mongodb compatible documents collection interface with various implementations (for the moment only NeDB) :
- [X] find, findOne
    - [X] Sort
    - [X] Limit, Skip
    - [X] Projection
    - [X] Cursor
- [X] insert (one, multi)
- [X] update, updateOne
- [X] remove, removeOne
- [X] count, has
- [X] Aggregate
- [ ] Fix typescript some invalidations patched by ts-ignore and any
- [?] Use Mingo Projection to better projection than NeDB ?

See DocumentCollection type for more informations.

```typescript
import {DocumentCollection, NeDbDocumentCollection} from '@gallofeliz/documents-collection'

interface Person {
    _id: string
    name: string
    age: number
}

const collection = new NeDbDocumentCollection<Person>({
    filePath: null
})

await collection.insert([
    {name: 'Mélanie', age: 45},
    {name: 'Paul', age: 44},
    {name: 'Thierry', age: 45},
    {name: 'Lucie', age: 12},
    {name: 'Guillaume', age: 32},
    {name: 'Paulette', age: 77},
])

/*
    Paulette is 77 years old { name: 'Paulette', age: 77 }
    Thierry is 45 years old { name: 'Thierry', age: 45 }
    Mélanie is 45 years old { name: 'Mélanie', age: 45 }
    Paul is 44 years old { name: 'Paul', age: 44 }
    Guillaume is 32 years old { name: 'Guillaume', age: 32 }
    Lucie is 12 years old { name: 'Lucie', age: 12 }
*/
for await (const person of collection.find({}, {sort: {age: -1}, projection: { _id: 0 }})) {
    console.log(`${person.name} is ${person.age} years old`, person)
}

/*
    [
      { age: 32, names: [ 'Guillaume' ] },
      { age: 44, names: [ 'Paul' ] },
      { age: 45, names: [ 'Thierry', 'Mélanie' ] },
      { age: 77, names: [ 'Paulette' ] }
    ]
*/
console.log(await collection.aggregate([
    { $match: { age: { $gte: 18 } } },
    { $group: { _id: "$age", names: { $push: "$name" } } },
    { $project: { age: '$_id', _id: 0, names: 1 } },
    { $sort: { age: 1 } }
]).toArray())
```