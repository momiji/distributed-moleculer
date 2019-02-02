const nedb = require("nedb-promises");
const { to, logger } = require("./utils");
const Probe = require('pmx').probe();

const fields = {
    user: 1,
    name: 1,
    input: 1,
    output: 1,
    status: 1,
    submitTime: 1,
    startTime: 1,
    nextTime: 1,
    duration: 1,
    tries: 1,
    priority: 1,
    hostname: 1,
    error: 1,
};

Probe.metric({ name: 'total', value: () => stats.total });
Probe.metric({ name: 'input', value: () => stats.input });
Probe.metric({ name: 'work', value: () => stats.work });
Probe.metric({ name: 'output', value: () => stats.output });
Probe.metric({ name: 'error', value: () => stats.error });

stats = { input: 0, work: 0, output: 0, error: 0, total: 0 };

shift = (offset, date) => new Date((date ? date : new Date()).getTime() + offset);

class DataStore {
    constructor() {
        this.db = nedb.create();
        this.priorities = {};
    }

    updatePriorities(task, offset) {
        task.priority = task.priority | 0;
        let cur = this.priorities[task.priority];
        if (cur) {
            cur = cur + offset;
            if (cur <= 0) {
                this.priorities[task.priority] = undefined;
            } else {
                this.priorities[task.priority] = cur;
            }
        } else {
            cur = offset;
            if (cur > 0) {
                this.priorities[task.priority] = cur;
            }
        }
    }

    // external api
    async insert(item) {
        let err, task;
        task = {
            user: item.user,
            name: item.name,
            status: "input",
            priority: item.priority | 0,
            input: item.input,
            output: item.output,
            tries: 0,
            submitTime: new Date(),
            startTime: null,
            nextTime: new Date(0),
        };
        [err, task] = await to(this.db.insert(task));
        if (err) { logger.error(err); throw err; }
        //
        this.updatePriorities(task, +1);
        stats.input++;
        stats.total++;
        //
        return task;
    }

    async select(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }, fields));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found";
        //
        return task;
    }

    async delete(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }, fields));
        if (err) { logger.error(err); throw err; }
        if (!task) throw "not found";
        //
        [err] = await to(this.db.remove({ _id: item._id }, {}));
        if (err) { logger.error(err); throw err; }
        //
        return task;
    }

    // internal api
    async take() {
        let err, task;
        while (true) {
            [err, task] = await to(this.db.find({ status: "input", nextTime: { $lt: new Date() } }, fields).sort({ priority: -1, tries: -1 }).limit(1));
            if (err) { logger.error(err); throw err; }
            task = task[0];
            if (!task) return null;
            //
            [err, task] = await to(this.db.update(
                { _id: task._id, status: "input" },
                {
                    $set: {
                        status: "work",
                        startTime: new Date()
                    }
                },
                { returnUpdatedDocs: true }
            ));
            if (err) { logger.error(err); return null; }
            if (task != null) break;
        }
        //
        this.updatePriorities(task, -1);
        stats.input--;
        stats.work++;
        //
        return task;
    }

    async save(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }));
        if (err) { logger.error(err); throw err; }
        if (!task) return;
        //
        [err, task] = await to(this.db.update(
            { _id: task._id },
            {
                $set: {
                    status: "output",
                    duration: new Date() - task.startTime,
                    nextTime: null,
                    error: null,
                    hostname: item.hostname
                }
            }
        ));
        if (err) { logger.error(err); throw err; }
        //
        stats.work--;
        stats.output++;
        return;
    }

    async undo(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }));
        if (err) { logger.error(err); throw err; }
        if (!task) return;
        //
        if (task.tries < 10) {
            task.status = "input";
            task.tries++;
        } else {
            task.status = "error";
        }
        //
        [err, task] = await to(this.db.update(
            { _id: task._id },
            {
                $set: {
                    status: task.status,
                    tries: task.tries,
                    nextTime: shift(5000),
                    error: item.error,
                    hostname: item.hostname
                }
            },
            { returnUpdatedDocs: true }
        ));
        if (err) { logger.error(err); throw err; }
        //
        if (task.status === "input") {
            this.updatePriorities(task, 1);
            stats.input++;
        } else {
            stats.error++;
        }
        stats.work--;
        //
        return;
    }

    async stats() {
        let maxPriority = undefined;
        for (let p of Object.keys(this.priorities)) {
            if (maxPriority === undefined || p > maxPriority) {
                maxPriority = p | 0;
            }
        }
        let hasTasks = maxPriority !== undefined;
        return { maxPriority, hasTasks };
    }

}

module.exports = new DataStore();
