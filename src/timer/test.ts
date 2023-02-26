import {Timer} from '.'
import { setTimeout } from 'timers/promises'

describe('Timer', () => {

    it('test1a', async () => {

        const timer = new Timer({
            fn() {
                console.log('Time out !')
            },
            delay: 100,
            maxDelayUntilStop: 250
        })

        timer.start()

        await setTimeout(150)

        console.log('end ; should be triggered')

    })

    it('test1b', async () => {

        const timer = new Timer({
            fn() {
                console.log('Time out !')
            },
            delay: 100
        })

        timer.start()

        await setTimeout(150)

        console.log('end ; should be triggered')

    })

    it('test2', async () => {

        const timer = new Timer({
            fn() {
                console.log('Time out !')
            },
            delay: 100,
            maxDelayUntilStop: 250
        })

        timer.start()

        for(let i = 0; i < 12; i++) {
            await setTimeout(50)
            console.log('Reset')
            timer.reset()
        }

        console.log('end, should be triggered with reset before and after')

        await setTimeout(270)

    })

    it('test3', async () => {

        const abortController = new AbortController

        const timer = new Timer({
            fn() {
                console.log('Time out !')
            },
            delay: 100
        })

        timer.start(abortController.signal)

        await setTimeout(50)

        abortController.abort()

        await setTimeout(100)

        console.log('end ; should not be triggered')

    })

    it('test4', async () => {

        const timer = new Timer({
            fn() {
                console.log('Time out !')
            },
            delay: 100
        })

        timer.start()

        await setTimeout(150)

        timer.start()

        await setTimeout(150)

        timer.start()

        await setTimeout(150)

        console.log('end ; should be triggered 3x')

    })
})