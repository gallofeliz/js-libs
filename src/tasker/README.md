# Tasker

Tasks Management with persistance (non-distributed):
- [✓] Persisted (json-compatible tasks)
    - addTask(addTaskDef)
- [✓] Assign runners
    - assignRunner(operation, runner)
- [✓] Support start/stop (attach runners)
    - start(abortSignal?)
    - stop()
- [✓] Abortable
    - abortTask(uuid, reason?)
- [✓] Prioritization
    - Task priority opt (-Infinity to Infinity, ASC)
    - prioritizeTask(uuid, priority)
- [✓] Public methods to search etc tasks
    - getTask(uuid, { withLogs, logsMaxLevel })
    - hasTask(query)
    - findTask(query, { sort, withLogs, logsMaxLevel })
    - findTasks(query, { sort, limit, skip, withLogs, logsMaxLevel })
- [✓] Easy wait for result and stream logs for a task
    - waitForTaskOutputData(uuid)
    - listenTaskLogs(uuid, { fromBeginning, abortSignal })
- [✓] Concurrency with criteria
    - Task conccurency conditions [{ scope: 'running', query: { 'data.book': book }, limit: 1}] // avoid running more than 2 same book run
- [✓] Task Timeout / Stop after time
    - Task runTimeout opt
- [✓] Events
    - started()
    - stopped()
    - task.add(AddTask)
    - task.added(uuid)
    - task.prioritized(uuid, priority)
    - task.XXX.prioritized(priority)
    - task.aborted(uuid, reason)
    - task.XXX;aborted(reason)
    - task.run(uuid)
    - task.XXX.run()
    - task.log(uuid, log)
    - task.XXX.log(log)
    - task.done(uuid, result)
    - task.XXX.done.XXX(result)
    - task.aborted(uuid,abortReason)
    - task.XXX.aborted(abortReason)
    - task.failed(uuid, error)
    - task.XXX.failed(error)
    - task.ended(uuid, status, result | abortReason | error)
    - task.XXX.ended(status, result | abortReason | error)
- [-] Avoid duplicated new/running tasks ?
- [-] Retry on error (with same task or new one ?)
- [-] Rerun aborted task if tasker stopped => Postpone
- [-] Add endpoints/events for everything (events for start/end running, findTasks, etc) ?

Promise coherence in Task API
postpone running ?
Work with complex objects ? (ex: task cmd stream to http response, abortSignal, etc) => Attach runningmethod these objects but unable to restart task after tasker process shutdown
Concurrency or runCondition with external asserts ?
Shared runConccurency/Task template/extends ?
Refactor runConditions to concurrency with all in query ?
Add global runConditions ?
Queue timeout with change priority or abort ?
runTimeout cron ?
less verbose logs