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
                users: [ { name: 'Paul', id: 4 }, { name: 'Sarah', id: 5 }, { name: 'Mélanie', id: 6 } ],
                usersIds: [ 4, 5, 6 ]
            }
        )
    })

    it.only('test with custom file reader', async () => {

        const readFiles: string[] = []

        async function onFileRead(filename: string) {
            readFiles.push(filename)
        }

        const parsed = await parseFile(__dirname + '/test.yml', { onFileRead: onFileRead })

        deepEqual(
            parsed,
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
                users: [ { name: 'Paul', id: 4 }, { name: 'Sarah', id: 5 }, { name: 'Mélanie', id: 6 } ],
                usersIds: [ 4, 5, 6 ]
            }
        )

        deepEqual(
            readFiles,
            [
                __dirname + '/test.yml',
                __dirname + '/included.test.txt',
                __dirname + '/included.test.yml',
                __dirname + '/included2.test.yml',
            ]
        )
    })
})