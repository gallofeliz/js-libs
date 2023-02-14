import { deepEqual } from 'assert'
import { parseFile } from '.'

describe('Super Yaml', () => {
    it('test', async () => {

        deepEqual(
            await parseFile(__dirname + '/test.yml'),
            {
                machin: {
                    truc: {
                        bidule: true,
                        includeTest: 44,
                        includeTest2: '44',
                        envTest: '/bin/bash',
                        envTest2: 34
                    }
                },
                users: [ { name: 'Paul', id: 4 }, { name: 'Sarah', id: 5 } ],
                usersIds: [ 4, 5 ]

            }
        )
    })
})