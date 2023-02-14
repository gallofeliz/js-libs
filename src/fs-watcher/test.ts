import { createLogger } from '@gallofeliz/logger'
import { strictEqual } from 'assert'
import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { watchFs } from '.'

describe('Fs-Watcher', () => {
    it('test', async () => {

        const abortController = new AbortController

        execSync('rm -Rf /tmp/watched && mkdir /tmp/watched')

        setTimeout(() => {
            writeFileSync('/tmp/watched/file.txt', 'Helo')
            setTimeout(() => {
                writeFileSync('/tmp/watched/file.txt', 'Hello')
            }, 50)
        }, 50)

        let nbCalls = 0

        watchFs({
            abortSignal: abortController.signal,
            logger: createLogger(),
            fn() {
                nbCalls++
            },
            paths: ['/tmp/watched']
        })

        await new Promise(resolve => setTimeout(() => {
            abortController.abort()
            resolve(undefined)
        }, 250))

        strictEqual(nbCalls, 2)
    })
})