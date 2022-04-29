import { ChildProcess, spawn } from 'child_process'
import { Logger } from './logger'
import { once, EventEmitter } from 'events'
import { sizeToKiB } from './utils'

interface ProcessConfig {
    logger: Logger
    cmd: string
    args?: string[]
    cwd?: string
    env?: {[k: string]: string}
    outputStream?: NodeJS.WritableStream
    outputType?: 'text' | 'multilineText' | 'json' | 'multilineJson'
    killSignal?: NodeJS.Signals
}

interface ProcessPromise<T> extends Promise<T> {
    abort: () => void
}

export default function runProcess(config: ProcessConfig) {
    return new Process(config)
}

export function runPromisedProcess<Output>(config: ProcessConfig) {
    const process = new Process(config)

    const promis: ProcessPromise<Output> = once(process, 'finish').then(r => r[0]) as any as ProcessPromise<Output>

    promis.abort = () => process.abort()

    return promis
}

export class Process extends EventEmitter {
    protected config: ProcessConfig
    protected logger: Logger
    protected process?: ChildProcess
    protected abortController = new AbortController

    constructor(config: ProcessConfig) {
        super()
        this.config = config
        this.logger = config.logger

        if (this.config.outputStream && this.config.outputType) {
            throw new Error('Incompatible both outputType and outputStream')
        }

        this.run()
    }

    public abort() {
        if (!this.process || this.process.exitCode !== null) {
            return
        }
        this.logger.info('Killing')
        //this.process.kill('SIGINT')
        this.abortController.abort()
    }

    protected async run() {
        this.logger.info('Starting process', {
            cmd: this.config.cmd,
            args: this.config.args || [],
            env: this.config.env,
            cwd: this.config.cwd
        })

        const process = spawn(
            this.config.cmd,
            this.config.args || [],
            {
                killSignal: this.config.killSignal || 'SIGINT',
                ...this.config.env && { env: this.config.env },
                ...this.config.cwd && { cwd: this.config.cwd },
                signal: this.abortController.signal
            }
        )
        this.process = process

        let stdout: string = ''

        if (this.config.outputStream) {
            this.logger.info('Redirecting outputStream')
            process.stdout.pipe(this.config.outputStream)
        } else {
            process.stdout.on('data', (data) => {
                const strData = data.toString()
                this.logger.info('STDOUT', { data: strData })
                if (!this.config.outputStream && this.config.outputType) {
                    stdout += strData
                }
            })

            // todo emit
        }

        let stderr: string = ''
        process.stderr.on('data', data => {
            const strData = data.toString()
            this.logger.info('STDERR', { data: strData })
            stderr += strData

            // todo emit
        })

        try {
            const [exitCode]: [number] = await once(process, 'exit') as [number]
            this.logger.info('exitCode ' + exitCode)
            if (exitCode > 0) {
                return this.emit('error', new Error('Process error : ' + stderr))
            }
        } catch (e) {
            return this.emit('error', e)
        }

        if (this.config.outputStream) {
            return this.emit('finish')
        }

        this.emit('finish', this.getOutputData(stdout))
    }

    protected getOutputData(output: string) {
        if (!this.config.outputType) {
            return
        }

        if (this.config.outputType === 'multilineText') {
            return output.trim().split('\n')
        }

        if (['text'].includes(this.config.outputType || 'text')) {
            return output
        }

        if (this.config.outputType === 'multilineJson') {
            return output.trim().split('\n').map((line) => JSON.parse(line))
        }

        return JSON.parse(output.trim())
    }
}
