//import { deepEqual, strictEqual } from 'assert'
import {
    obfuscate,
    rulesBuilder
} from '.'

class MyCustomError extends Error {
    name = 'MyError'
    code = 'MY_ERROR'
    protected data: any
    constructor(message: string, data?: any) {
        super(message)
        this.data = data
    }
}

class User {
    user='root'
    password='dontshouldseethat'

    getBasicAuth() {
        return 'basic ' + this.user + ':' + this.password
    }
}

describe('Obfuscator', () => {

    it('Simple test', () => {

        const url = 'https://melanie:dontshouldseethat@mydomain/endpoint'

        const data = {
            message: 'Badaboom',
            level: 'error',
            config: {
                url,
                username: 'melanie',
                password: 'dontshouldseethat',
                server: {
                    port: 80
                }
            },
            session: {
                user: new User
            },
            response: {
                body: 'login=melanie&password=dontshouldseethat',
                body2: JSON.stringify({login: 'melanie', password: 'dontshouldseethat' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'basic dontshouldseethat',
                    'Cookie': 'PHPSESSID=dontshouldseethat; csrftoken=dontshouldseethat; _gat=1; session=dontshouldseethat; hello=world'
                }
            },
            thrownError: new MyCustomError('Invalid ' + url + ' : Unresolved DNS', { curl: { errno: 8, url } })
        }

        const obfuscated = obfuscate(data, {
            rules: [
                rulesBuilder.pathMatchs(/headers.Authorization$/),
                rulesBuilder.urlEncodedMatchsCredentials('response.body'),
                rulesBuilder.jsonStringifiedMatchsCredentials('response.body2'),
                rulesBuilder.cookieMatchsCredentials(/headers.Cookie*/)
            ]
        })

        console.log(obfuscated)

        console.log(data)

    })

})
