const Minio = require('minio')
const { loadConfig } = require("./config");
const { uuid } = require("./utils");

class Client {
    constructor() {
        this.config = loadConfig("s3");
        this.client = new Minio.Client(this.config);
    }

    writeFile(stream, filename, meta) {
        return this.client.putObject(this.config.bucket, filename, stream, null, meta);
    }

    readFile(filename) {
        return this.client.getObject(this.config.bucket, filename);
    }

    deleteFile(filename) {
        return this.client.removeObject(this.config.bucket, filename);
    }

    newFilename() {
        return uuid();
    }
}

module.exports = new Client();
