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
globalConfig.nodeID = nodeid(`${globalConfig.nodeID}.${globalConfig.site}`);
const globalBroker = new ServiceBroker(globalConfig);

// service: 
broker.createService({
    name: "remotestore",
    actions: {
        async pullTask() {
            let err;
            logger.debug("pullTask called");
            let maxState = null;
            for (let state of Object.values(states)) {
                if (state.hasTasks >= 0) {
                    if (!maxState || state.maxPriority > maxState.maxPriority) {
                        maxState = state;
                    }
                }
            }
            if (maxState != null) {
                const action = `global-${maxState.source}.pullTask`;
                const actionInput = `global-${maxState.source}.pullTaskInput`;
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
        async updateTask(ctx) {
            let err;
            const task = ctx.params;
            logger.info("updateTask:", task);
            const site = task.id.split(":")[0];
            const action = `global-${site}.updateTask`;
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
            s3.deleteFile(task.input);
            s3.deleteFile(task.output);
        },
        async shareLog(ctx) {
            const state = { ...ctx.params, source: globalConfig.site };
            logger.debug("shareLog:", state);
            globalBroker.broadcast("backlog.state", state);
        },
    },
});

// global service:
globalBroker.createService({
    name: `global-${globalConfig.site}`,
    actions: {
        async pullTask() {
            let err, task;
            logger.debug("pullTask called");
            [err, task] = await to(broker.call("localstore.pullTask"));
            if (err) { logger.error(err); return null; }
            if (task == null) return null;
            return task;
        },
        async pullTaskInput(ctx) {
            let err;
            [err, input] = await to(s3.readFile(ctx.params.input));
            if (err) { logger.error(err); return null; }
            return input;
        },
        async updateTask(ctx) {
            let err;
            const task = ctx.meta;
            logger.debug("updateTask:", task);
            if (task.result === "success") {
                [err] = await to(s3.writeFile(ctx.params, ctx.meta.output));
                if (err) {
                    logger.error(err);
                    task.result = "failure";
                }
            }
            [err] = await to(broker.call("localstore.updateTask", task));
            if (err) { logger.error(err); }
        }
    },
    events: {
        async "backlog.state"(state) {
            if (state.source === globalConfig.site) return;
            const now = new Date();
            state.date = now;
            logger.debug("state:", state);
            states[state.source] = state;
            for (let state of Object.values(states)) {
                if (now - state.date > 10000) {
                    states[state.source] = undefined;
                }
            }
            if (state.hasTasks) {
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
