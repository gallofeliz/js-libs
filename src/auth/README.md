# Auth

Authentication/Authorization:
- [✓] Support Apache generated credentials
- [✓] Authenticate users
- [✓] Authorize users/guest(anonym) with authorizations
- [✓] Express Middleware with static requiredAuthorization or request generated requiredAuthorization
- [✓] Free authorizations nomenclature, example :
  - namespace.operation-resource[id]
  - namespace.resource[id].operation
  - resource
  - operation
  - namespace/resource/id/operation
  - What you want ! But caution that read-article-* matches read-article-33 but also read-article-333 and read-article-author-email
- [-] Multi requireAuth for example to separate operations to resources (['operation.article.write', 'resource.article[\*]'])
- [ ] Complexe resources/actions like require(['action=read', 'article.category=sport', 'article.tag=swim', 'article.tag=international'] and user having ['action=read', 'article.category=sport', 'article.category=hobbies', 'article.tag=\*'] to be able to read articles only about sport or hobbies, but with any tag). Why not an object, for user {action: read, article.category: [sport, hobbies], article.tag: \* } and for require {action: read, article.category: sport, article.tag: [swim, international]} and why not deep {article: {category: ..., tags: ...}}
=> see https://github.com/stalniy/casl

```typescript
import { Auth, createAuthMiddleware } from '.'

const auth = new Auth({
    users: [
        { username: 'Paul', password: 'secret', autorisations: ['role-user'] },
        { username: 'Mélanie', password: 'verySecret', autorisations: ['role-admin'] },
        { username: 'admin', password: 'veryVerySecret', autorisations: ['*', '!users.remove-admin'] },
        { username: '33reader', password: 'secret', autorisations: ['blog.read-article[33]'] },
        { username: 'no33reader', password: 'secret', autorisations: ['blog.read-article[*]', '!blog.read-article[33]'] }
    ],
    anonymAutorisations: ['blog.read-*', 'blog.write-public'],
    authorizationsExtensions: {
        'role-user': ['blog.read-*', 'blog.write-*', 'whoiam'],
        'role-admin': ['role-user', 'users.remove-user']
    }
})

auth.authenticate('Mélanie', 'test') // AuthenticationError

const Mélanie = auth.authenticate('Mélanie', 'verySecret')

auth.ensureAuthorized(Mélanie, 'users.remove-admin') // AuthorizationError
auth.ensureAuthorized(Mélanie, 'blog.write-article-55')

const server = app()

server.get(
    '/whoiam',
    createAuthMiddleware({auth, realm: 'abc', requiredAuthorization: 'whoiam'}),
    (req, res) => {
        res.send(req.user.username)
    }
)

server.get(
    '/article/:id',
    createAuthMiddleware({auth, realm: 'abc', requiredAuthorization: ({params}) => 'blog.read-article[' + params.id + ']'}),
    (req, res) => {
        res.end()
    }
)
```
