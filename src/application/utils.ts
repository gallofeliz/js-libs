import { Logger } from "@gallofeliz/logger"
import { Schedule } from "@gallofeliz/scheduler"

export function logSchedule(schedule: Schedule, logger: Logger) {
    schedule.on('start', () => logger.debug('Starting schedule'))
    schedule.on('stop', () => logger.debug('Stop schedule requested'))
    schedule.on('ended', () => logger.debug('Stopped schedule'))
    schedule.on('over', () => logger.debug('No more next date'))
    schedule.on('scheduled', ({date, uid}) => logger.debug('Scheduling next', {date: date, scheduleRunUid: uid}))
    schedule.on('fn.start', ({uid}) => logger.debug('Starting', {scheduleRunUid: uid}))
    schedule.on('fn.done', ({uid}) => logger.debug('Done', {scheduleRunUid: uid}))
    schedule.on('fn.error', ({uid, error}) => logger.debug('Error', {scheduleRunUid: uid, error}))
    schedule.on('error', ({error}) => logger.debug('Error', {error}))

    return schedule
}
