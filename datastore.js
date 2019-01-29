const nedb = require("nedb-promises");
const { to, logger } = require("./utils");
const Probe = require('pmx').probe();

const fields = {
    name: 1,
    input: 1,
    output: 1,
    submitTime: 1,
    startTime: 1,
    duration: 1,
    tries: 1,
    priority: 1,
    hostname: 1
};

Probe.metric({
    name: 'TotalTasks',
    value: function () {
        return stats.total;
    }
});

stats = { input: 0, work: 0, output: 0, total: 0 };

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

    async insert(item) {
        let err, task;
        task = {
            name: item.name,
            status: "input",
            priority: item.priority | 0,
            input: item.input,
            output: item.output,
            tries: 0,
            submitTime: new Date(),
        };
        [err, task] = await to(this.db.insert(task));
        if (err) { logger.error(err); return null; }
        //
        this.updatePriorities(task, +1);
        stats.input++;
        stats.total++;
        //
        return task;
    }

    async take() {
        let err, task;
        [err, task] = await to(this.db.find({ status: "input" }, fields).sort({ priority: -1, tries: -1 }).limit(1));
        if (err) { logger.error(err); return null; }
        task = task[0];
        if (!task) return null;
        //
        [err, task] = await to(this.db.update(
            { _id: task._id },
            { $set: { status: "work", startTime: new Date() } },
            { returnUpdatedDocs: true }
        ));
        if (err) { logger.error(err); return null; }
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
        if (err) { logger.error(err); return; }
        if (!task) return;
        //
        [err, task] = await to(this.db.update(
            { _id: task._id },
            { $set: { status: "output", duration: new Date() - task.startTime, hostname: item.hostname } }
        ));
        if (err) { logger.error(err); return; }
        //
        stats.work--;
        stats.output++;
        return;
    }

    async undo(item) {
        let err, task;
        [err, task] = await to(this.db.findOne({ _id: item._id }));
        if (err) { logger.error(err); return; }
        if (!task) return;
        //
        [err, task] = await to(this.db.update(
            { _id: task._id },
            { $set: { status: "input", tries: task.tries + 1, error: item.error, hostname: item.hostname } },
            { returnUpdatedDocs: true }
        ));
        if (err) { logger.error(err); return; }
        //
        this.updatePriorities(task, 1);
        stats.input++;
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
