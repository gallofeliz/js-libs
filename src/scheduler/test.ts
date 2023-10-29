// import { deepEqual, strictEqual } from 'assert'
import { setTimeout as wait } from 'timers/promises'
import { Scheduler, schedule } from '.'
import { once } from 'events'

describe('Scheduler', () => {
    it('test schedule', async () => {
        const sched = schedule({
            fn(infos) {
                console.log('FN', infos, new Date)
            },
            when: {
                times: ['PT2S'],
                limit: 5
            }
        })

        await wait(1500)
        console.log(new Date)
        console.log(sched.getNextTriggerDate())

        await once(sched, 'over')

    }).timeout(10000)

    it('test scheduler', async () => {

        const scheduler = new Scheduler({
            onError(error, id) {
                console.log('error on', id, error)
            }
        })

        scheduler.schedule({
            id: 'test1',
            fn() {
                console.log('FN test 1')
            },
            when: {
                times: ['PT1S'],
                limit: 5
            }
        })

        scheduler.schedule({
            id: 'test2',
            fn() {
                console.log('FN test 2')
            },
            when: ['PT2S']
        })

        scheduler.schedule({
            id: 'test3',
            async fn() {
                throw new Error('Badaoom 3')
            },
            when: {
                times: ['PT3S'],
                limit: 1
            }
        })

        const abortController = new AbortController

        scheduler.start(abortController.signal)

        setTimeout(() => abortController.abort(), 3000)

        await Promise.race([
                Promise.all([
                    once(scheduler, 'schedule[test1].over'),
                    once(scheduler, 'schedule[test2].over')
                ]),
                once(scheduler, 'stop')
            ]
        )


    }).timeout(10000)
/*
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
            schedule: '* /2 * * * * *',
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
*/
})
