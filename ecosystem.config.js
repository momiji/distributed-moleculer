module.exports = {
  apps: [
    {
      name: 'worker',
      script: './worker.js',
      instances: 2,
      autorestart: true,
      watch: "worker.js",
      max_memory_restart: '1G',
      kill_timeout: 30000,
      exec_mode: "cluster",
    },
    {
      name: 'controller',
      script: './controller.js',
      autorestart: true,
      watch: "controller.js",
      max_memory_restart: '1G',
      kill_timeout: 10000,
      exec_mode: "cluster",
    },
    {
      name: "localstore",
      script: "./consul",
      args: "lock localstore node localstore.js",
      autorestart: true,
      watch: "localstore.js",
      kill_timeout: 10000,
//      exec_mode: "cluster",
    },
    {
      name: 'remotestore',
      script: "./consul",
      args: 'lock remotestore node remotestore.js',
      autorestart: true,
      watch: "remotestore.js",
      kill_timeout: 10000,
//      exec_mode: "cluster",
    },
    {
      name: "nats-local",
      script: "./gnatsd",
      args: "--config nats-local.conf",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "nats-remote",
      script: "./gnatsd",
      args: "--config nats-remote.conf",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "nats-local-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:8222 --port 8223",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "nats-remote-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:9222 --port 9223",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "minio",
      script: "./start-minio.sh",
      autorestart: true
    },
    {
      name: "consul",
      script: "./start-consul.sh",
      autorestart: true
    }
  ],
};
