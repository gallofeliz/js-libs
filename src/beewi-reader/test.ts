import { readBeewiDevice, BeewiDeviceReader } from '.'
import { setTimeout } from 'timers/promises'
import assert from 'assert'

describe('Beewi reader', () => {
    it('readBeewiDevice', async () => {
        console.log(await readBeewiDevice({
            device: 'hci0',
            hmac: '20:91:48:48:E5:96'
        }))
    }).timeout(10000)

    describe('BeewiDeviceReader', () => {

        it('Scoped to hmac', async () => {
            const reader = new BeewiDeviceReader({
                device: 'hci0',
                hmac: '20:91:48:48:E5:96'
            })

            console.log(await reader.read())

        }).timeout(10000)

        it('Scoped to device', async () => {
            const reader = new BeewiDeviceReader({
                device: 'hci0'
            })

            console.log(await reader.read({hmac: '20:91:48:48:E5:96'}))

        }).timeout(10000)

        it('Just a reader', async () => {
            const reader = new BeewiDeviceReader({
            })

            console.log(await reader.read({hmac: '20:91:48:48:E5:96', device: 'hci0'}))

        }).timeout(10000)

        it('Interrupt', async () => {
            const reader = new BeewiDeviceReader({
                device: 'hci0',
                hmac: '20:91:48:48:E5:96',
            })

            const ac = new AbortController

            const r = reader.read({abortSignal: ac.signal})

            await setTimeout(10, undefined)

            ac.abort()

            try {
                await r
                assert.fail('Should not sucess')
            } catch (e) {
                assert((e as Error).name === 'AbortError', e as Error)
            }
        }).timeout(10000)

    })

})
