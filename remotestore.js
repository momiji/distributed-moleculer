const util = require("util");
const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, uuid, to, logger } = require("./utils");
const s3 = require("./s3");

// variables
const states = {};
const globalName = uuid();

// create broker
const config = {
    ...loadConfig("remotestore"),
};
config.nodeID = nodeid(config.nodeID);
const broker = new ServiceBroker(config);

// create www broker
const globalConfig = {
    ...loadConfig("global"),
};
globalConfig.nodeID = nodeid(globalName);
const globalBroker = new ServiceBroker(globalConfig);

// service: 
broker.createService({
    name: "remotestore",
    actions: {
        async getTask() {
            let err;
            logger.debug("getTask called");
            let maxState = null;
            for (let state of Object.values(states)) {
                if (state.counts.max >= 0) {
                    if (!maxState || state.counts.max > maxState.counts.max) {
                        maxState = state;
                    }
                }
            }
            if (maxState != null) {
                const action = `${maxState.source}.getTask`;
                const actionInput = `${maxState.source}.getTaskInput`;
                let task;
                [err, task] = await to(globalBroker.call(action));
                if (err) { logger.error(err); return null; }
                if (task == null) { return null; }
                [err, input] = await to(globalBroker.call(actionInput, task));
                if (err) { logger.error(err); return null; }
                [err] = await to(s3.writeFile(input, task.input))
                if (err) { logger.error(err); return null; }
                logger.debug("remoteTask:", task);
                return task;
            }
            return null;
        },
        async resultTask(ctx) {
            let err;
            const task = ctx.params;
            logger.info("resultTask:", task);
            const action = `${task.source}.resultTask`;
            let output;
            if (task.result === "success") {
                [err, output] = await to(s3.readFile(task.output));
                if (err) {
                    logger.error(err);
                    task.result = "failure";
                }
            }
            [err] = await to(globalBroker.call(action, output, { meta: task }));
            if (err) { logger.error(err); }
        },
        async shareLog(ctx) {
            const state = { ...ctx.params, source: globalName };
            logger.debug("shareLog:", state);
            globalBroker.broadcast("backlog.state", state);
        },
    },
});

// global service:
globalBroker.createService({
    name: globalName,
    actions: {
        async getTask(ctx) {
            let err;
            logger.debug("getTask called");
            let task;
            [err, task] = await to(broker.call("localstore.getTask"));
            if (err) { logger.error(err); return null; }
            if (task == null) return null;
            task.source = globalName;
            return task;
        },
        async getTaskInput(ctx) {
            let err;
            [err, input] = await to(s3.readFile(ctx.params.input));
            if (err) { logger.error(err); return null; }
            return input;
        },
        async resultTask(ctx) {
            let err;
            const task = ctx.meta;
            logger.debug("resultTask:", task);
            if (task.result === "success") {
                [err] = await to(s3.writeFile(ctx.params, ctx.meta.output));
                if (err) {
                    logger.error(err);
                    task.result = "failure";
                }
            }
            [err] = await to(broker.call("localstore.resultTask", task));
            if (err) { logger.error(err); }
        }
    },
    events: {
        async "backlog.state"(state) {
            if (state.source === globalName) return;
            const now = new Date();
            state.date = now;
            logger.debug("state:", state);
            states[state.source] = state;
            for (let state of Object.values(states)) {
                if (now - state.date > 10000) {
                    states[state.source] = undefined;
                }
            }
            if (state.counts.max >= 0) {
                broker.broadcast("worker.wakeup");
            }
        },
    },
})

// start
async function startup() {
    await broker.start();
    await globalBroker.start();
}

startup();

// SIGINT
death(async (_, err) => {
    exit(5000);
    if (err) { logger.error(err); }
    if (broker != null) logger.info("Exiting, waiting for current process to finish");
    await globalBroker.stop();
    await broker.stop();
    process.exit();
});
