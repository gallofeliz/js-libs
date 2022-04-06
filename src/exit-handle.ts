export function handleExitSignals(cb?: Function) {
    const signals = ['SIGTERM', 'SIGINT'] // Term + Docker

    const handler = () => {
        if (!cb) {
            process.exit(0)
        }
        cb()
    }

    signals.forEach(signal => {
        process.on(signal, handler)
    })
}
