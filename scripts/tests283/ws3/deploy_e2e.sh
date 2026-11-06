#!/bin/bash
# v91.17.283 · WS3 items 5-6 end to end · DEPLOY / ROLLBACK of a package made by scripts/deploy/mkdeploy.mjs, over a copy of the live
# base tree, with the real supervisor (restarted by a watchdog loop), the front proxy and two server ports, PowerShell 7 (pwsh), a mock
# provider (no network, no key), no administrator rights. Steps:
#   0a a package file changed after it was made         -> REFUSED (SHA256SUMS), exit 2, nothing changed
#   0b a live file that is not the base version          -> REFUSED (EXPECTED_prev), exit 2, nothing changed
#   1  deploy                                            -> 0, health = new version, journal active
#   2  deploy again                                      -> 0 "ALREADY DEPLOYED" (idempotent)
#   3  rollback                                          -> 0, every packaged file = base, journal rolledback
#   4  REBOOT MID-DEPLOY: the deploy is killed with every NIGRAAN process after its copy (power cut); the supervisor is started again
#                                                        -> it puts the base files back BEFORE a server starts; health = base version
#   5  deploy again                                      -> 0 (resumable: rollback of the record, then a fresh deploy)
#   6  the deploy script is killed after the swap (servers keep running); deploy again -> "RESUME", live checks only, 0
# usage: bash scripts/tests283/ws3/deploy_e2e.sh <package dir> <base tree> <new tree> [workdir]
# env: SCRATCH (the folder with perf/bin/mockom.mjs, i2731/bin/fault.mjs, ops270/sl, i276/overlay), PWSH
set -u
PKG=$1; LIVE=$2; INT=$3; W=${4:-/tmp/claude-0/v283/WS3/e2e}
S=${SCRATCH:-/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad}; P=$S/perf; O=$S/ops270; FB=$S/i2731/bin
NOPROM=/tmp/claude-0/v2802/pkgbuild/bin/noprom.mjs; PWSH=${PWSH:-/tmp/claude-0/x/pwsh/pwsh}
DPS=$(cd $PKG && ls DEPLOY_V*.ps1); VU=${DPS#DEPLOY_V}; VU=${VU%.ps1}; RPS=ROLLBACK_V$VU.ps1
FULL=$(node -e "console.log(require('$INT/package.json').version)"); BASEV=$(node -e "console.log(require('$LIVE/package.json').version)")
R=$W/R; OUT=$W/out; NL=$R/nig/nigraan-local; J=$NL/data/run/deploy-journal.json
PASS=0; FAIL=0; ok() { if [ "$1" = 0 ]; then PASS=$((PASS+1)); echo "PASS $2"; else FAIL=$((FAIL+1)); echo "FAIL $2"; fi; }
rm -rf $W; mkdir -p $NL $R/_admin/step2 $OUT
(cd $LIVE && tar --exclude=./data/feat --exclude=./data/run --exclude=./data/nigraan-db.json --exclude=./data/nigraan-db.json.prev --exclude=./data/server.log --exclude=./data/.store.lock --exclude=./data/token-secret -cf - .) | (cd $NL && tar -xpf -)
cp -r $LIVE/data/feat $NL/data/feat; chmod -R u+w $NL; cp $S/i276/overlay/data/* $NL/data/
printf 'base=http://127.0.0.1:9\n' > $NL/fleet.key   # a fake, unreachable fleet address for the test install (not a credential)
cp -a $O/sl $R/nig/station-lake; mkdir -p $R/DROP_DATA_HERE $R/nig/ds2
for d in /mnt/user-data/outputs/v269/new/_admin /mnt/user-data/outputs/v270/new/_admin /mnt/user-data/outputs/v27*/pkg/new/_admin /mnt/user-data/outputs/v28*/pkg/new/_admin; do [ -d $d ] && cp -a $d/. $R/_admin/; done; rm -rf $R/_admin/step2/*
cp -a $PKG $R/_admin/step2/v$VU; cp $R/_admin/step2/v$VU/*.ps1 $R/_admin/step2/
printf '# NIGRAAN status report (test copy)\n\nReport written: 2026-10-12.\n' > $R/NIGRAAN_STATUS_REPORT.md
export NIGRAAN_PROXY_PORT=9163 NIGRAAN_BACKEND_PORTS=9164,9165 NIGRAAN_CRASH_WAIT_S=1 NIGRAAN_DRAIN_S=20 FAULT_FILE=$W/fault NOPROM_FILE=$W/noprom NIGRAAN_SWAP_READY_S=600 NIGRAAN_SWAP_PROMOTE_S=30 NIGRAAN_SUP_STOP_S=30
export MACH_API_KEY=MOCK-NOT-A-KEY NIGRAAN_ENGINE=0 NIGRAAN_PYJOBS=0 NIGRAAN_WORKER=0 NODE_OPTIONS="--import $P/bin/mockom.mjs --import $FB/fault.mjs --import $NOPROM"
unset OPEN_METEO_API_KEY NIGRAAN_DATA_DIR
BASEURL=http://127.0.0.1:9163
startwd() { ( cd $NL; while [ ! -e $W/stop-wd ]; do node scripts/wd/supervisor.mjs >> $OUT/sup.out 2>&1; echo "[wd] supervisor exited $? at $(date +%T)" >> $OUT/sup.out; sleep 1; done ) & WD=$!; }
warm() { for i in $(seq 1 900); do curl -s -m 2 $BASEURL/health | grep -q '"warm":true' && return 0; sleep 1; done; return 1; }
ver() { curl -s -m 5 $BASEURL/health | grep -o '"serviceVersion":"[^"]*"' | head -1 | cut -d'"' -f4; }
jst() { node -e "try{console.log(JSON.parse(require('fs').readFileSync('$J','utf8')).state)}catch(e){console.log('(none)')}"; }
run() { local s=$1; shift; NODE_OPTIONS= $PWSH -NoProfile -File $R/_admin/step2/$s -Root $R -Base $BASEURL "$@" > $OUT/$s.$STEP.out 2>&1; RC=$?; echo "STEP $STEP $s exit $RC ($(date +%T)); journal $(jst); health $(ver)"; }
samebase() { local n=0; for f in $(cd $R/_admin/step2/v$VU/new/nigraan-local && find . -type f | sed 's#^\./##'); do if [ -e $LIVE/$f ]; then cmp -s $LIVE/$f $NL/$f || n=$((n+1)); else [ -e $NL/$f ] && n=$((n+1)); fi; done; echo $n; }
samenew() { local n=0; for f in $(cd $R/_admin/step2/v$VU/new/nigraan-local && find . -type f | sed 's#^\./##'); do cmp -s $R/_admin/step2/v$VU/new/nigraan-local/$f $NL/$f || n=$((n+1)); done; echo $n; }
killall_nig() { for p in $(pgrep -f "server/server.mjs|supervisor.mjs|proxy.mjs|pwsh"); do if tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -q "$R\|deploy_swap\|DEPLOY_V$VU\|ROLLBACK_V$VU" || case "$(readlink /proc/$p/cwd 2>/dev/null)" in $R*) true;; *) false;; esac; then kill -9 $p 2>/dev/null; fi; done; }
waitj() { for i in $(seq 1 1200); do case " $1 " in *" $(jst) "*) return 0;; esac; sleep 0.5; done; return 1; }

echo "== install: base v$BASEV, package v$FULL ($PKG)"; startwd; warm; echo "  health $(ver)"
STEP=0a; F1=$(cd $R/_admin/step2/v$VU/new/nigraan-local && find . -name '*.mjs' | head -1); cp $R/_admin/step2/v$VU/new/nigraan-local/$F1 $W/keep1; echo '// changed' >> $R/_admin/step2/v$VU/new/nigraan-local/$F1
run $DPS; grep -q "REFUSED: the package is not complete or was changed" $OUT/$DPS.0a.out; ok $([ $RC = 2 ] && [ "$(samebase)" = 0 ] && grep -q "REFUSED: the package" $OUT/$DPS.0a.out && echo 0 || echo 1) "0a a changed package file -> REFUSED by SHA256SUMS, exit 2, nothing changed"
cp $W/keep1 $R/_admin/step2/v$VU/new/nigraan-local/$F1
STEP=0b; F2=$(grep -m1 -o 'nig\\nigraan-local\\server\\api\\[a-z]*\.mjs' $R/_admin/step2/v$VU/EXPECTED_prev_SHA256.txt | sed 's#\\#/#g; s#^nig/nigraan-local/##'); cp $NL/$F2 $W/keep2; echo '// a local edit' >> $NL/$F2
run $DPS; ok $([ $RC = 2 ] && grep -q "does not hold v.* for the files this package replaces" $OUT/$DPS.0b.out && echo 0 || echo 1) "0b a live file that is not the base ($F2) -> REFUSED by EXPECTED_prev, exit 2"
cp $W/keep2 $NL/$F2
STEP=1; run $DPS; ok $([ $RC = 0 ] && [ "$(ver)" = "$FULL-local" ] && [ "$(jst)" = active ] && [ "$(samenew)" = 0 ] && echo 0 || echo 1) "1 deploy -> 0, version $FULL, journal active, every file = package"
grep -h "live check FAILED\|FAILED:" $OUT/$DPS.1.out | head -5 | cut -c1-300
STEP=2; run $DPS; ok $([ $RC = 0 ] && grep -q "ALREADY DEPLOYED" $OUT/$DPS.2.out && echo 0 || echo 1) "2 deploy again -> 0, ALREADY DEPLOYED (idempotent)"
STEP=3; run $RPS; ok $([ $RC = 0 ] && [ "$(samebase)" = 0 ] && [ "$(jst)" = rolledback ] && [ "$(ver)" = "$BASEV-local" ] && echo 0 || echo 1) "3 rollback -> 0, every packaged file = base, journal rolledback, version $BASEV"
STEP=4; ( NODE_OPTIONS= $PWSH -NoProfile -File $R/_admin/step2/$DPS -Root $R -Base $BASEURL > $OUT/$DPS.4.out 2>&1 ) & DP=$!
waitj "copied swapping"; echo "  journal $(jst) at $(date +%T): POWER CUT (every NIGRAAN process and the deploy killed)"
kill -9 $WD 2>/dev/null; killall_nig; sleep 2; echo "  files differing from base now: $(samebase)"
startwd; warm; sleep 2
ok $([ "$(ver)" = "$BASEV-local" ] && [ "$(samebase)" = 0 ] && [ "$(jst)" = restored-by-supervisor ] && grep -q "deploy journal: restored" $NL/data/run/supervisor.log && echo 0 || echo 1) "4 after the restart the supervisor put the base files back before the server started (health $BASEV, journal $(jst))"
grep -h "had not finished" $NL/data/run/supervisor.log | tail -1 | cut -c1-300
STEP=5; run $DPS; ok $([ $RC = 0 ] && grep -q "RESUME: an earlier run of DEPLOY_V$VU did not finish" $OUT/$DPS.5.out && [ "$(ver)" = "$FULL-local" ] && [ "$(jst)" = active ] && echo 0 || echo 1) "5 deploy again after the power cut -> rollback of the record, fresh deploy, 0, journal active"
STEP=6r; run $RPS; STEP=6; ( NODE_OPTIONS= $PWSH -NoProfile -File $R/_admin/step2/$DPS -Root $R -Base $BASEURL > $OUT/$DPS.6.out 2>&1 ) & DP=$!
waitj "swapped"; sleep 1; for p in $(pgrep -f "DEPLOY_V$VU.ps1|deploy_swap.ps1"); do tr '\0' ' ' < /proc/$p/cmdline | grep -q "$R" && kill -9 $p; done; echo "  journal $(jst): the deploy window was closed after the swap"
STEP=6b; run $DPS; ok $([ $RC = 0 ] && grep -q "RESUME: an earlier run copied and swapped" $OUT/$DPS.6b.out && [ "$(jst)" = active ] && echo 0 || echo 1) "6 deploy killed after the swap; run again -> RESUME (live checks only), 0, journal active"
echo "STOP"; touch $W/stop-wd; SP=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$NL/data/run/supervisor.lock','utf8')).pid)}catch(e){}"); [ -n "$SP" ] && kill $SP 2>/dev/null; sleep 8; kill $WD 2>/dev/null; killall_nig
cp $R/_admin/deploy_v$VU.log $OUT/ 2>/dev/null; cp $NL/data/run/supervisor.log $OUT/ 2>/dev/null
echo "---- $PASS passed, $FAIL failed"; [ -z "${KEEP:-}" ] && rm -rf $R; exit $FAIL
