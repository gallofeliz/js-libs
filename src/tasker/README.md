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
- [-] Promise coherence in Task API
- [-] Retry on error (with same task or new one ?)
- [-] Rerun aborted task if tasker stopped => Postpone
- [-] Avoid duplicated new/running tasks
- [-] Add endpoints/events for everything (events for start/end running, findTasks, etc) ?

postpone running ?
Work with complex objects ? (ex: task cmd stream to http response)
Concurrency or runCondition with external asserts ?
Target limit (concurrency)?
Shared runConccurency/Task template/extends ?
Refactor runConditions to concurrency with all in query ?
Add global runConditions ?
Queue timeout with change priority or abort ?
runTimeout cron ?