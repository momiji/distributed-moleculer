#/bin/sh
cd "$(dirname "$0")"

# dev conf
MINIO_ACCESS_KEY=test
MINIO_SECRET_KEY=test1234
MINIO_SERVERS=/tmp/ocr-ms/moleculer

# override for production
source ./start-conf

./minio server $MINIO_SERVERS
