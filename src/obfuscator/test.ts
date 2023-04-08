import { deepEqual, strictEqual } from 'assert'
import {
    obfuscate,
    builtinRulesBuilders
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
            obfuscate('Hello https://melanie:secret@google.fr/path !', [builtinRulesBuilders.authInUrls()]),
            'Hello https://melanie:***@google.fr/path !'
        )
    })

    it('no rules', () => {
        strictEqual(
            obfuscate(data, []),
            data
        )
    })

    it('all rules', () => {

        deepEqual(
            obfuscate({
                ...data,
                form1: 'user=me&password=hacked',
                form2: 'credentials=hacked%26!&user=me',
                stringifiedJson1: JSON.stringify({user: 'me', password: 'hacked'}),
                stringifiedJson2: JSON.stringify({password: 'hacked"!', user: 'me'}),
                headers: 'Content-Type: text/plain'
                + '\nAuthorization: Basic YWxhZGRpbjpvcGVuc2VzYW1l'
                + '\nCookie: PHPSESSID=298zf09hf012fh2; csrftoken=u32t4o3tb3gg43; _gat=1'
                + '\nCache-Control: max-age=604800'
            }, [
                builtinRulesBuilders.authInHeaders(),
                builtinRulesBuilders.authInUrls(),
                builtinRulesBuilders.objKeysAreSecrets(),
                builtinRulesBuilders.objKeysLooksLikeSecrets(),
                builtinRulesBuilders.secretsInJsonLike(),
                builtinRulesBuilders.secretsInUrlsEncodedLike(),
                builtinRulesBuilders.sessionsInCookies()
            ]),
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
                'form1': 'user=me&password=***',
                'form2': 'credentials=***&user=me',
                'stringifiedJson1': JSON.stringify({user: 'me', password: '***'}),
                'stringifiedJson2': JSON.stringify({password: '***', user: 'me'}),
                'headers': 'Content-Type: text/plain'
                + '\nAuthorization: Basic ***'
                + '\nCookie: PHPSESSID=***; csrftoken=***; _gat=1'
                + '\nCache-Control: max-age=604800',
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

    it('extended all rules', () => {

        deepEqual(
            obfuscate(
                data,
                [
                    builtinRulesBuilders.authInHeaders(),
                    builtinRulesBuilders.authInUrls(),
                    builtinRulesBuilders.objKeysAreSecrets(),
                    builtinRulesBuilders.objKeysLooksLikeSecrets(),
                    builtinRulesBuilders.secretsInJsonLike(),
                    builtinRulesBuilders.secretsInUrlsEncodedLike(),
                    builtinRulesBuilders.sessionsInCookies(),
                    builtinRulesBuilders.keyMatchs('email')
                ]
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

    it('custom rules', () => {

        let expectedErr;

        deepEqual(
            obfuscate(
                data,
                [
                    builtinRulesBuilders.keyMatchs('email'),
                    builtinRulesBuilders.keyMatchs(/name/i),
                    builtinRulesBuilders.keyMatchs((v: string) => v === 'sex'),
                    builtinRulesBuilders.matchs(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/),
                    builtinRulesBuilders.matchs('root'),
                    builtinRulesBuilders.matchs((v: string) => v === '192.168.0.1'),
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
