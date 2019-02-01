#/bin/sh
cd "$(dirname "$0")"

# dev conf
IP=${HOSTNAME%%.*}
MASTERS=( $IP )

# override for production
source ./start.conf

# compute
QUORUM=${#MASTERS[@]}
QUORUM=$((1+QUORUM/2))
ISMASTER=
echo " ${MASTERS[@]} " | grep -q " $IP " && ISMASTER=1
RETRY=
for i in ${MASTERS[@]}; do
  RETRY="$RETRY -retry-join $i"
done

pkill consul

if [ -n "$ISMASTER" ]; then
  ./consul agent -bind $IP -config-file ./consul.json $RETRY -server -bootstrap-expect $QUORUM "$@"
else
  ./consul agent -bind $IP -config-file ./consul.json $RETRY "$@"
fi
