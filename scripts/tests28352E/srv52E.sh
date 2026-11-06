#!/bin/bash
# v91.17.283.52 E · test server: mock provider, offline, a COPY of the laptop data, heap 900 MB. usage: srv52E.sh <tree> <port> <dataDir>
T=$1; P=$2; DD=$3; cd $T; mkdir -p /dev/shm/e52
NIGRAAN_DATA_DIR=$DD NIGRAAN_REACT=0 PORT=$P HOST=127.0.0.1 NIGRAAN_PYJOBS=0 NIGRAAN_ECMWF010=0 NIGRAAN_CALL_BUDGET=off MACH_API_KEY=MOCK-NOT-A-KEY NIGRAAN_EPD=0 NIGRAAN_DOS=0 \
 NIGRAAN_ENGINE=0 NIGRAAN_WORKER=0 NIGRAAN_AGENTS=0 NIGRAAN_ACCMON=0 NIGRAAN_OM_ARCHIVE=0 NIGRAAN_ENS_ARCHIVE=0 NIGRAAN_VCARCHIVE=0 NIGRAAN_ARCHIVE=0 NIGRAAN_REPORT_RATE=100000 NIGRAAN_SWEEP_WARM=0 \
 nohup node --no-warnings --max-old-space-size=900 --import /tmp/claude-0/r2/tools/clock_offline.mjs --import ./scripts/tests283/lib/mockprovider.mjs server/server.mjs > /dev/shm/e52/srv$P.log 2>&1 &
echo $! > /dev/shm/e52/srv$P.pid
for i in $(seq 1 300); do sleep 1; curl -s http://127.0.0.1:$P/health | grep -q '"warm"' && { echo "UP $P after $i s"; exit 0; }; kill -0 $(cat /dev/shm/e52/srv$P.pid) 2>/dev/null || { echo DIED; tail -5 /dev/shm/e52/srv$P.log; exit 1; }; done; echo NOT UP; tail -20 /dev/shm/e52/srv$P.log
