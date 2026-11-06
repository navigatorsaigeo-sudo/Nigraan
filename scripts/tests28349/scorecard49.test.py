#!/usr/bin/env python3
"""v91.17.283.48 (NIGRAAN 1.0.9) item 6 · the Pakistan model scorecard.
  S1 the builder copies the locked scorers' decisions and MAEs cell by cell (no number computed): every row's P1 / P3 / C2 / H3 equals
     its cells.csv / cells_h.csv row; the best-on-the-evidence rule as stated; the caveat (information advantage) and the attribution
  S2 the monthly job: first run records the inputs (no re-score); unchanged inputs -> no re-score; changed inputs -> the scorers run into
     out_runs/<day> and out_height_runs/<day> (out/ and out_height/ untouched) and the scorecard is rebuilt from them; a scorer lock stop
     (exit 3) keeps the previous scorecard and exits 3
  S3 the server: /api/sources/scorecard answers the customer line with the attribution unscrubbed; /api/ops/scorecard is operator-only
     and carries the rows, the caveat and the live shadow; the pyjob modelScorecard is monthly (720 h)
usage: python3 -I scorecard49.test.py <tree> <scoring dir with out/ and out_height/> [base url]"""
import sys, os, json, csv, shutil, subprocess, tempfile, urllib.request
T, SC = sys.argv[1], sys.argv[2]; BASE = sys.argv[3] if len(sys.argv) > 3 else None
P = F = 0
def ok(c, m, i=None):
    global P, F
    print(('PASS ' if c else 'FAIL ') + m + ('' if c or i is None else ' :: ' + str(i)[:300])); P += bool(c); F += (not c)
PY = sys.executable; SCR = os.path.join(T, 'station-lake', 'scripts', 'model_scorecard.py')
tmp = tempfile.mkdtemp(prefix='sc49_')
def run(*a): return subprocess.run([PY, '-I', SCR, *a], capture_output=True, text=True)
# S1
d1 = os.path.join(tmp, 'd1'); os.makedirs(d1)
r = run('--data', d1, '--cells', os.path.join(SC, 'out', 'cells.csv'), '--cells-h', os.path.join(SC, 'out_height', 'cells_h.csv'), '--pass-h', os.path.join(SC, 'out_height', 'PASS_H.json'), '--run-info', os.path.join(SC, 'out', 'RUN_INFO.json'))
J = json.load(open(os.path.join(d1, 'model-scorecard.json'), encoding='utf-8'))
C = {(x['comparison'], x['target'], int(x['day']), x['zone']): x for x in csv.DictReader(open(os.path.join(SC, 'out', 'cells.csv'), encoding='utf-8'))}
H = {(x['comparison'], x['target'], int(x['day']), x['zone']): x for x in csv.DictReader(open(os.path.join(SC, 'out_height', 'cells_h.csv'), encoding='utf-8'))}
bad = []
for row in J['rows']:
    for key, comp, src in (('p1', 'P1', C), ('p3', 'P3', C), ('c2', 'C2', C), ('h3', 'H3', H)):
        x = src.get((comp, row['target'], row['day'], row['zone'])); c = row[key]
        if key == 'h3' and row['zone'] not in ('hills', 'mountain'): continue
        if x is None: (bad.append(('missing', key, row['target'], row['zone'], row['day'])) if c else None); continue
        if not c or c['decision'] != x['decision'] or c['robust'] != (x['robust'] == 'True'): bad.append(('decision', key, row['target'], row['zone'], row['day'])); continue
        m = 'ets' if row['metric'] == 'ets' else 'mae'
        for a, b in ((c['wn3'], x.get(m + '_wn3')), (c['other'], x.get(m + '_x'))):
            try: bv = round(float(b), 3)
            except (TypeError, ValueError): bv = None
            if bv != bv: bv = None
            if a != bv: bad.append(('value', key, row['target'], row['zone'], row['day'], a, b))
