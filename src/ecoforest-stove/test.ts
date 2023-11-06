import { setTimeout } from "timers/promises";
import { EcoforestStove } from ".";

describe('EcoforestStove', () => {
    it('getSummary', async () => {
        const stove = new EcoforestStove

        console.log(await stove.getSummary())

    }).timeout(10000)

    it('configurePower', async () => {
        const stove = new EcoforestStove

        await stove.configurePower(2)

        await setTimeout(5000)

        await stove.configurePower(EcoforestStove.MAX_CONFIGURED_POWER)

    }).timeout(10000)

})

