import got from 'got'
import pRetry from 'async-retry'

// https://github.com/gallofeliz/ecoforest-api/blob/master/app.py
// https://github.com/gallofeliz/autostove/blob/master/index.js

export interface StoveSummary {
    status: 'running' | 'stopped' | 'stopping' | 'error' | 'starting' | 'standby'
    configuredPower: number
    configuredTemperature: number
    burnTemperature: number
    //configuredMaxPower: number
    configuredConvectorSpeedModifierPct: number
    convectorSpeedPct: number
}

export class EcoforestStove {
    public start() {
        throw new Error('Nope')
    }

    public stop() {
        throw new Error('Nope')
    }

    public async getSummary(): Promise<StoveSummary> {
        const [data, data3, /*data4,*/ data5] = await Promise.all([
            this.callStoveAndRetryForShittyErrors(1002),
            this.callStoveAndRetryForShittyErrors(1020),
            //this.callStoveAndRetryForShittyErrors(1096),
            this.callStoveAndRetryForShittyErrors(1061)
        ])

        return {
            configuredPower: parseInt(data.consigna_potencia, 10),
            status: this.computeStatusFromInt(parseInt(data.estado, 10)),
            burnTemperature: parseFloat(data3.Th),
            configuredTemperature: parseFloat(data.consigna_temperatura),
            //configuredMaxPower: parseInt(data4.nivelmax_onoff, 10),
            configuredConvectorSpeedModifierPct: parseFloat(data5.Co),
            convectorSpeedPct: parseFloat(data3.Co),
        }

    }

    public async configurePower(power: number): Promise<void> {
        await this.callStoveAndRetryForShittyErrors(1004, {potencia: power})
    }

    public async configureConvectorSpeedModifier(pct: number): Promise<void> {
        await this.callStoveAndRetryForShittyErrors(1054, {delta_convector: pct})
    }

    protected computeStatusFromInt(statusInt: number): StoveSummary['status'] {
        if (statusInt === 7) {
            return 'running'
        }
        if (statusInt === 0 || statusInt === 1) {
            return 'stopped'
        }
        if (statusInt === 8 || statusInt === -2 || statusInt === 11 || statusInt === 9) {
            return 'stopping'
        }
        if (statusInt < 0) {
            return 'error'
        }
        if (statusInt === 2 || statusInt === 3 || statusInt === 4 || statusInt === 10) {
            return 'starting'
        }
        if (statusInt === 5 || statusInt === 6) {
            return 'running' // It's not fully starting because there is fire, but not fully running because there is no heat
        }
        if (statusInt === 20) {
            return 'standby'
        }

        throw new Error('Unknown')
    }

    protected async callStoveAndRetryForShittyErrors(operationId: number, params?: Record<string, number | string>): Promise<any> {
        return pRetry(() => this.callStove(operationId, params), {retries: 5})
    }

    protected async callStove(operationId: number, params?: Record<string, number | string>): Promise<any> {

        const data: string = await got({
            method: 'POST',
            url: 'http://ecoforest/recepcion_datos_4.cgi',
            //body: ,
            form: {'idOperacion': operationId, ...params},
            timeout: 10000
        }).text()

        if (operationId === 1081) {
            return {}
        }

        const lines: string[] = data.split('\n')

        const code = lines.pop()

        if (code !== '0') {
            throw new Error('Invalid code ' + data)
        }

        const result: Record<string, string> = {}

        for (const line of lines) {
            const [key, ...values] = line.includes('=')
                ? line.split('=').map(e => e.trim())
                : [line.trim(), '']
            result[key] = values.join('=')
        }

        return result
    }
}
