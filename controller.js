const util = require("util");
const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, to } = require("./utils");

// variables

// create broker
const config = {
    ...loadConfig("controller"),
}
config.nodeID = nodeid(config.nodeID);
const broker = new ServiceBroker(config);

// service: 
broker.createService({
    name: "controller",
    actions: {
        async newTask(ctx) {
            let err;
            const task = ctx.meta;
            const stream = ctx.params;
            broker.logger.info("newTask: ", task);
            let res;
            [err,res] = await to(broker.call("localstore.newTask", stream, { meta: task }));
            if (err) { console.log(err); return null; }
            broker.broadcast("worker.wakeup");
            return res;
        },
        async getTask() {
            let err;
            broker.logger.debug("getTask called");
            let localTask
            [err,localTask] = await to(broker.call("localstore.getTask"));
            if (err) { console.log(err); }
            if (!err && localTask != null) {
                broker.logger.debug("getTask (local): ", localTask);
                return localTask;
            }
            let remoteTask;
            [err,remoteTask] = await to(broker.call("remotestore.getTask"));
            if (err) { console.log(err); }
            if (!err && remoteTask != null) {
                broker.logger.debug("getTask (remote): ", remoteTask);
                return remoteTask;
            }
            return null;
        },
        async resultTask(ctx) {
            let err;
            const task = ctx.params;
            broker.logger.info("resultTask: ", task);
            if (task.source === "local") {
                [err] = await to(broker.call("localstore.resultTask", task));
                if (err) { console.log(err); }
            } else {
                [err] = await to(broker.call("remotestore.resultTask", task));
                if (err) { console.log(err); }
            }
        }
    },
});

// start
async function startup() {
    await broker.start();
}

startup();

// SIGINT
death(async (_, err) => {
    if (err) { console.log(err); }
    if (broker != null) broker.logger.info("Exiting, waiting for current process to finish");
    exit(5000);
    await broker.stop();
    process.exit();
});
