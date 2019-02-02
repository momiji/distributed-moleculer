#/bin/sh
cd "$(dirname "$0")"

# dev conf
NATS_LOCAL_PORT=4222
NATS_LOCAL_CLUSTER=4248
NATS_LOCAL_HTTP=8222
NATS_LOCAL_ROUTES=()

# override for production
source ./start.conf

# compute

# run
./gnatsd --config <(
echo "port: $NATS_LOCAL_PORT"
echo "http_port: $NATS_LOCAL_HTTP"
echo "cluster {"
echo "  listen 0.0.0.0:$NATS_LOCAL_CLUSTER"
if [ ${#NATS_LOCAL_ROUTES[@]} != 0 ]; then
  echo "  routes = ["
  for ip in ${NATS_LOCAL_ROUTES[@]}; do
    echo "    nats://$ip:$NATS_LOCAL_CLUSTER"
  done
  echo "  ]"
fi
echo "}"
)
