import auth from 'basic-auth'
import { flatten, intersection, omitBy, uniq } from 'lodash'
import safeCompare from 'safe-compare'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import md5 from 'apache-md5'
// @ts-ignore
import crypt from 'apache-crypt'
import express from 'express'

export function verifyHtpasswdPassword(inputPassword: string, passwordHash: string): boolean {
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

export interface User {
    username: string
    password: string
    autorisations: string[]
}

export class AuthenticationError extends Error {
    name = 'AuthenticationError'
}

export class AuthorizationError extends Error {
    name = 'AuthorizationError'
}

interface AuthOpts {
    users: User[]
    anonymAutorisations: string[]
    authorizationsExtensions: Record<string, string[]>
}

export class Auth {
    protected usersDict: Record<string, User>
    protected anonymAutorisations: string[]
    protected authorizationsExtensions: Record<string, string[]>

    /*
        authorizationsHierarchy = {
            read: ['read-a', 'read-b'],
            write: ['write-a', 'write-b'],
            publish: ['publish-a', 'publish-b'],
            reader: ['read'],
            journalist: ['read', 'write'],
            leadJournalist: ['journalist', 'publish'],
            chief: ['leadJournalist', 'fire'],
            god: ['*'],
            bad: []
        }
        => An user with journalist auth will have journalist + read + write + read-a + read-b + write-a + write-b
        => If you check user has journalist authorization and user has "read-a + read-b + write-a + write-b" auths,
        => it will fails, because journalist != "read-a + read-b + write-a + write-b"
        => I begun by a resolution (journalit => "read-a + read-b + write-a + write-b"), but I changed to
        => Extension to reduce complexity with intersections and because it can make sense. I'm not sure.
        => PS: the best is to check "low-level" autorisations like "read-a"
    */
    public constructor({users = [], anonymAutorisations = [], authorizationsExtensions = {}}: AuthOpts) {
        this.usersDict = users.reduce((dict, user) => ({...dict, [user.username]: user}) , {})
        this.anonymAutorisations = anonymAutorisations
        this.authorizationsExtensions = omitBy(authorizationsExtensions, list => list.length === 0)
    }

    public authenticate(username: string, password: string): User {
        const foundUser = this.usersDict[username]

        if (!foundUser || !verifyHtpasswdPassword(foundUser.username, foundUser.password)) {
            throw new AuthenticationError
        }

        return foundUser
    }

    public ensureAuthorized(user: User | null, authorization: string | null) {
        if (!this.isAuthorized(user, authorization)) {
            throw new AuthorizationError
        }
    }

    public isAuthorized(user: User | null, authorization: string | null): boolean {
        const userExtendedAuthorizations = this.extendAuthorizations(user?.autorisations || this.anonymAutorisations)

        if (authorization === null || authorization === undefined) {
            if (userExtendedAuthorizations.includes('*')) {
                return true
            }
            return false
        }

        // TODO add minimatch to accept ['read-*', '!read-b']

        // I do not extend authorization because it adds some problematics
        // And we can see users with roles, roles with authorizations, etc,
        // But a resource should have a very specific authorization and not target a group
        return userExtendedAuthorizations.includes(authorization)
    }

    protected extendAuthorizations(autorisations: string[]): string[] {
        if (intersection(autorisations, Object.keys(this.authorizationsExtensions)).length === 0) {
            return uniq(autorisations)
        }
        return this.extendAuthorizations(
            flatten(
                autorisations.map(role => this.authorizationsExtensions[role] || role)
            ).concat(autorisations)
        )
    }
}

function authMiddleware(
    {realm, routeRoles, auth}:
    {realm: string, routeRoles: string | string[], auth: Auth}
) {
    function demandAuth(res: express.Response) {
        res.set('WWW-Authenticate', 'Basic realm="'+realm+'"').status(401).end()
    }

    return function (req: express.Request, res: express.Response, next: express.NextFunction) {
        const userPassFromHeaders = auth(req)

        if (!userPassFromHeaders) {
            // Anonym
            if (!authorizator.isAutorised(null, routeRoles)) {
                return demandAuth(res)
            }

            (req as HttpServerRequest).user = null
        } else {
            // Not anonym
            const user = authenticator.authenticate(userPassFromHeaders.name, userPassFromHeaders.pass)

            if (!user) {
                return demandAuth(res)
            }

            if (!authorizator.isAutorised(user, routeRoles)) {
                res.status(403).end()
                return
            }

            (req as HttpServerRequest).user = user
        }

        next()
    }
}