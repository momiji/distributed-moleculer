const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, uuid, pipeline, to, logger, shortname } = require("./utils");
const s3 = require("./s3");
const fs = require("fs");

// variables
let running = false;
let exiting = false;

// create broker
const config = {
    ...loadConfig("worker"),
}
config.nodeID = nodeid(config.nodeID);
const broker = new ServiceBroker(config);

// service: 
broker.createService({
    name: "worker",
    events: {
        async "worker.wakeup"() {
            logger.debug("wakeup");
            run();
        }
    },
});

async function success(task) {
    let err;
    task.result = "success";
    task.hostname = shortname();
    logger.info("success:", task);
    [err] = await to(broker.call("controller.updateTask", task));
    if (err) { logger.error(err); }
}

async function failure(task, error) {
    let err;
    task.result = "failure";
    task.hostname = shortname();
    task.error = error.message || error.code || error;
    logger.info("failure:", task);
    [err] = await to(broker.call("controller.updateTask", task));
    if (err) { logger.error(err); }
}

// background job
async function run() {
    logger.debug("run called");

    // return if already running - placed here are run is called async'd
    if (running) return;

    // starting loop
    logger.debug("run loop started");
    running = true;
    while (!exiting) {
        let err, task;
        // get a task to process
        [err, task] = await to(broker.call("controller.pullTask"));
        if (err) { logger.error(err); }

        // if no task, just go to sleep
        if (task == null) {
            running = false;
            logger.debug("run loop stopped");
            return;
        }

        // if task found, process it
        logger.info("task:", task);

        let input;
        let tempName = uuid();
        const tempInput = `/tmp/${tempName}.in`;
        const tempOutput = `/tmp/${tempName}.out`;

        // get stream from s3
        if (!err) {
            [err, input] = await to(s3.readFile(task.input));
        }
        // save stream to tempInput
        if (!err) {
            [err] = await to(pipeline(
                input,
                fs.createWriteStream(tempInput),
            ));
        }

        // run something
        if (!err) {
            try {
                if (task.name.endsWith("#1")) throw new Error("stop");
                [err] = await to(pipeline(
                    fs.createReadStream(tempInput),
                    fs.createWriteStream(tempOutput),
                ));
            } catch (e) {
                err = e;
            }
        }

        // save file to s3 from tempOutput
        if (!err) {
            [err] = await to(s3.writeFile(fs.createReadStream(tempOutput), task.output));
        }

        // remove temp files
        fs.unlink(tempInput, () => { });
        fs.unlink(tempOutput, () => { });

        // return result async, so we can start next task asap
        if (err) {
            failure(task, err);
            logger.error(err);
        } else {
            success(task);
        }
    }

    // exiting
    exit(5000);
    await broker.stop();
    process.exit();
}

// start
async function startup() {
    await broker.start();
    try {
        run();
    } catch (e) {
        console.log(e);
    }
    setInterval(run, 1000);
}

startup();

// SIGINT
death((_, err) => {
    exit(1000);
    if (err) { logger.error(err); }
    if (broker != null) logger.info("Exiting, waiting for current process to finish");
    exiting = true;
});
