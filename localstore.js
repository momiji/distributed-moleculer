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

// service:
broker.createService({
    name: "localstore",
    actions: {
        async newTask(ctx) {
            let err, task, filename;
            task = ctx.meta;
            filename = s3.newFilename();
            task.input = `${filename}.in`;
            task.output = `${filename}.out`;
            //
            [err] = await to(s3.writeFile(ctx.params, task.input));
            if (err) { logger.error(err); return null; }
            //
            [err, task] = await to(datastore.insert(task));
            if (err) { logger.error(err); return null; }
            //
            logger.info("newTask:", task);
            return task;
        },
        async getTask() {
            let err, task;
            [err, task] = await to(datastore.take());
            if (err) { logger.error(err); return null; }
            if (!task) return null;
            //
            task.source = "local";
            logger.info("getTask:", task);
            //
            return task;
        },
        async resultTask(ctx) {
            let err, task;
            task = ctx.params;
            logger.info("resultTask:", task);
            if (task.result === "success") {
                [err] = await to(datastore.save(task));
                if (err) { logger.error(err); return; }
            } else {
                [err] = await to(datastore.undo(task));
                if (err) { logger.error(err); return; }
            }
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
