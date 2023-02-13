const safeCompare = require('safe-compare')
const crypto = require('crypto')
const bcrypt = require('bcryptjs');
const md5 = require("apache-md5");
const crypt = require("apache-crypt");

module.exports = class HtpasswdValidator {
    constructor(listOrDict) {
        if (Array.isArray(listOrDict)) {
            listOrDict = listOrDict.reduce((dict, userpassHash) => {
                const split = this.splitUserPasshash(userpassHash)
                return {...dict, [split[0]]: split[1]}
            }, {})
        }

        this.dict = listOrDict || {}
    }

    verifyUsername(inputUsername, username) {
        return safeCompare(inputUsername, username)
    }

    verifyPassword(inputPassword, passwordHash) {
        if (passwordHash.substr(0, 5) === '{SHA}') {
            const c = crypto.createHash('sha1');
            c.update(inputPassword);
            return safeCompare(c.digest('base64'), passwordHash.substr(5))
        }

        if (passwordHash.substr(0, 4) === '$2y$' || passwordHash.substr(0, 4) === '$2a$') {
            return bcrypt.compareSync(inputPassword, passwordHash)
        }

        if (passwordHash.substr(0, 6) === '$apr1$' || passwordHash.substr(0, 3) === '$1$') {
            return safeCompare(md5(inputPassword, passwordHash), passwordHash)
        }

        if (/^[a-zA-Z0-9]{13}$/.test(passwordHash)) {
            return safeCompare(crypt(inputPassword, passwordHash), passwordHash)
        }

        return safeCompare(inputPassword, passwordHash)
    }

    verifyCredentials(inputUsername, inputPassword, userpassHashOrUsername, passwordHash) {
        let username

        if (passwordHash) {
            username = userpassHashOrUsername
        } else {
            const split = this.splitUserPasshash(userpassHashOrUsername)
            username = split[0]
            passwordHash = split[1]
        }

        return !!(this.verifyUsername(inputUsername, username) & this.verifyPassword(inputPassword, passwordHash))
    }

    verify(inputUsername, inputPassword) {
        if (!this.dict[inputUsername]) {
            return false // Add safe time ?
        }

        return this.verifyPassword(inputPassword, this.dict[inputUsername])
    }

    splitUserPasshash(userpassHash) {
        const [username, ...passwordHashParts] = userpassHash.split(':')
        const passwordHash = passwordHashParts.join(':')

        return [username, passwordHash]
    }
}
