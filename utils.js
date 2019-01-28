const death = require("death")({ uncaughtException: true });
const os = require("os");
const crypto = require("crypto");
const util = require("util");
const stream = require('stream');

function to(promise) {
    return promise.then(
        data => {
            return [null, data];
        }
    )
        .catch(err => [err]);
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

function shortname() {
    return os.hostname().split('.')[0];
}

function nodeid(nodeid) {
    const pm_id = process.env.NODE_APP_INSTANCE;
    const suffix = pm_id && `-${pm_id}` || '';
    const name = shortname() + '-' + nodeid + suffix;
    return name;
}

function exit(timeout) {
    setTimeout(function () { process.exit(1); }, timeout);
}

function uuid() {
    return crypto.randomBytes(16).toString("hex");
}

const pipeline = util.promisify(stream.pipeline);

module.exports = {
    sleep,
    death,
    nodeid,
    shortname,
    exit,
    uuid,
    pipeline,
    to,
};
