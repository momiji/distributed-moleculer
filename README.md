# distributed-moleculer
Attempt to implement distributed tasks with moleculer

# Specification

## task

id : site#id
name: customer task name
input/output: s3 filename
status: input|output|work|error|wait
submitTime
startTime
duration
tries
priority
hostname: hostname on which worker did the job, this is not relevant for subtasks

status:
- input => work
- work => output if task success
- work => input if task failed and tries < 10
- work => error if task failed and tries >= 10
TODO: - work => wait if task return childs

Entrypoint for external call is `api`.

task.id => site#id

## controller

- api.createTask(stream, meta { task })
- api.deleteTask
- api.statusTask
- api.resultTask

return { result: "success|failure", err: (null|err) }

## localstore
## remotestore
## worker

# Tests
test

