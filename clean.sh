#!/bin/bash
MC=$PWD/mc

cd /tmp/ocr-ms/moleculer
ls -d test*/*.{in,out} | xargs -P0 -i $MC rm local/{}
