import basicAuth from 'basic-auth'
import { flatten, omitBy } from 'lodash'
import safeCompare from 'safe-compare'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import md5 from 'apache-md5'
// @ts-ignore
import crypt from 'apache-crypt'
import {Request, Response, NextFunction} from 'express'
import matcher from 'matcher'

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

export interface AuthOpts {
    users?: User[]
    anonymAutorisations?: string[]
    authorizationsExtensions?: Record<string, string[]>
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

        if (!foundUser || !verifyHtpasswdPassword(password, foundUser.password)) {
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
        if (authorization === null) {
            return true
        }

        const userExtendedAuthorizations = this.extendAuthorizations(user?.autorisations || this.anonymAutorisations)

        return matcher(authorization, userExtendedAuthorizations, { caseSensitive: true }).length === 1
    }

    protected extendAuthorizations(autorisations: string[]): string[] {
        const resolveExtends = (autorisation: string): string[] => {
            return flatten((this.authorizationsExtensions[autorisation] || []).map(resolveExtends)).concat([autorisation])
        }

        // Uniq need two reverse here,
        //return reverse(uniq(reverse(flatten(autorisations.map(resolveExtends)))))
        return flatten(autorisations.map(resolveExtends))
    }
}

export interface AuthMiddlewareOpts {
    auth: Auth
    realm: string
    requiredAuthorization?: string | ((req: Request) => string) | null
    requiredAuthentication?: boolean
}

export function createAuthMiddleware({auth, realm, requiredAuthorization, requiredAuthentication}: AuthMiddlewareOpts) {
    function demandAuth(res: Response) {
        res.set('WWW-Authenticate', 'Basic realm="'+encodeURIComponent(realm)+'"').status(401).end()
    }

    return function (req: Request&{user?:User|null}, res: Response, next: NextFunction) {
        const userPassFromHeaders = basicAuth(req)

        requiredAuthorization = requiredAuthorization === undefined ? null : requiredAuthorization

        const reqRequiredAuthorization = requiredAuthorization instanceof Function
             ? requiredAuthorization(req)
             : requiredAuthorization

        // Anonym
        if (!userPassFromHeaders) {
            if (requiredAuthentication) {
                return demandAuth(res)
            }

            try {
                auth.ensureAuthorized(null, reqRequiredAuthorization)
                req.user = null
                return next()
            } catch (error) {
                if (!(error instanceof AuthorizationError)) {
                    return next(error)
                }
                return demandAuth(res)
            }
        }

        try {
            const user = auth.authenticate(userPassFromHeaders.name, userPassFromHeaders.pass)
            auth.ensureAuthorized(user, reqRequiredAuthorization)
            req.user = user
            next()
        } catch (error) {
            if (error instanceof AuthenticationError) {
                return demandAuth(res)
            } else if (error instanceof AuthorizationError) {
                res.status(403).end()
                return
            }
            return next(error)
        }
    }
}