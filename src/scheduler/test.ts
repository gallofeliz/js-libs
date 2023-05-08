import { deepEqual, strictEqual } from 'assert'
import { setTimeout as wait } from 'timers/promises'
import { Scheduler } from '.'
import { createLogger } from '@gallofeliz/logger'

describe('Scheduler', () => {

    it('test interval', async () => {
        const scheduler = new Scheduler({logger: createLogger()})

        const triggers: Date[] = []

        scheduler.addSchedule({
            id: 'baba',
            fn(arg) {
                console.log('called', arg, new Date)
                triggers.push(new Date)
            },
            schedule: 1000*2,
            limit: 3
        })

        scheduler.start()

        setTimeout(() => console.log(scheduler.getNextTriggerDate('baba')), 500)

        await wait(9000)

        scheduler.stop()

        strictEqual(triggers.length, 3)

        strictEqual(Math.round((triggers[2].getTime() - triggers[0].getTime()) / 20) * 20, 4000)

        console.log(scheduler.getNextTriggerDate('baba'))

    }).timeout(10000)

    it('test1', async () => {

        const scheduler = new Scheduler({logger: createLogger()})

        const triggers: Date[] = []

        scheduler.addSchedule({
            id: 'baba',
            fn(arg) {
                console.log('called', arg)
                triggers.push(new Date)
            },
            schedule: '*/2 * * * * *',
            limit: 3
        })

        scheduler.start()

        setTimeout(() => console.log(scheduler.getNextTriggerDate('baba')), 500)

        await wait(9000)

        scheduler.stop()

        strictEqual(triggers.length, 3)

        strictEqual(Math.round((triggers[2].getTime() - triggers[0].getTime()) / 10) * 10, 4000)

        console.log(scheduler.getNextTriggerDate('baba'))

    }).timeout(10000)

    it('test2', async () => {
        let onErrorCall

        const scheduler = new Scheduler({
            logger: createLogger(),
            onError(error, id) {
                onErrorCall = [error, id]
            }
        })

        const uglyError = new Error('Ugly')

        scheduler.addSchedule({
            id: 'baba',
            fn: async() => {
                throw uglyError
            },
            schedule: '* * * * * *',
        })

        scheduler.start()

        await wait(1000)

        scheduler.stop()

        deepEqual(onErrorCall, [uglyError, 'baba'])
    }).timeout(2000)

})
