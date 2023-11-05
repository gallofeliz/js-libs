import { httpRequest } from '@gallofeliz/http-request'
import { createLogger } from '@gallofeliz/logger'
import pRetry from 'async-retry'

// https://github.com/gallofeliz/ecoforest-api/blob/master/app.py
// https://github.com/gallofeliz/autostove/blob/master/index.js

export interface StoveSummary {
    status: 'running' | 'stopped' | 'stopping' | 'error' | 'starting' | 'standby'
    configuredPower: number
    burnTemperature: number
}

export class EcoforestStove {
    public start() {
        throw new Error('Nope')
    }

    public stop() {
        throw new Error('Nope')
    }

    public async getSummary(): Promise<StoveSummary> {
        const [data, data3] = await Promise.all([
            this.callStoveAndRetryForShittyErrors(1002),
            this.callStoveAndRetryForShittyErrors(1020)
        ])

        return {
            configuredPower: parseInt(data.consigna_potencia, 10),
            status: this.computeStatusFromInt(parseInt(data.estado, 10)),
            burnTemperature: parseFloat(data3.Th)
        }

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

    protected async callStoveAndRetryForShittyErrors(operationId: number): Promise<any> {
        return pRetry(() => this.callStove(operationId), {retries: 5})
    }

    protected async callStove(operationId: number): Promise<any> {

        const data: string = await httpRequest({
            logger: createLogger(),
            method: 'POST',
            url: 'http://ecoforest/recepcion_datos_4.cgi',
            bodyData: {'idOperacion': operationId},
            bodyType: 'form',
            responseType: 'text'
        })

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
