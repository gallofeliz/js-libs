import { ExitCodes } from '.'
import assert from 'assert'
import { spawn } from 'child_process'
import { once } from 'events'
import { setTimeout } from 'timers/promises'

describe('Application', () => {

    it('simple', async() => {
        const proc = spawn(
            'ts-node',
            ['-C', 'ttypescript', __dirname + '/tests/simple.ts'],
            { stdio: 'inherit', env: {
                application_httpEndpoint: 'https://jsonplaceholder.typicode.com/todos/1',
                application_query: 'title'
            } }
        )

        const [exitCode] = await once(proc, 'exit')

        assert.strictEqual(exitCode, 0)
    }).timeout(5000)

    it('simple abort', async() => {
        const proc = spawn(
            'ts-node',
            ['-C', 'ttypescript', __dirname + '/tests/simple.ts'],
            { stdio: 'inherit', env: { application_httpEndpoint: 'http://99.99.99.99', application_log_level: 'debug' } }
        )

        await setTimeout(3000)
        proc.kill('SIGINT')

        const [exitCode] = await once(proc, 'exit')

        assert.strictEqual(exitCode, ExitCodes.SIGINT)
    }).timeout(10000)

})

