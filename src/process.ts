import { ChildProcess, spawn } from 'child_process'
import { Logger } from './logger'
import { once, EventEmitter } from 'events'
import { AbortError, Duration, durationToMilliSeconds } from './utils'
const { nextTick, env: processEnv } = process
import jsonata from 'jsonata'
import Readable from 'stream'
import { pick } from 'lodash'
import validate, { Schema } from './validate'
import { v4 as uuid } from 'uuid'

export interface ProcessConfig {
    logger: Logger
    command: string | string[]
    shell?: string | string[]
    abortSignal?: AbortSignal
    outputStream?: NodeJS.WritableStream | Process<any>
    outputType?: 'text' | 'multilineText' | 'json' | 'multilineJson'
    outputTransformation?: string
    cwd?: string
    env?: {[k: string]: string}
    killSignal?: NodeJS.Signals
    timeout?: Duration
    inputData?: NodeJS.ReadableStream | Process<any> | any
    inputType?: 'raw' | 'json'
    retries?: number
    resultSchema?: Schema
}

// I don't love this polymorphic return and this last arg (I should prefer two methods) but I don't know how to name them
function runProcess<Result extends any>(config: ProcessConfig, asPromise: true): Promise<Result>
function runProcess<Result extends any>(config: ProcessConfig, asPromise?: false): Process<Result>
function runProcess<Result extends any>(config: ProcessConfig, asPromise: boolean = false): Process<Result> | Promise<Result> {
    const proc = new Process(config)

    if (!asPromise) {
        return proc
    }

    return once(proc, 'finish').then(args => args[0])
}

export default runProcess

/**
 * Needs remove events listeners for GC ?
 */
export class Process<Result extends any> extends EventEmitter {
    protected config: ProcessConfig
    protected logger: Logger
    protected process?: ChildProcess
    protected processPipeError?: Error

    constructor(config: ProcessConfig) {
        super()
        this.config = config // clone to avoid modify the original ?
        this.logger = config.logger.child({ processUid: uuid() })

        if (this.config.inputData instanceof Process) {
            if (this.config.inputData.config.outputType || this.config.inputData.config.outputStream) {
                throw new Error('Input data is process with output')
            }
            this.config.inputData.config.outputStream = this

            this.shareAbortSignal(this.config.inputData)

            this.config.inputData.once('error', (e) => {
                // this.process!.kill('SIGKILL')
                // this.emit('error', e)
                this.processPipeError = e
            })
        }

        if (this.config.outputStream instanceof Process) {
            if (this.config.outputStream.config.inputData || this.config.outputStream.config.inputType) {
                throw new Error('Output stream is process with input')
            }
            this.config.outputStream.config.inputData = this

            this.shareAbortSignal(this.config.outputStream)

            this.once('error', (e) => {
                (this.config.outputStream as Process<any>).processPipeError = e
            })
        }

        if (this.config.outputStream && this.config.outputType) {
            throw new Error('Incompatible both outputType and outputStream')
        }

        if ((this.config.inputData instanceof Process || this.config.inputData instanceof ReadableStream) && this.config.inputType) {
            throw new Error('Incompatible both inputType and inputData stream or process')
        }

        if (config.retries) {
            this.logger.notice('retries configuration not handled yet')
        }

        nextTick(() => this.run())
    }

    protected shareAbortSignal(process2: Process<any>) {
        if (!process2.config.abortSignal) {
            process2.config.abortSignal = this.config.abortSignal
        }
        if (!this.config.abortSignal) {
            this.config.abortSignal = process2.config.abortSignal
        }
    }

    protected async run() {
        if (this.config.abortSignal?.aborted) {
            this.emit('error', new AbortError)
            return
        }

        let spawnCmd: string
        let spawnArgs: string[]

        const shell: string[] = this.config.shell
            ? (
                Array.isArray(this.config.shell)
                ? this.config.shell
                // Test is cmd.exe (and powershell ?)
                : [this.config.shell, '-c']
            )
            // In the this case, we can use 'shell' option of spawn
            :  [/*process.env.SHELL || process.env.ComSpec || */'sh', /* process.env.ComSpec && /d /s /c */'-c']
        const cmd = Array.isArray(this.config.command) ? this.config.command : shell.concat(this.config.command)
        spawnCmd = cmd[0]
        spawnArgs = cmd.slice(1)

        const passEnvKeys = ['PATH', 'USER', 'HOME']
        const env = {...pick(processEnv, passEnvKeys), ...this.config.env || {}}

        this.logger.info('Starting process', {
            // Todo : add spawn informations
            command: this.config.command,
            env,
            cwd: this.config.cwd
        })

        const process = spawn(
            spawnCmd,
            spawnArgs,
            {
                killSignal: this.config.killSignal || 'SIGINT',
                env,
                ...this.config.cwd && { cwd: this.config.cwd },
                signal: this.config.abortSignal,
                timeout: this.config.timeout ? durationToMilliSeconds(this.config.timeout) : undefined
            }
        )
        this.process = process

        if (this.config.inputData instanceof Process) {
            if (this.config.inputData.process) {
                if (!this.config.inputData.process.stdout!.readable) {
                    this.emit('error', Error('Unable to redirecting outputStream from other process'))
                }
                this.logger.info('Redirecting inputStream from other process')
                this.config.inputData.process.stdout!.pipe(process.stdin)
            }
        } else if (this.config.inputData instanceof Readable) {
            this.config.inputData.pipe(process.stdin)
        } else if (this.config.inputData) {
            const data = this.config.inputType === 'json'
                ? JSON.stringify(this.config.inputData)
                : this.config.inputData
            process.stdin.write(data, () => process.stdin.end())
        } else {
            process.stdin.end()
        }

        let stdout: string = ''

        if (this.config.outputStream) {
            if (this.config.outputStream instanceof Process) {
                if (this.config.outputStream.process) {
                    if (!this.config.outputStream.process.stdin!.writable) {
                        this.emit('error', Error('Unable to redirecting outputStream to other process'))
                        return
                    }
                    this.logger.info('Redirecting outputStream to other process')
                    process.stdout.pipe(this.config.outputStream.process.stdin!)
                }
            } else {
                this.logger.info('Redirecting outputStream')
                process.stdout.pipe(this.config.outputStream)
            }
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
            if (this.processPipeError) {
                throw new Error('ProcessPipeError : ' + this.processPipeError.message)
            }
        } catch (e) {
            return this.emit('error', e)
        }

        if (this.config.outputStream) {
            return this.emit('finish')
        }

        const output = this.getOutputData(stdout)
        const result = this.config.outputTransformation
            ? await jsonata(this.config.outputTransformation).evaluate(output)
            : output

        return this.emit('finish', this.config.resultSchema
            ? validate<Result>(result, {schema: this.config.resultSchema})
            : result as Result
        )
    }

    protected getOutputData(output: string) {
        if (!this.config.outputType) {
            return
        }

        if (this.config.outputType === 'multilineText') {
            return output.trim().split('\n')
        }

        if (['text'].includes(this.config.outputType || 'text')) {
            return output.trim()
        }

        if (this.config.outputType === 'multilineJson') {
            return output.trim().split('\n').map((line) => JSON.parse(line))
        }

        return JSON.parse(output.trim())
    }
}
