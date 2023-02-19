# Http Server

Advanced Http Server:
- [✓] Simple declaration
- [✓] Logged
- [✓] Server public path
- [✓] Simple users and ACL management
- [✓] Swagger UI & document auto generated
- [✓] Validate query, params and input body
- [✓] Input/Output transformation depending on Request/Response Accept/Content-Type headers
- [✓] Error handling (async use)
- [✓] Auto close Response (async use)
- [✓] Abortable
- [-] Well tested :(

Examples

```typescript
import { runServer }

runServer({
    abortSignal,
    port: 80,
    logger,
    auth: {
        users: [
            { username: 'Mélanie', password: 'secret', autorisations: ['role-user'] },
            { username: 'admin', password: 'secret', autorisations: ['role-admin'] },
        ],
        anonymAutorisations: ['login', 'article[*].read'],
        authorizationsExtensions: {
            'role-user': ['logout', 'article[*].read', 'article[*].write'],
            'role-admin': ['role-user', 'article[*].publish', 'users[*].delete', '!users[admin].delete']
        }
    },
    api: {
        routes: [
            {
                description: 'Welcome route !',
                path: '/welcome',
                outputBodySchema: tsToJsSchema<Welcome>(),
                async handler(_, {send}) {
                    send({message: 'Welcome !'})
                }
            },
            {
                method: 'GET',
                inputParamsSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'number' }
                    }
                },
                inputQuerySchema: {
                    type: 'object',
                    properties: {
                        full: { type: 'boolean' }
                    }
                },
                outputBodySchema: {
                    type: 'string'
                },
                path: '/article/:id',
                requiredAuthorization(res) { return 'article['+ res.params.id +'].read' },
                async handler({query, params, user, auth}: HttpServerRequest<{id: number}, {full: boolean}>, {send}: HttpServerResponse<string>) {

                    const article = articleService.get(params.id, { full: query.full })

                    send({
                        article,
                        writable: auth.isAuthorized(user, 'article[' + params.id + '].write'),
                        publishable: auth.isAuthorized(user, 'article[' + params.id + '].publish')
                    })
                }
            }
        ]
    }
})
```