import { ChildProcess, spawn } from 'child_process'
import { Logger } from './logger'
import { once, EventEmitter } from 'events'
import { sizeToKiB } from './utils'

interface ProcessConfig {
    logger: Logger
    cmd: string
    args?: string[]
    env?: {[k: string]: string}
    outputStream?: NodeJS.WritableStream
    outputType?: 'text' | 'json' | 'multilineJson'
    killSignal?: NodeJS.Signals
}

export class Process extends EventEmitter {
    protected config: ProcessConfig
    protected logger: Logger
    protected process?: ChildProcess

    constructor(config: ProcessConfig) {
        super()
        this.config = config
        this.logger = config.logger
    }

    public run() {
        if (this.process) {
            throw new Error('Already run')
        }

        setImmediate(() => this._run())
    }

    protected async _run() {
        this.logger.info('Starting process', {
            cmd: this.config.cmd,
            args: this.config.args || [],
            env: this.config.env
        })

        const process = spawn(
            this.config.cmd,
            this.config.args || [],
            {
                ...this.config.killSignal && { killSignal: this.config.killSignal },
                ...this.config.env && {env: this.config.env }
            }
        )

        let stdout: string = ''
        if (this.config.outputStream) {
            this.logger.info('Redirecting outputStream')
            process.stdout.pipe(this.config.outputStream)
        } else {
            process.stdout.on('data', (data) => {
                const strData = data.toString()
                this.logger.info('STDOUT', { data: strData })
                if (!this.config.outputStream) {
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
        if (['text'].includes(this.config.outputType || 'text')) {
            return output
        }

        if (this.config.outputType === 'multilineJson') {
            return output.trim().split('\n').map((line) => JSON.parse(line))
        }

        return JSON.parse(output.trim())
    }

    public abort() {
        if (!this.process || this.process.exitCode !== null) {
            return
        }
        this.logger.info('Killing')
        this.process.kill('SIGINT')
    }
}
