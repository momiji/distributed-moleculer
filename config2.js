const common = {
    site: 'second',
    transporter: "nats://localhost:6222",
};

const s3 = {
    bucket: "test2",
};

module.exports = {
    common,
    s3,
};
