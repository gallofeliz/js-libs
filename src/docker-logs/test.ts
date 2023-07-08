import { createLogger } from '@gallofeliz/logger'
import { DockerLogs } from '.'

describe('docker logs', () => {
    it('no test', () => {
        new DockerLogs({logger: createLogger()})
    })
})
