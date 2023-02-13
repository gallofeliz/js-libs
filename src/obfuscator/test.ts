import { deepEqual } from "assert"
import {
    obfuscate,
    createObjectValuesByKeysObfuscatorProcessor,
    createValuesObfuscatorProcessor
} from "."

describe('Obfuscator', () => {
    it('test', () => {

        const data = {
            id: 54,
            context: {
                user: 'root',
                password: 'root'
            },
            urls: {
                main: 'https://user:pass@localhost'
            },
            email: 'toto@gmail.com',
            firstName: 'Albert',
            lastName: 'Dupont',
            fullname: 'Albert Dupont',
            age: 34,
            sex: 'M',
            very: {
                deep: {
                    object: {
                        with: [
                            [ '4444-3333-2222-1111', '192.168.0.1', 'ok' ]
                        ]
                    }
                }
            }
        }

        deepEqual(
            obfuscate(data),
            {
                "id": 54,
                "context": {
                    "user": "root",
                    "password": "***"
                },
                "urls": {
                    "main": "https://user:***@localhost"
                },
                "email": "toto@gmail.com",
                "firstName": "Albert",
                "lastName": "Dupont",
                "fullname": "Albert Dupont",
                "age": 34,
                "sex": "M",
                "very": {
                    "deep": {
                        "object": {
                            "with": [
                                [
                                    "4444-3333-2222-1111",
                                    "192.168.0.1",
                                    "ok"
                                ]
                            ]
                        }
                    }
                }
            }
        )

        deepEqual(
            obfuscate(
                data,
                [
                    createObjectValuesByKeysObfuscatorProcessor(['email', /name/i, (v: string) => v === 'sex']),
                    createValuesObfuscatorProcessor([/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/, 'root', (v: string) => v === '192.168.0.1'])
                ],
                'SECRET'
            ),
            {
                "id": 54,
                "context": {
                    "user": "root",
                    "password": "root"
                },
                "urls": {
                    "main": "https://user:pass@localhost"
                },
                "email": "toto@gmail.com",
                "firstName": "Albert",
                "lastName": "Dupont",
                "fullname": "Albert Dupont",
                "age": 34,
                "sex": "M",
                "very": {
                    "deep": {
                        "object": {
                            "with": [
                                [
                                    "4444-3333-2222-1111",
                                    "192.168.0.1",
                                    "ok"
                                ]
                            ]
                        }
                    }
                }
            }
        )

    })
})
