const util = require("util");
const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { death, nodeid, exit, uuid, pipeline, to } = require("./utils");
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
            broker.logger.debug("wakeup");
            run();
        }
    },
});

async function success(task) {
    let err;
    task.result = "success";
    broker.logger.info("success: ", task);
    [err] = await to(broker.call("controller.resultTask", task));
    if (err) { console.log(err); }
}

async function failure(task) {
    let err;
    task.result = "failure";
    broker.logger.info("failure: ", task);
    [err] = await to(broker.call("controller.resultTask", task));
    if (err) { console.log(err); }
}

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
        // get a task to process
        let task;
        [err, task] = await to(broker.call("controller.getTask"));
        if (err) { console.log(err); }

        // if no task, just go to sleep
        if (task == null) {
            running = false;
            broker.logger.debug("run loop stopped");
            return;
        }

        // if task found, process it
        broker.logger.info("task: ", task);

        const tempInput = `/tmp/${uuid()}.in`;
        const tempOutput = `/tmp/${uuid()}.out`;

        // load file to tempInput
        let input;
        [err, input] = await to(s3.readFile(task.s3input));
        if (err) { console.log(err); failure(task); continue; }

        [err] = await to(pipeline(
            input,
            fs.createWriteStream(tempInput),
        ));
        if (err) { console.log(err); failure(task); continue; }

        // run something
        [err] = await to(pipeline(
            fs.createReadStream(tempInput),
            fs.createWriteStream(tempOutput),
        ));
        if (err) { console.log(err); failure(task); continue; }

        // save file from tempOutput
        [err] = await to(s3.writeFile(fs.createReadStream(tempOutput), task.s3output));
        if (err) { console.log(err); failure(task); continue; }

        // return result async, so we can start next task asap
        success(task);
    }

    // exiting
    exit(5000);
    await broker.stop();
    process.exit();
}

// start
async function startup() {
    await broker.start();
    run();
    setInterval(run, 10000);
}

startup();

// SIGINT
death((_, err) => {
    if (err) { console.log(err); }
    if (broker != null) broker.logger.info("Exiting, waiting for current process to finish");
    exiting = true;
});
