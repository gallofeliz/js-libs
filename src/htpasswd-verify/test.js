const username = 'superAdmin27!'
const originalPassword = 'iAmNotHacker27!'
const assert = require('assert')
const HtpasswdValidator = require('.')

const credentials = [
    'superAdmin27!:{SHA}m3eMTmxi2IBKIZgAnySjD/tg8W8=', // sha
    'superAdmin27!:$2y$05$L/jPI05ltEKrwIjQThJ4keBFKH/aRDpxY9CaaVWYIZcPu0FXdRO6i', //bcrypt
    'superAdmin27!:$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1', // default
    'superAdmin27!:5G1OI2SwmK4v6', // crypt
    'superAdmin27!:iAmNotHacker27!' // plain
]

const validator = new HtpasswdValidator

for (const credential of credentials) {
    assert(validator.verifyCredentials(username, originalPassword, credential))
    assert(validator.verifyCredentials(username, 'bipop', credential) === false)

    const split = credential.split(':')

    assert(validator.verifyCredentials(username, originalPassword, split[0], split[1]))
    assert(validator.verifyPassword(originalPassword, split[1]))
    assert(validator.verifyUsername(username, split[0]))
}

const dictValidator = new HtpasswdValidator({
    'bill': '5G1OI2SwmK4v7',
    'superAdmin27!': '$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1'
})

const listValidator = new HtpasswdValidator([
    'bill:5G1OI2SwmK4v7',
    'superAdmin27!:$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1'
])

assert(dictValidator.verify(username, originalPassword))
assert(listValidator.verify(username, originalPassword))
assert(dictValidator.verify('charles', originalPassword) === false)
assert(dictValidator.verify(username, 'iAmHacker78!') === false)

console.log('Ok !')
