#!/bin/bash
# cmp60.sh <freeze ISO> [outdir]: WS2 60-place identity check. Fresh run copies of the base (v2821) and the WS2 tree, the same frozen clock
# (MOCK_FREEZE), mock provider, the same real synop records up to the frozen time; urls60.mjs (compare3's 60-place set + sweeps + the WS2
# routes) asked of each tree in turn on port 9321 (one server at a time), captured, stopped; diff60.mjs lists every differing leaf.
S=/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad; P=$S/perf
mkrun() { D=$1; SRC=$2; rm -rf $D; mkdir -p $D/DROP_DATA_HERE $D/nigraan-local   # a run layout (as v282/work/mkrun0.sh): plain copies
  (cd $SRC && tar --exclude=./data/run --exclude=./data/nigraan-db.json.prev --exclude=./data/server.log -cf - .) | (cd $D/nigraan-local && tar -xpf -)
  cp -a $S/ops270/sl $D/station-lake; rm -f $D/nigraan-local/STATUS.md $D/nigraan-local/data/.store.lock; chmod -R u+w $D/nigraan-local; }
O=${2:-/tmp/claude-0/v283/WS2/cmp}; C=/tmp/claude-0/v283/WS2/runs; HERE=$(cd $(dirname $0) && pwd)
F=$(node -e "console.log(Date.parse('$1'))"); mkdir -p $O
mkrun $C/B /tmp/claude-0/v2821/srv; mkrun $C/N /tmp/claude-0/v283/WS2/srv
python3 -I - "$1" $C/B/nigraan-local/data/cache/synop-recent.json $C/N/nigraan-local/data/cache/synop-recent.json <<'PY'
import json, sys
now = sys.argv[1]; REC = {}
for l in open('/mnt/user-data/uploads/NIGRAAN/nig/station-lake/archive/synop/synop_2026-10.jsonl'):
    r = json.loads(l)
    if r.get('t_c') is None or r.get('served_c') is None or r['t'] > now: continue
    REC.setdefault(r['sid'], {})[r['t']] = {'o': r['t_c'], 's': r['served_c']}
for f in sys.argv[2:]: json.dump(REC, open(f, 'w'))
print('synop records', sum(len(v) for v in REC.values()), 'stations', len(REC))
PY
node $HERE/urls60.mjs $HERE/../../../server/contract/units.json $O/urls60.json
for X in B N; do   # one server at a time (the shared container ran out of memory with two); a lost server is restarted and the capture resumed
  for try in 1 2 3; do
    env NIGRAAN_COPIES_DIR=$C/$X/copies MOCK_FREEZE=$F $P/bin/start.sh $C/$X/nigraan-local 9321 $O/server_$X.log
    for i in $(seq 1 600); do curl -s http://127.0.0.1:9321/health | grep -q '"warm":true' && break; sleep 0.5; done
    sleep ${WAITS:-20}; node $HERE/capture60.mjs 9321 $O/urls60.json $O/cap_$X.json; rc=$?; $P/bin/stop.sh 9321; sleep 3
    for i in $(seq 1 60); do curl -s -m 1 http://127.0.0.1:9321/health >/dev/null || break; sleep 0.5; done
    [ $rc = 0 ] && break
  done
done
node $HERE/diff60.mjs $O/urls60.json $O/cap_B.json $O/cap_N.json $O/diff60.json | tee $O/diff60.out
rm -rf $C
