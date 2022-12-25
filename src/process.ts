import { ChildProcess, spawn } from 'child_process'
import { Logger } from './logger'
import { once, EventEmitter } from 'events'
import { sizeToKiB, AbortError } from './utils'
const { nextTick } = process

export interface ProcessConfig {
    logger: Logger
    cmd: string
    args?: string[]
    cwd?: string
    env?: {[k: string]: string}
    outputStream?: NodeJS.WritableStream
    outputType?: 'text' | 'multilineText' | 'json' | 'multilineJson'
    killSignal?: NodeJS.Signals
    abortSignal?: AbortSignal
}

// I don't love this polymorphic return and this last arg (I should prefer two methods) but I don't know how to name them
function runProcess(config: ProcessConfig, asPromise: true): Promise<any>
function runProcess(config: ProcessConfig, asPromise?: false): Process
function runProcess(config: ProcessConfig, asPromise: boolean = false): Process | Promise<any> {
    const proc = new Process(config)

    if (!asPromise) {
        return proc
    }

    return once(proc, 'finish').then(args => args[0])
}

export default runProcess

export class Process extends EventEmitter {
    protected config: ProcessConfig
    protected logger: Logger
    protected process?: ChildProcess
    protected abortController = new AbortController

    constructor(config: ProcessConfig) {
        super()
        this.config = config
        this.logger = config.logger

        if (this.config.outputStream && this.config.outputType) {
            throw new Error('Incompatible both outputType and outputStream')
        }

        this.run()
    }

    public abort() {
        if (!this.process || this.process.exitCode !== null || this.process.killed) {
            return
        }
        this.logger.info('Abort Killing')
        //this.process.kill('SIGINT')
        this.abortController.abort()
    }

    protected async run() {
        if (this.config.abortSignal?.aborted) {
            nextTick(() => this.emit('error', new AbortError))
            return
        }

        this.logger.info('Starting process', {
            cmd: this.config.cmd,
            args: this.config.args || [],
            env: this.config.env,
            cwd: this.config.cwd
        })

        const onSignalAbort = () => this.abort()

        if (this.config.abortSignal) {
            this.config.abortSignal.addEventListener('abort', onSignalAbort, {once: true})
        }

        const process = spawn(
            this.config.cmd,
            this.config.args || [],
            {
                killSignal: this.config.killSignal || 'SIGINT',
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
                throw new Error('Process error : ' + stderr)
            }
        } catch (e) {
            return this.emit('error', e)
        } finally {
            if (this.config.abortSignal) {
                this.config.abortSignal.removeEventListener('abort', onSignalAbort)
            }
        }

        return this.emit('finish', !this.config.outputStream ? this.getOutputData(stdout) : undefined)
    }

    protected getOutputData(output: string) {
        if (!this.config.outputType) {
            return
        }

        if (this.config.outputType === 'multilineText') {
            return output.trim().split('\n')
        }

        if (['text'].includes(this.config.outputType || 'text')) {
            return output
        }

        if (this.config.outputType === 'multilineJson') {
            return output.trim().split('\n').map((line) => JSON.parse(line))
        }

        return JSON.parse(output.trim())
    }
}
