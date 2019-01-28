const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, to } = require("./utils");
const Probe = require('pmx').probe();
const s3 = require("./s3");

// variables
let running = false;
let exiting = false;
const tasks = {
    0: [],
    1: [],
    2: [],
}
const stats = {
    count: 0,
}

var metric = Probe.metric({
    name: 'Tasks',
    value: function () {
        return stats.count;
    }
});

// create broker
const config = {
    ...loadConfig("localstore"),
}
config.nodeID = nodeid(config.nodeID);
const broker = new ServiceBroker(config);

// service:
broker.createService({
    name: "localstore",
    actions: {
        async newTask(ctx) {
            let err;
            const task = ctx.meta;
            const filename = s3.newFilename();
            task.s3input = `${filename}.in`;
            task.s3output = `${filename}.out`;
            [err] = await to(s3.writeFile(ctx.params, task.s3input));
            if (err) { console.log(err); return null; }
            broker.logger.info("newTask: ", task);
            tasks[task.priority].push(task);
            stats.count++;
            return { ...task };
        },
        async getTask() {
            broker.logger.debug("getTask called");
            const task = tasks[2].pop() || tasks[1].pop() || tasks[0].pop();
            if (task != null) {
                task.source = "local";
                broker.logger.debug("getTask: ", task);
                stats.count--;
            }
            return task;
        },
        async resultTask(ctx) {
            const task = ctx.params;
            broker.logger.info("resultTask: ", task);
        }
    },
});

// background job
async function run() {
    broker.logger.debug("run called");

    // return if already running - placed here are run is called async'd
    if (running) return;

    // starting loop
    broker.logger.debug("run loop started");
    running = true;
    while (!exiting) {
        let err;
        const counts = {};
        let max = -1;
        for (let i of Object.keys(tasks)) {
            const c = tasks[i].length;
            if (c) {
                counts[i] = c;
                if (i > max) max = i | 0;
            }
        }
        counts.max = max;
        [err] = await to(broker.call("remotestore.shareLog", { counts }));
        if (err) { console.log(err); }
        running = false;
        return;
    }

    // exiting
    exit(5000);
    await broker.stop();
    process.exit();
}

// start
async function startup() {
    await broker.start();
    setInterval(run, 2000);
}

startup();

// SIGINT
death((_, err) => {
    if (err) { console.log(err); }
    if (broker != null) broker.logger.info("Exiting, waiting for current process to finish");
    exiting = true;
});
