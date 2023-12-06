// Require the framework and instantiate it

// ESM
import Fastify from 'fastify'

import swagger from '@fastify/swagger'

import swaggerUi from '@fastify/swagger-ui'

import fs from 'fs'

const fastify = Fastify({
  logger: true,
  genReqId() { return Math.random().toString() }
})

fastify.addHook('onRequest', async (request) => {
  console.log(request.id, request.url)
})

const start = async () => {

await fastify.register(swagger
  , {
  openapi: {
    info: {
      title: 'Test swagger',
      description: 'Testing the Fastify swagger API',
      version: '0.1.0'
    },
    servers:[
      {url: 'http://127.0.0.1:3000'},
    ]
  }
})

await fastify.register(swaggerUi, {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  },
  uiHooks: {
    onRequest: function (request, reply, next) { next() },
    preHandler: function (request, reply, next) { next() }
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  transformSpecification: (swaggerObject, request, reply) => { return swaggerObject },
  transformSpecificationClone: true
})


// fastify.get('/stream', {
//   schema: {
//     response: {
//       200: {
//         content: {
//           'text/js': {
//             schema: {type: 'text'}
//           }

//         }
//       }
//     }
//   }
// }, function (request, reply) {

//   reply.type('application/js')

//   return fs.createReadStream('index.js')


// })

fastify.get<{
  Querystring: {age: number},
  Params: {name: string}
}>('/user/:name', {
  schema: {
    params: {
      type: 'object',
      properties: {
        name: {type: 'string', minLength: 1}
      }
    },
    querystring: {
      type: 'object',
        properties: {
        age: {type: 'number'}
      },
      required:['age']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          name: {type: 'string'},
          age: {type: 'number'}
        }
      }
    }
  }
}, async function (request, reply) {
  return {
    name: request.params.name,
    age: request.query.age,
    city: 'Paris'
  }
})


  try {
    console.log(await fastify.listen({ port: 3000 }))

  } catch (err) {
    console.log(err)
    process.exit(1)
  }
}
start()

setTimeout(() => {
  fastify.close()
}, 60000)

