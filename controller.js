const util = require("util");
const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, to, logger } = require("./utils");

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
            let err, task, stream;
            task = ctx.meta;
            stream = ctx.params;
            logger.info("newTask:", task);
            [err, task] = await to(broker.call("localstore.newTask", stream, { meta: task }));
            if (err) { logger.error(err); return null; }
            broker.broadcast("worker.wakeup");
            return task;
        },
        async getTask() {
            let err, task;
            logger.debug("getTask called");
            [err, task] = await to(broker.call("localstore.getTask"));
            if (err) { logger.error(err); }
            if (!err && task != null) {
                logger.debug("getTask (local):", task);
                return task;
            }
            [err, task] = await to(broker.call("remotestore.getTask"));
            if (err) { logger.error(err); }
            if (!err && task != null) {
                logger.debug("getTask (remote):", task);
                return task;
            }
            return null;
        },
        async resultTask(ctx) {
            let err;
            const task = ctx.params;
            if (task.result === "success") {
                logger.info("resultTask:", task);
            } else {
                logger.warn("resultTask:", task);
            }
            if (task.source === "local") {
                [err] = await to(broker.call("localstore.resultTask", task));
                if (err) { logger.error(err); }
            } else {
                [err] = await to(broker.call("remotestore.resultTask", task));
                if (err) { logger.error(err); }
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
    exit(5000);
    if (err) { logger.error(err); }
    if (broker != null) logger.info("Exiting, waiting for current process to finish");
    await broker.stop();
    process.exit();
});
