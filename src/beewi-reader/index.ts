import { runProcess } from '@gallofeliz/run-process'
import { UniversalLogger } from '@gallofeliz/logger'
import pRetry from 'async-retry'

export async function readBeewiDevice(opts: BeewiDeviceReaderOpts): Promise<BeewiReadResult> {
    return (new BeewiDeviceReader(opts)).read()
}

export interface BeewiReadResult {
    temperature: number
    humidity: number
    battery: number
}

export interface BeewiDeviceReaderOpts {
    device: string
    hmac: string
    logger: UniversalLogger
}

export class BeewiDeviceReader {
    protected opts: Partial<BeewiDeviceReaderOpts>

    constructor(opts: Partial<BeewiDeviceReaderOpts> = {}) {
        this.opts = opts
    }

    public read(abortSignal?: AbortSignal): Promise<BeewiReadResult>
    public read(opts?: Partial<BeewiDeviceReaderOpts> & { abortSignal?: AbortSignal }): Promise<BeewiReadResult>

    public async read(abortSignalOrOpts: AbortSignal | Partial<BeewiDeviceReaderOpts> & { abortSignal?: AbortSignal } = {}): Promise<BeewiReadResult> {
        const argIsAbortSignal = abortSignalOrOpts instanceof AbortSignal
        const abortSignal = argIsAbortSignal
            ? abortSignalOrOpts
            : abortSignalOrOpts.abortSignal

        const {logger, device, hmac} = {
            ...this.opts,
            ...argIsAbortSignal ? {} : abortSignalOrOpts
        }

        if (!logger || !device || !hmac) {
            throw new Error('Missing one of opts')
        }

        const v: string = await pRetry(
            () => runProcess({
                logger,
                command: ['gatttool', '-i', device, '-b', hmac, '--char-read', '--handle=0x003f'],
                timeout: 10000,
                outputType: 'text',
                abortSignal
            }),
            { retries: 3, }
        )

        const octetList = v.split(':')[1].trim().split(' ')

        return {
          'temperature': (() => {

            let temperature = parseInt(octetList[2] + octetList[1], 16)
            if (temperature > 0x8000) {
              temperature = temperature - 0x10000
            }

            return temperature / 10

          })(),
          'humidity': parseInt(octetList[4], 16),
          'battery': parseInt(octetList[9], 16)
       }
    }
}
