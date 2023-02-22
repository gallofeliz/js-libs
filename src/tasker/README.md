# Tasker

Tasks Management with persistance (non-distributed):
- [✓] Persisted
- [✓] Support start/stop (attach runners, json-compatible tasks)
- [✓] Abortable
- [✓] Prioritization
- [✓] Access to outputData and logs for a task
- [✓] Wait for Task OutputData
- [✓] Stream logs
- [✓] Concurrency with criteria
- [✓] Change Task priority
- [✓] Task Timeout / Stop after time
- [✓] Public methods to search etc tasks
- [-] Events
- [-] Avoid duplicated new/running tasks ?
- [-] Retry on error (with same task or new one ?)
- [-] Rerun aborted task if tasker stopped => Postpone
- [-] Add endpoints/events for everything (events for start/end running, findTasks, etc) ?

Promise coherence in Task API
postpone running ?
Work with complex objects ? (ex: task cmd stream to http response)
Concurrency or runCondition with external asserts ?
Shared runConccurency/Task template/extends ?
Refactor runConditions to concurrency with all in query ?
Add global runConditions ?
Queue timeout with change priority or abort ?
runTimeout cron ?