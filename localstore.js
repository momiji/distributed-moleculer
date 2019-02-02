const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, to, logger } = require("./utils");
const s3 = require("./s3");
const datastore = require("./datastore");

// variables
let running = false;
let exiting = false;

// create broker
const config = {
    ...loadConfig("localstore"),
}
config.nodeID = nodeid(config.nodeID);
const broker = new ServiceBroker(config);

toid = t => { t.id = `${config.site}:${t._id}`; return t; }
fromid = t => { t._id = t.id.split(':')[1]; return t; }

// service:
broker.createService({
    name: "localstore",
    actions: {
        async createTask(ctx) {
            let err, task, filename;
            task = ctx.meta;
            logger.info("create:", task);
            //
            filename = s3.newFilename();
            task.input = `${filename}.in`;
            task.output = `${filename}.out`;
            //
            [err, etag] = await to(s3.writeFile(ctx.params, task.input));
            if (err) { logger.error(err); throw err; }
            //
            [err, task] = await to(datastore.insert(task));
            if (err) { logger.error(err); throw err; }
            //
            task = toid(task);
            //
            logger.info("created:", task);
            broker.broadcast("worker.wakeup");
            //
            return task;
        },
        async deleteTask(ctx) {
            let err, task, filename;
            task = ctx.params;
            logger.info("delete:", task);
            task = fromid(task);
            //
            [err, task] = await to(datastore.delete(task));
            if (err) { logger.error(err); throw err; }
            //
            [err] = await to(s3.deleteFile(task.input));
            if (err) { logger.error(err); }
            [err] = await to(s3.deleteFile(task.output));
            if (err) { logger.error(err); }
            //
            logger.info("deleted:", task);
            return;
        },
        async statusTask(ctx) {
            let err, task, filename;
            task = ctx.params;
            logger.info("status:", task);
            //
            task = fromid(task);
            //
            [err, task] = await to(datastore.select(task));
            if (err) { logger.error(err); throw err; }
            //
            task = toid(task);
            //
            logger.info("statusd:", task);
            return task;
        },
        async resultTask(ctx) {
            let err, task, filename;
            task = ctx.params;
            logger.info("result:", task);
            //
            task = fromid(task);
            //
            [err, task] = await to(datastore.select(task));
            if (err) { logger.error(err); throw err; }
            //
            [err, stream] = await to(s3.readFile(task.input));
            if (err) { logger.error(err); throw err; }
            //
            logger.info("resultd");
            return stream;
        },

        // internal api
        async pullTask() {
            let err, task;
            [err, task] = await to(datastore.take());
            if (err) { logger.error(err);  err; }
            if (!task) return null;
            //
            task = toid(task);
            //
            logger.info("pulled:", task);
            //
            return task;
        },
        async updateTask(ctx) {
            let err, task;
            task = ctx.params;
            logger.info("update:", task);
            //
            task = fromid(task);
            //
            if (task.result === "success") {
                [err] = await to(datastore.save(task));
                if (err) { logger.error(err); throw err; }
            } else {
                [err] = await to(datastore.undo(task));
                if (err) { logger.error(err); throw err; }
            }
            //
            logger.info("updated");
            return;
        }
    },
});

// background job
async function run() {
    logger.debug("run called");

    // return if already running - placed here are run is called async'd
    if (running) return;

    // starting loop
    logger.debug("run loop started");
    running = true;
    while (!exiting) {
        let err, stats;
        //
        if (!err) {
            [err, stats] = await to(datastore.stats());
            if (err) { logger.error(err); }
        }
        //
        if (!err) {
            [err] = await to(broker.call("remotestore.shareLog", stats));
            if (err) { logger.error(err); }
        }
        //
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
    exit(5000);
    if (err) { logger.error(err); }
    if (broker != null) logger.info("Exiting, waiting for current process to finish (5s)");
    exiting = true;
});
