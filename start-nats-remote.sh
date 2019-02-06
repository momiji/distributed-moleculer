#/bin/sh
cd "$(dirname "$0")"

# dev conf
NATS_REMOTE_PORT=5222
NATS_REMOTE_CLUSTER=5248
NATS_REMOTE_HTTP=9222
NATS_REMOTE_ROUTES=()

# override for production
[ -f ./start.conf ] && source ./start.conf

# compute

# run
./gnatsd --config <(
echo "port: $NATS_REMOTE_PORT"
echo "http_port: $NATS_REMOTE_HTTP"
echo "cluster {"
echo "  listen 0.0.0.0:$NATS_REMOTE_CLUSTER"
if [ ${#NATS_REMOTE_ROUTES[@]} != 0 ]; then
  echo "  routes = ["
  for ip in ${NATS_REMOTE_ROUTES[@]}; do
    echo "    nats://$ip:$NATS_REMOTE_CLUSTER"
  done
  echo "  ]"
fi
echo "}"
)
