import runProcess from '../src/process'
import { once } from 'events'
import createLogger from '../src/logger'
import HttpServer from '../src/http-server'
import loadConfig from '../src/config'

console.log(loadConfig({filename: __dirname + '/config.yml', envPrefix: 'app', defaultValues: { 'machin2.port': 443 }}))

const server = new HttpServer({
    logger: createLogger('info'),
    port: 8080,
    auth: {
        users: [{
            username: 'admin',
            password: 'verysecret'
        }]
    },
    webUiFilesPath: __dirname + '/webui',
    api: {
        prefix: '/api',
        routes: [
            {
                method: 'get',
                path: '/download',
                async handler(req, res) {
                    const url = req.query.url as string
                    const type = req.query.type || 'video'

                    const process = runProcess({
                        cmd: 'youtube-dl',
                        args: type === 'audio' ? ['-j', '-x', url] : ['-j', url],
                        logger: createLogger('info'),
                        outputType: 'json'
                    })

                    const [result] = await once(process, 'finish')

                    console.log(`The video is ${result.fulltitle}`)

                    console.log(`The thumb is ${result.thumbnail}`)

                    console.log(result)

                    console.log(result.filesize)

                    res.header('Content-Disposition', 'attachment; filename="'+result._filename+'"')

                    if (type === 'audio') {
                        res.header('Content-Length', result.filesize.toString())
                    }

                    const process2 = runProcess({
                        cmd: 'youtube-dl',
                        args:  type === 'audio' ? ['-f', result.format_id, url, '-o', '-'] : [url, '-o', '-'],
                        logger: createLogger('info'),
                        outputStream: res
                    })

                    await once(process2, 'finish')

                    res.end()
                }
            }
        ]
    }
})


server.start().then(() => console.log('Go Go Go'))
