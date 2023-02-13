# htpasswd-verify

Verify htpasswd passwords

Support Apache generated credentials

```
    admin:$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1 #default
    admin:{SHA}m3eMTmxi2IBKIZgAnySjD/tg8W8= #sha
    admin:$2y$05$L/jPI05ltEKrwIjQThJ4keBFKH/aRDpxY9CaaVWYIZcPu0FXdRO6i #bcrypt
    admin:5G1OI2SwmK4v6 #crypt
    admin:iAmNotHacker27! #plain
```

## Easy to use

```javascript
    const HtpasswdValidator = require('htpasswd-verify')
    const validator = new HtpasswdValidator

    if (validator.verifyCredentials(username, password, 'admin:$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1')) {
        console.log('Oh yeah !')
    }

    if (validator.verifyCredentials(username, password, 'admin', '$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1')) {
        console.log('Oh yeah !')
    }

    if (validator.verifyUsername(username, 'admin') & validator.verifyPassword(password, '$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1')) {
        console.log('Oh yeah !')
    }

    const listValidator = new HtpasswdValidator({
        admin: '$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1',
        bill: '5G1OI2SwmK4v6'
    })

    // or

    const listValidator = new HtpasswdValidator([
        'admin:$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1',
        'bill:5G1OI2SwmK4v6'
    ])

    if (listValidator.verify(username, password)) {
        console.log('Oh yeah !')
    }
```
