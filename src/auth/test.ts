import { deepEqual, fail, strictEqual, throws } from 'assert'
import { verifyHtpasswdPassword, Auth, createAuthMiddleware } from '.'
import app from 'express'
import got from 'got'

describe('Auth', () => {
    it('verifyHtpasswdPassword', () => {
        const passwords = [
            '{SHA}m3eMTmxi2IBKIZgAnySjD/tg8W8=', // sha
            '$2y$05$L/jPI05ltEKrwIjQThJ4keBFKH/aRDpxY9CaaVWYIZcPu0FXdRO6i', //bcrypt
            '$apr1$GZ650zxv$99/Dg0Y6os0zquEMaYoJx1', // default
            '5G1OI2SwmK4v6', // crypt
            'iAmNotHacker27!' // plain
        ]

        const originalPassword = 'iAmNotHacker27!'

        passwords.forEach(pass => {
            strictEqual(verifyHtpasswdPassword(originalPassword, pass), true)
            strictEqual(verifyHtpasswdPassword('iAmHACKER!', pass), false)
        })
    })

    const auth = new Auth({
        users: [
            { username: 'Paul', password: 'secret', autorisations: ['role-user'] },
            { username: 'Mélanie', password: 'verySecret', autorisations: ['role-admin'] },
            { username: 'admin', password: 'veryVerySecret', autorisations: ['*', '!users.remove-admin'] },
            { username: 'no33', password: 'secret', autorisations: ['blog.read-article[*]', '!blog.read-article[33]'] }
        ],
        anonymAutorisations: ['blog.read-*', 'blog.write-public'],
        authorizationsExtensions: {
            'role-user': ['blog.read-*', 'blog.write-*', 'whoiam'],
            'role-admin': ['role-user', 'users.remove-user']
        }
    })

    it('Auth', () => {
        const mélanie = auth.authenticate('Mélanie', 'verySecret')

        auth.ensureAuthorized(mélanie, 'blog.write-article')
        auth.ensureAuthorized(mélanie, 'blog.read-article')
        auth.ensureAuthorized(mélanie, 'users.remove-user')
        auth.ensureAuthorized(mélanie, 'role-admin')
        auth.ensureAuthorized(mélanie, 'role-user')

        throws(() => auth.ensureAuthorized(mélanie, 'unexist'))
        throws(() => auth.ensureAuthorized(mélanie, 'users.remove-admin'))

        throws(() => auth.authenticate('Paul', 'bad'))

        const paul = auth.authenticate('Paul', 'secret')

        auth.ensureAuthorized(paul, 'blog.read-article')
        auth.ensureAuthorized(paul, 'blog.write-public')
        auth.ensureAuthorized(paul, 'blog.write-article')
        auth.ensureAuthorized(paul, 'role-user')

        throws(() => auth.ensureAuthorized(paul, 'blog.remove-user'))
        throws(() => auth.ensureAuthorized(paul, 'unexist'))

        auth.ensureAuthorized(null, 'blog.read-article')
        auth.ensureAuthorized(null, 'blog.write-public')

        throws(() => auth.ensureAuthorized(null, 'blog.write-article'))
        throws(() => auth.ensureAuthorized(null, 'blog.remove-user'))
        throws(() => auth.ensureAuthorized(null, 'unexist'))

        const admin = auth.authenticate('admin', 'veryVerySecret')

        auth.ensureAuthorized(admin, 'WhatIwant')
        throws(() => auth.ensureAuthorized(admin, 'users.remove-admin'))
    })

    it('Internal extendAuthorizations', () => {

        class AuthPublicExtends extends Auth { public extendAuthorizations(autorisations: string[]) { return super.extendAuthorizations(autorisations) } }

        deepEqual(
            (auth as AuthPublicExtends).extendAuthorizations(['role-admin', '!blog.write-article', 'blog.write-*']),
            [
              'blog.read-*',
              'blog.write-*',   // Optional as described below
              'whoiam',
              'role-user',
              'users.remove-user',
              'role-admin',
              '!blog.write-article',
              'blog.write-*'   // Important because after negative, respect the declaration order
            ]
        )
    })

    it('Express Middleware', async () => {
        const server = app()

        server.get(
            '/whoiam',
            createAuthMiddleware({auth, realm: 'abc', requiredAuthorization: 'whoiam'}),
            (req, res) => {
                res.send((req as any).user.username)
            }
        )

        server.get(
            '/article/:id',
            createAuthMiddleware({auth, realm: 'abc', requiredAuthorization: ({params}) => 'blog.read-article[' + params.id + ']'}),
            (req, res) => {
                res.end()
            }
        )

        server.get(
            '/remove-admin',
            createAuthMiddleware({auth, realm: 'abc', requiredAuthorization: 'users.remove-admin'}),
            (req, res) => {
                res.end()
            }
        )

        const s: ReturnType<typeof server.listen> = await new Promise(resolve => {
            const s = server.listen(7777, () => resolve(s))
        })

        try {
            try {
                console.log(await got('http://localhost:7777/whoiam'))
                fail('Unexpected success')
            } catch(e) {
                strictEqual((e as any).response.statusCode, 401)
            }

            strictEqual(await got('http://localhost:7777/whoiam', {username: 'Mélanie', password: 'verySecret'}).text(), 'Mélanie')
            await got('http://localhost:7777/article/33')
            await got('http://localhost:7777/article/33', {username: 'Mélanie', password: 'verySecret'})

            await got('http://localhost:7777/article/333', {username: 'no33', password: 'secret'})

            try {
                await got('http://localhost:7777/article/33', {username: 'no33', password: 'secret'})
                fail('Unexpected success')
            } catch(e) {
                strictEqual((e as any).response.statusCode, 403)
            }

            try {
                console.log(await got('http://localhost:7777/article/33', {username: 'Mélanie', password: 'badSecret'}))
                fail('Unexpected success')
            } catch(e) {
                strictEqual((e as any).response.statusCode, 401)
            }

            try {
                console.log(await got('http://localhost:7777/remove-admin', {username: 'Mélanie', password: 'verySecret'}))
                fail('Unexpected success')
            } catch(e) {
                strictEqual((e as any).response.statusCode, 403)
            }

        } finally {
            s.close()
        }

    })
})
