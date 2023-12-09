import { EcoforestStove } from ".";

describe('EcoforestStove', () => {
    it('getSummary', async () => {
        const stove = new EcoforestStove

        console.log(await stove.getSummary())

    }).timeout(10000)

    it('configureConvectorSpeedModifier', async () => {
        const stove = new EcoforestStove

        await stove.configureConvectorSpeedModifier(0)

    }).timeout(10000)

    it('configurePower', async () => {
        const stove = new EcoforestStove

        await stove.configurePower(2)

    }).timeout(10000)

})

