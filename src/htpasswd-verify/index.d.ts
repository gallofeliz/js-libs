export default class HtpasswdValidator {
    constructor(listOrDict?: string[] | Record<string, string>)
    verifyUsername(inputUsername: string, username: string): boolean
    verifyPassword(inputPassword: string, passwordHash: string): boolean
    verifyCredentials(inputUsername: string, inputPassword: string, userpassHash: string): boolean
    verifyCredentials(inputUsername: string, inputPassword: string, username: string, passwordHash: string): boolean
    verify(inputUsername: string, inputPassword: string): boolean
}
