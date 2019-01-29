const { ServiceBroker } = require("moleculer");
const { loadConfig } = require("./config");
const { nodeid } = require("./utils");

// create broker
const config = {
    ...loadConfig(),
    nodeID: "repl",
    logger: console,
}
config.nodeID = nodeid(config.nodeID);
const broker = new ServiceBroker(config);

// start repl
async function starup() {
    await broker.start();
    await broker.repl();
    await broker.stop();
}

starup();
