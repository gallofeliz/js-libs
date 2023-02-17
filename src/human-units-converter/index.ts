/** @pattern ^[0-9]+[smhdwSMHDW]$ */
export type Duration = string

// 5 weeks 7 days maybe later
// Can use https://www.npmjs.com/package/parse-duration (or https://www.npmjs.com/package/convert-pro) and support ISO duration (P3M) https://www.npmjs.com/package/iso8601-duration
export function durationToSeconds(duration: Duration): number {
    const mapping = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400, 'w': 604800}
    return parseInt(duration.substring(0, duration.length - 1), 10) * mapping[duration.substr(-1).toLowerCase() as 's' | 'm' | 'h' | 'd' | 'w']
}

export function durationToMilliSeconds(duration: Duration): number {
    return durationToSeconds(duration) * 1000
}
