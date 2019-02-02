const death = require("death")({ uncaughtException: true });
const os = require("os");
const nanoid = require("nanoid");
const util = require("util");
const stream = require('stream');
const winston = require("winston");
const { format } = require("logform");
const { SPLAT } = require('triple-beam');

const alignedWithColorsAndTime = format.combine(
    format((info, opts) => {
        if (!info[SPLAT]) return info;
        var s = info[SPLAT].map(s => util.inspect(s, { breakLength: Infinity })).join(" ");
        info.message = util.format(info.message, s);
        return info;
    })(),
    format((info, opts) => { info.level = info.level.toUpperCase(); return info; })(),
    format.colorize(),
    format.timestamp(),
    format.align(),
    format.printf(info => { return `[${info.timestamp}] ${info.level}: ${info.message}` })
)
const logger = winston.createLogger({
    format: alignedWithColorsAndTime,
});
logger.add(new winston.transports.Console);

function to(promise) {
    return promise.then(
        data => [null, data],
        err => [err, null]
    );
}

function promisify(obj, ...args) {

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
    return nanoid() + new Date().getTime().toString(36);
}

const pipeline = util.promisify(stream.pipeline);

function streamToString(stream) {
    const chunks = []
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
}

module.exports = {
    sleep,
    death,
    nodeid,
    shortname,
    exit,
    uuid,
    pipeline,
    to,
    logger,
    promisify,
    streamToString,
};
