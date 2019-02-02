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

store = t => { var site = t.id.split(":")[0]; return site === config.site ? "localstore" : "remotestore"; }

// service: 
broker.createService({
    name: "controller",
    actions: {
        // external api
        async createTask(ctx) { //user,name,priority?
            let err, task, stream;
            task = ctx.meta;
            stream = ctx.params;
            logger.info("create:", task);
            [err, task] = await to(broker.call("localstore.createTask", stream, { meta: task }));
            if (err) { logger.error(err); throw err; } //TODO return xxx if failed
            return task;
        },
        async deleteTask(ctx) { //user,id
            let err, task;
            task = ctx.params;
            logger.info("delete:", task);
            [err, task] = await to(broker.call(`${store(task)}.deleteTask`, task));
            if (err) { logger.error(err); throw err; } //TODO return xxx if failed
            return task;
        },
        async statusTask(ctx) { //user,id
            let err, task;
            task = ctx.params;
            logger.info("status:", task);
            [err, task] = await to(broker.call(`${store(task)}.statusTask`, task));
            if (err) { logger.error(err); throw err; } //TODO define return with 'missing' if not exists ?
            return task;

        },
        async resultTask(ctx) { //user,id
            let err, task;
            task = ctx.params;
            logger.info("result:", task);
            [err, task] = await to(broker.call(`${store(task)}.resultTask`, task));
            if (err) { logger.error(err); throw err; } //TODO define return 404 if not exist 
            return stream;
        },

        // internal api
        async pullTask() {
            let err, task;
            [err, task] = await to(broker.call("localstore.pullTask"));
            if (err) { logger.error(err); }
            if (!err && task != null) {
                logger.info("pulld:", task);
                return task;
            }
            [err, task] = await to(broker.call("remotestore.pullTask"));
            if (err) { logger.error(err); }
            if (!err && task != null) {
                logger.info("pulld:", task);
                return task;
            }
            return null;
        },
        async updateTask(ctx) { //user,id,...
            let err;
            const task = ctx.params;
            if (task.result === "success") {
                logger.info("update:", task);
            } else {
                logger.warn("update:", task);
            }
            //
            [err] = await to(broker.call(`${store(task)}.updateTask`, task));
            if (err) { logger.error(err); throw err; }
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
