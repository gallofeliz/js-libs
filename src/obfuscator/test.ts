import { deepEqual, strictEqual } from 'assert'
import {
    obfuscate,
    createObjectValuesByKeysObfuscatorProcessor,
    createValuesObfuscatorProcessor,
    defaultProcessors
} from '.'

describe('Obfuscator', () => {

    const data = {
        id: 54,
        date: new Date,
        error: new Error('Unable to connect to https://user:pass@localhost'),
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
        city: 'Madrid',
        country: null,
        zip: undefined,
        age: 34,
        sex: 'M',
        very: {
            deep: {
                object: {
                    city: 'Paris',
                    with: [
                        [ '4444-3333-2222-1111', '192.168.0.1', 'ok' ]
                    ]
                }
            }
        }
    }

    it('simple value', () => {
        strictEqual(
            obfuscate('Hello https://melanie:secret@google.fr/path !'),
            'Hello https://melanie:***@google.fr/path !'
        )
    })

    it('no processors', () => {
        strictEqual(
            obfuscate(data, []),
            data
        )
    })

    it('default processors', () => {

        deepEqual(
            obfuscate(data),
            {
                'id': 54,
                'date': data.date,
                'error': data.error,
                'context': {
                    'user': 'root',
                    'password': '***'
                },
                'urls': {
                    'main': 'https://user:***@localhost'
                },
                'email': 'toto@gmail.com',
                'firstName': 'Albert',
                'lastName': 'Dupont',
                'fullname': 'Albert Dupont',
                'city': 'Madrid',
                'country': null,
                'zip': undefined,
                'age': 34,
                'sex': 'M',
                'very': {
                    'deep': {
                        'object': {
                            'city': 'Paris',
                            'with': [
                                [
                                    '4444-3333-2222-1111',
                                    '192.168.0.1',
                                    'ok'
                                ]
                            ]
                        }
                    }
                }
            }
        )

    })

    it('extended default processors', () => {

        deepEqual(
            obfuscate(
                data,
                {
                    ...defaultProcessors,
                    emails: createObjectValuesByKeysObfuscatorProcessor('email')
                }
            ),
            {
                'id': 54,
                'date': data.date,
                'error': data.error,
                'context': {
                    'user': 'root',
                    'password': '***'
                },
                'urls': {
                    'main': 'https://user:***@localhost'
                },
                'email': '***',
                'firstName': 'Albert',
                'lastName': 'Dupont',
                'fullname': 'Albert Dupont',
                'city': 'Madrid',
                'country': null,
                'zip': undefined,
                'age': 34,
                'sex': 'M',
                'very': {
                    'deep': {
                        'object': {
                            'city': 'Paris',
                            'with': [
                                [
                                    '4444-3333-2222-1111',
                                    '192.168.0.1',
                                    'ok'
                                ]
                            ]
                        }
                    }
                }
            }
        )

    })

    it('custom processors', () => {

        let expectedErr;

        deepEqual(
            obfuscate(
                data,
                [
                    createObjectValuesByKeysObfuscatorProcessor('email'),
                    createObjectValuesByKeysObfuscatorProcessor(/name/i),
                    createObjectValuesByKeysObfuscatorProcessor((v: string) => v === 'sex'),
                    createValuesObfuscatorProcessor(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/),
                    createValuesObfuscatorProcessor('root'),
                    createValuesObfuscatorProcessor((v: string) => v === '192.168.0.1'),
                    (data, key, obstr) => {
                        if (key === 'city' && data === 'Paris') {
                            return obstr
                        }
                        return data
                    },
                    (data, key, obstr) => {
                        if (data instanceof Error) {
                            const newMsg = data.message.replace(/(?<=\/\/[^:]+:)[^@]+(?=@)/gi, obstr)

                            if (data.message !== newMsg) {
                                const newError = new Error(newMsg)

                                // etc

                                expectedErr = newError

                                return newError
                            }
                        }

                        return data
                    }
                ],
                'SECRET'
            ),
            {
                'id': 54,
                'date': data.date,
                'error': expectedErr,
                'context': {
                    'user': 'SECRET',
                    'password': 'SECRET'
                },
                'urls': {
                    'main': 'https://user:pass@localhost'
                },
                'email': 'SECRET',
                'firstName': 'SECRET',
                'lastName': 'SECRET',
                'fullname': 'SECRET',
                'city': 'Madrid',
                'country': null,
                'zip': undefined,
                'age': 34,
                'sex': 'SECRET',
                'very': {
                    'deep': {
                        'object': {
                            'city': 'SECRET',
                            'with': [
                                [
                                    'SECRET',
                                    'SECRET',
                                    'ok'
                                ]
                            ]
                        }
                    }
                }
            }
        )

    })
})
