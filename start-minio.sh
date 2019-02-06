#/bin/sh
cd "$(dirname "$0")"

# dev conf
MINIO_ACCESS_KEY=test
MINIO_SECRET_KEY=test1234
MINIO_SERVERS=( /tmp/ocr-ms/moleculer )

# override for production
[ -f ./start.conf ] && source ./start.conf

# run
export MINIO_ACCESS_KEY
export MINIO_SECRET_KEY
./minio server ${MINIO_SERVERS[@]}
