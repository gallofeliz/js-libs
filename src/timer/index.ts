export interface TimerOpts {
    delay: number
    fn: () => void
    maxDelayUntilStop?: number
}

export function runTimer(opts: TimerOpts) {
    const timer = new Timer(opts)
    timer.start()

    return timer
}

export class Timer {
    protected delay: number
    protected fn: () => void
    protected maxDelayUntilStop?: number
    protected timeout?: NodeJS.Timeout
    protected maxTimeout?: NodeJS.Timeout

    public constructor({delay, maxDelayUntilStop, fn}: TimerOpts) {
        this.delay = delay
        this.fn = fn
        this.maxDelayUntilStop = maxDelayUntilStop
    }

    public start(abortSignal?: AbortSignal) {
        if (abortSignal?.aborted) {
            return
        }
        abortSignal?.addEventListener('abort', () => this.stop())
        if (this.timeout) {
            return
        }
        this.timeout = setTimeout(() => this.onTimeout(), this.delay)
        if (this.maxDelayUntilStop) {
            this.maxTimeout = setTimeout(() => this.onTimeout(), this.maxDelayUntilStop)
        }
    }

    public stop() {
        clearTimeout(this.timeout)
        delete this.timeout
        clearTimeout(this.maxTimeout)
        delete this.maxTimeout
    }

    // public pause() {

    // }

    public reset() {
        if (!this.timeout) {
            return
        }
        clearTimeout(this.timeout)
        this.timeout = setTimeout(() => this.onTimeout(), this.delay)
    }

    protected onTimeout() {
        this.stop()
        // on Error ?
        this.fn()
    }
}
