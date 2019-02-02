#/bin/sh
cd "$(dirname "$0")"

# dev conf
CONSUL_IP=$( gethostip -d ${HOSTNAME%%.*} )
CONSUL_MASTERS=( $IP )

# override for production
source ./start.conf

# compute
QUORUM=${#CONSUL_MASTERS[@]}
QUORUM=$((1+QUORUM/2))
ISMASTER=
echo " ${CONSUL_MASTERS[@]} " | grep -q " $IP " && ISMASTER=1
RETRY=
for i in ${CONSUL_MASTERS[@]}; do
  RETRY="$RETRY -retry-join $i"
done

pkill consul
set -x
if [ -n "$ISMASTER" ]; then
  ./consul agent -bind $CONSUL_IP -config-file ./consul.json $RETRY -server -bootstrap-expect $QUORUM "$@"
else
  ./consul agent -bind $CONSUL_IP -config-file ./consul.json $RETRY "$@"
fi
