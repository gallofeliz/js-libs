import { ChildProcess, spawn } from 'child_process'
import { UniversalLogger } from '@gallofeliz/logger'
import { once, EventEmitter } from 'events'
const { env: processEnv } = process
import jsonata from 'jsonata'
import Readable from 'stream'
import { pick } from 'lodash'
import { validate, SchemaObject } from '@gallofeliz/validate'
import { v4 as uuid } from 'uuid'

export type ProcessConfig = {
    logger: UniversalLogger
    command: string | string[]
    shell?: string | string[]
    strictShell?: boolean
    //shellRcProfile?: boolean
    //autoshell
    outputStream?: NodeJS.WritableStream
    outputType?: 'text' | 'multilineText' | 'json' | 'multilineJson'
    outputTransformation?: string
    cwd?: string
    env?: {[k: string]: string}
    killSignal?: NodeJS.Signals
    timeout?: number
    inputData?: NodeJS.ReadableStream | Process<any> | any
    inputType?: 'raw' | 'json'
    retries?: number
    resultSchema?: SchemaObject
    uid?: number
    gid?: number
}

export async function runProcess<Result extends any>({abortSignal, ...config}: ProcessConfig & { abortSignal?: AbortSignal }): Promise<Result> {
    const process = createProcess<Result>(config)

    return await process.run(abortSignal)
}

export function createProcess<Result extends any>(config: ProcessConfig): Process<Result> {
    return new Process(config)
}

/**
 * Needs remove events listeners for GC ?
 */
export class Process<Result extends any> extends EventEmitter {
    protected config: ProcessConfig
    protected logger: UniversalLogger
    protected process?: ChildProcess

    constructor(config: ProcessConfig) {
        super()
        this.config = config // clone to avoid modify the original ?
        this.logger = config.logger.child({ processUid: uuid() })

        if (this.config.inputData instanceof Process) {
            if (this.config.inputData.config.outputType || this.config.inputData.config.outputStream) {
                throw new Error('Input data is process with output')
            }
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
    }

    public async run(abortSignal?: AbortSignal): Promise<Result> {
        if (this.process) {
            throw new Error('Already running or run')
        }

        if (abortSignal?.aborted) {
            throw abortSignal.reason
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

        if (!Array.isArray(this.config.shell)) {
            if (this.config.strictShell !== false) {
                shell.push('-e', '-u')

                if (shell[0] === 'bash') {
                    shell.push('-o', 'pipefail')
                }
            }
            if (/*!this.config.shellRcProfile && */shell[0] === 'bash') {
                shell.splice(1, 0, '--norc', '--noprofile')
            }
            /* if autoShell, use $SHELL env to select shell */
        }

        const cmd = Array.isArray(this.config.command) ? this.config.command : shell.concat(this.config.command)
        spawnCmd = cmd[0]
        spawnArgs = cmd.slice(1)

        const passEnvKeys = ['PATH', 'USER', 'HOME', 'SHELL']
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
                signal: abortSignal,
                timeout: this.config.timeout,
                uid: this.config.uid,
                gid: this.config.gid
            }
        )
        this.process = process

        let inputDataProcessError: Error | undefined

        if (this.config.inputData instanceof Process) {
            if (this.config.inputData.process) {
                throw new Error('Other process already started')
            }
            this.config.inputData.run(abortSignal).catch(e => {
                inputDataProcessError = e
                this.process!.kill('SIGKILL')
            })
            if (!this.config.inputData.process!.stdout!.readable) {
                throw new Error('Unable to redirecting outputStream from other process')
            }
            this.logger.info('Redirecting inputStream from other process')
            this.config.inputData.process!.stdout!.pipe(process.stdin)
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
                throw new Error('Process error : ' + stderr.trim())
            }
        } catch (e) {
            if (e === abortSignal?.reason) {
                this.logger.info('Abort requested, awaiting process ends')
                await once(process, 'exit')
            }
            throw e
        }
        if (inputDataProcessError) {
            throw new Error('ProcessPipeError : ' + inputDataProcessError.message)
        }

        if (this.config.outputStream) {
            return undefined as Result
        }

        const output = this.getOutputData(stdout)
        const result = this.config.outputTransformation
            ? await jsonata(this.config.outputTransformation).evaluate(output)
            : output

        return this.config.resultSchema
            ? validate<Result>(result, {schema: this.config.resultSchema})
            : result as Result
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
