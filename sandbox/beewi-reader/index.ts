import execa from 'execa'
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

        const {device, hmac} = {
            ...this.opts,
            ...argIsAbortSignal ? {} : abortSignalOrOpts
        }

        if (!device || !hmac) {
            throw new Error('Missing one of opts')
        }

        const v = await pRetry(
            async (bail) => {
                const proc = execa(
                    'gatttool',
                    ['-i', device, '-b', hmac, '--char-read', '--handle=0x003f'],
                    { timeout: 10000 }
                )

                abortSignal?.addEventListener('abort', () => {
                    bail(abortSignal.reason)
                    proc.cancel()
                })

                return (await proc).stdout
            },
            { retries: 3 }
        ) as string

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
