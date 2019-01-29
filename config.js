const program = require("commander");

const common = {
    nodeID: "common",
    logger: true,
    logLevel: "error",
    transporter: "nats://localhost:4222",
    skipProcessEventRegistration: true,
    retryPolicy: {
        enabled: true,
    },
};

const controller = {
    nodeID: "controller",
};

const worker = {
    nodeID: "worker",
};

const localstore = {
    nodeID: "localstore",
};

const remotestore = {
    nodeID: "remotestore",
};

const global = {
    nodeID: "global",
    logger: true,
    transporter: "nats://localhost:5222",
    skipProcessEventRegistration: true,
    retryPolicy: {
        enabled: true,
    },
};

const s3 = {
    bucket: "test",
    endPoint: "localhost",
    port: 9000,
    useSSL: false,
    accessKey: "test",
    secretKey: "test1234",
}

const configs = {
    common,
    controller,
    worker,
    localstore,
    remotestore,
    global,
    s3,
};

function loadConfig(name) {
    const config = name && configs[name];
    program.option("-c, --config [file]", "configuration file").parse(process.argv);
    const override = program.config && require(program.config);
    const common2 = override && override.common;
    const config2 = override && override[name];
    const res = {
        ...common,
        ...common2,
        ...config,
        ...config2,
    };
    return res;
}

module.exports = {
    ...configs,
    loadConfig,
};
