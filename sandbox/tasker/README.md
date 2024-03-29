# Tasker

Tasks Management with persistance (non-distributed):
- [X] Workflow :
    - new -> running -> done/failed/aborted (= ended)
- [X] Persisted (json-compatible tasks)
    - addTask(addTaskDef)
- [X] Assign runners
    - assignRunner(operation, runner)
- [X] Support start/stop (attach runners)
    - start(abortSignal?)
    - stop()
- [X] Abortable
    - abortTask(uuid, reason?)
- [X] Prioritization
    - Task priority opt (-Infinity to Infinity, ASC)
    - prioritizeTask(uuid, priority)
- [X] Public methods to search etc tasks
    - getTask(uuid, { withLogs, logsMaxLevel })
    - hasTask(query)
    - countTasks(query)
    - findTask(query, { sort, withLogs, logsMaxLevel })
    - findTasks(query, { sort, limit, skip, withLogs, logsMaxLevel })
- [X] Easy wait for result and stream logs for a task
    - waitForTaskOutputData(uuid)
    - listenTaskLogs(uuid, { fromBeginning, abortSignal })
- [X] Concurrency with criteria
    - Task conccurency conditions [{ scope: 'running', query: { 'data.book': book }, limit: 1}] // avoid running more than 2 same book run
- [X] Task Timeout / Stop after time
    - Task runTimeout opt
- [X] Events
    - started()
    - stopped()
    - idle() : No running task
    - running(): Running task(s)
    - empty-queue(): No more tasks in queue
    - queuing() : Tasks in queue
    - task.add(AddTask)
    - task.add.skipped(id)
    - task.added(uuid, id)
    - task.prioritized(uuid, priority)
    - task.XXX.prioritized(priority)
    - task.aborted(uuid, reason)
    - task.XXX.aborted(reason)
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
- [-] Scheduling (not persisted) : Not its responsability. See @gallofeliz/scheduler
- [X] Attach task AbortSignal
- [ ] Remove old ended tasks
- [ ] Checks runners exist on start on new tasks
- [X] Avoid duplicated new/running tasks ?
- [ ] Retry on error (with same task or new one ?)
- [ ] Stop Tasker abort or not new tasks, postpone or not running etc
- [ ] Typescript well typed with Task<X,X,X> getTask<T extends Task> etc
- [ ] Sequentials core to avoid concurrency/phantoms read/write ?
Promise coherence in Task API
postpone running = abort with new ?
Work with complex objects ? (ex: task cmd stream to http response) => Attach runningmethod these objects but unable to restart task after tasker process shutdown
Shared runConccurency/Task template/extends ?
Refactor runConditions to concurrency with all in query ?
Add global runConditions ?
Queue timeout with change priority or abort ?
runTimeout cron ?
less verbose logs
-> rename runTimeout by abortConditions and add query or timeout, with opt to include new status or only running
-> Or all inside concurrency parent key
Use projections to reduce data ?
Stop new tasks on tasker stop configurable by task ?

Lock task to update it updateTask()

Abort on task dont support reboot résume

Remove tasks after time / remove logs after time depends on level
- [ ] Move concurrency to runners
- [ ] Change fn runners to complex runners than handle concurrency, and make eligibility to take tasks. Remove "action", all in id and data
- [ ] Simplify duplicate with simple comparaison of id ?