ok(len(J['rows']) == 96 and not bad, 'S1 every cell copies the scorers’ decision, robustness and MAE / ETS (%d rows)' % len(J['rows']), bad[:5])
rule_bad = [r_ for r_ in J['rows'] if (r_['p3'] and r_['p3']['word'] == 'served' and r_['best'] != 'served') or (r_['p3'] and r_['p3']['word'] == 'WN3' and r_['best'] not in ('wn3', 'mixed')) or (r_['p3'] and r_['p3']['word'] == 'tie' and r_['best'] != 'tie')]
ok(not rule_bad, 'S1 best on the evidence follows the stated rule (served comparison first)', [(x['target'], x['zone'], x['day'], x['best']) for x in rule_bad[:5]])
ok('information advantage' in J['caveat'] and 'provisional' in J['customerLine'] and J['attribution'][0] == 'WeatherNext 3, Google DeepMind' and 'CC-BY-4.0' in J['attribution'][1], 'S1 caveat (information advantage), provisional customer wording, attribution WeatherNext 3 / ECMWF CC-BY')
ok(J['served'] is False and J['heightGate']['passed'] == [], 'S1 never served; the height gate passed nothing (hills and mountain stay out)')
# S2 the monthly job in a laptop-like layout: <nig>/_admin/weathernext/scoring, <nig>/nig/nigraan-local/data
nig = os.path.join(tmp, 'NIGRAAN'); sc = os.path.join(nig, '_admin', 'weathernext', 'scoring'); data = os.path.join(nig, 'nig', 'nigraan-local', 'data')
os.makedirs(os.path.join(sc, 'scripts')); os.makedirs(os.path.join(sc, 'frozen')); os.makedirs(data)
for sub in ('out', 'out_height'): shutil.copytree(os.path.join(SC, sub), os.path.join(sc, sub))
open(os.path.join(sc, 'frozen', 'FROZEN_MANIFEST.json'), 'w').write('{"files":{}}')
STUB = '''import sys, os, shutil
a = sys.argv; out = a[a.index('--out') + 1]; src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '%s')
if os.environ.get('STUB_STOP') == '1': print('lock stop'); sys.exit(3)
for f in os.listdir(src): shutil.copy(os.path.join(src, f), out)
'''
open(os.path.join(sc, 'scripts', 'score_wn3.py'), 'w').write(STUB % 'out'); open(os.path.join(sc, 'scripts', 'score_wn3_height.py'), 'w').write(STUB % 'out_height')
def hashes(d): import hashlib; return {f: hashlib.sha256(open(os.path.join(d, f), 'rb').read()).hexdigest() for f in sorted(os.listdir(d))}
h0 = (hashes(os.path.join(sc, 'out')), hashes(os.path.join(sc, 'out_height')))
jobargs = ['--data', data, '--python', PY]
r1 = run(*jobargs); j1 = json.load(open(os.path.join(data, 'model-scorecard.json')))
ok(r1.returncode == 0 and j1.get('inputsFingerprint') and j1['refresh']['rescored'] is None and not os.path.exists(os.path.join(sc, 'out_runs')), 'S2 first monthly run: records the inputs, rebuilds from out/ (no re-score)', r1.stdout + r1.stderr)
r2 = run(*jobargs); j2 = json.load(open(os.path.join(data, 'model-scorecard.json')))
ok(r2.returncode == 0 and j2['refresh']['rescored'] is None, 'S2 unchanged inputs: no re-score')
open(os.path.join(sc, 'frozen', 'FROZEN_MANIFEST.json'), 'w').write('{"files":{},"rebuilt":"new month"}')
r3 = run(*jobargs); j3 = json.load(open(os.path.join(data, 'model-scorecard.json')))
day = j3['refresh']['rescored']
ok(r3.returncode == 0 and day and os.path.exists(os.path.join(sc, 'out_runs', day, 'cells.csv')) and j3['source']['scoring'] == 'out_runs/' + day, 'S2 new inputs: the scorers re-run into out_runs/<day>, the scorecard is built from them', r3.stdout + r3.stderr)
ok((hashes(os.path.join(sc, 'out')), hashes(os.path.join(sc, 'out_height'))) == h0, 'S2 the first locked outputs out/ and out_height/ are never written')
open(os.path.join(sc, 'frozen', 'FROZEN_MANIFEST.json'), 'w').write('{"files":{},"rebuilt":"another month"}')
env = dict(os.environ, STUB_STOP='1'); r4 = subprocess.run([PY, '-I', SCR, *jobargs], capture_output=True, text=True, env=env); j4 = json.load(open(os.path.join(data, 'model-scorecard.json')))
ok(r4.returncode == 3 and j4['refresh'] == j3['refresh'], 'S2 a scorer lock stop (exit 3): the previous scorecard is kept, exit 3', r4.stdout)
# S3 the server and the job list
pj = open(os.path.join(T, 'server', 'api', 'pyjobs.mjs'), encoding='utf-8').read()
ok("id: 'modelScorecard', script: 'model_scorecard.py', args: ['--data', dataDir], everyH: 720" in pj, 'S3 pyjob modelScorecard: monthly (every 720 h, the cadence kept across restarts)')
if BASE:
    def get(p, view):
        rq = urllib.request.Request(BASE + p, headers={'x-agn-view': view})
        try:
            with urllib.request.urlopen(rq, timeout=30) as f: return f.status, json.loads(f.read().decode('utf-8'))
        except urllib.error.HTTPError as e: return e.code, None
    s, j = get('/api/sources/scorecard', 'customer')
    ok(s == 200 and j and j['ok'] and 'Google DeepMind' in j['line'] and 'ECMWF 9 km' in j['line'] and j['attribution'][0] == 'WeatherNext 3, Google DeepMind', 'S3 /api/sources/scorecard (customer view): the line and the attribution, names kept (licence credit)', j)
    s, j = get('/api/ops/scorecard', 'customer'); ok(s == 403, 'S3 /api/ops/scorecard refused in the customer view (%s)' % s)
    s, j = get('/api/ops/scorecard', 'operator'); ok(s == 200 and j and j['ok'] and len(j['rows']) == 96 and 'liveShadow' in j and 'information advantage' in j['caveat'], 'S3 /api/ops/scorecard (operator): rows, caveat, live shadow')
shutil.rmtree(tmp, ignore_errors=True)
print('scorecard49: %d pass, %d fail' % (P, F)); sys.exit(1 if F else 0)
