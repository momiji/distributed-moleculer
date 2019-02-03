const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { nodeid, sleep, logger, streamToString, to } = require("./utils");
const program = require("commander");
const stream = require("stream");
const s3 = require("./s3");

let itemsToGenerate = 1;
let itemsName = "test";

program
    .command("* [name] [count]")
    .action(function (name, count) {
        itemsName = name;
        itemsToGenerate = count | 0;
    });
program.parse(process.argv);

// create broker
const config = {
    ...loadConfig(),

}
config.nodeID = nodeid("test");
const broker = new ServiceBroker(config);

// background job
const reflect = (t, p) => p.then(
    v => ({ v, t, status: "fulfilled" }),
    e => ({ e, t, status: "rejected" })
);
const waitAll = a => Promise.all(a.map(reflect));

async function run() {
    let arr = [];
    for (let i = 0; i < itemsToGenerate; i++) {
        const name = `${itemsName}#${i + 1}`;
        //const stream = fs.createReadStream("./gnatsd");
        const s = new stream.Readable();
        s.push(name);
        s.push(null);
        const task = { user: "test", name, priority: 0 };
        arr.push(reflect('send', broker.call("controller.createTask", s, { meta: task })));
    }
    // wait for all tasks
    let res = { created: { ok: 0, error: 0, null: 0, count: 0 }, results: { ok: 0, error: 0, count: 0 }, total: arr.length };
    while (res.created.count < res.total || res.results.count < res.created.ok) {
        await sleep(1000);
        arr = arr.filter(p => p.done !== 1);
        for (let p of arr) {
            if (p.done === 1) continue;
            if (!p.isResolved()) continue;
            p.done = 1;
            p = await p;
            if (res.total === 1) console.log(p);
            if (p.t === "send") {
                res.created.count++;
                if (p.e) {
                    logger.error(p.e);
                    res.created.error++;
                } else if (p.v == null) {
                    logger.error("null found");
                    res.created.null++;
                } else {
                    let [err, s] = await to(s3.readFile(p.v.input));
                    if (err) {
                        logger.error("s3 error:", err);
                        res.created.error++;
                    } else {
                        let name = await streamToString(s);
                        if (name !== p.v.name) {
                            logger.error("not matching:", name, p.v.name);
                            res.created.error++;
                        } else {
                            res.created.ok++;
                            const task = p.v;
                            arr.push(reflect('status', broker.call("controller.statusTask", task)));
                        }
                    }
                }
            }
            if (p.t === "status") {
                if (p.e) {
                    logger.error(p.e);
                } else if (p.v == null) {
                    logger.error("null found");
                } else if (p.v.status === "error") {
                    logger.error("task error:", p.v.error)
                    res.results.error++;
                    res.results.count++;
                } else if (p.v.status != "output") {
                    const task = p.v;
                    arr.push(reflect('status', broker.call("controller.statusTask", task)));
                } else {
                    res.results.count++;
                    let [err, s] = await to(s3.readFile(p.v.input));
                    if (err) {
                        logger.error("s3 error:", err);
                        res.results.error++;
                    } else {
                        let name = await streamToString(s);
                        if (name !== p.v.name) {
                            logger.error("not matching:", name, p.v.name);
                            res.results.error++;
                        } else {
                            res.results.ok++;
                        }
                    }
                    const task = p.v;
                    broker.call("controller.deleteTask", task);
                }
            }
        }
        logger.info("r:", res);
    }
}

// start
async function startup() {
    await broker.start();
    await run();
    process.exit();
}

startup();
