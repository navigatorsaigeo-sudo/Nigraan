"""v91.17.283.33 · the retrain rain truth drops held MACH rain keys (data/mach-rain-holds.json) from both MACH sources and keeps every other
source and station. The hold block of station-lake/retrain/ifsmos/rain/truth.py is run on synthetic rows. Run: python rain_truth_holds_test.py <truth.py>"""
import sys, os, json, tempfile, pandas as pd
src = open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'station-lake'), 'retrain', 'ifsmos', 'rain', 'truth.py'), encoding='utf-8').read()
a = src.index('# ---- owner rain holds'); b = src.index('T = pd.concat(rows', a)
block = src[a:b]
ok_n = fail_n = 0
def ok(c, m, d=''):
    global ok_n, fail_n
    print(('PASS ' if c else 'FAIL ') + m + ('' if c else ' :: ' + str(d)[:300])); ok_n += bool(c); fail_n += (not c)
tmp = tempfile.mkdtemp(); os.makedirs(os.path.join(tmp, 'data'))
json.dump({'holds': [{'key': 'al_jazari', 'cleared': None}, {'key': 'khaplu', 'cleared': '2026-11-02'}]}, open(os.path.join(tmp, 'data', 'mach-rain-holds.json'), 'w'))
os.environ['NIGRAAN_APP'] = tmp; os.environ.pop('NIGRAAN_RAIN_HOLDS', None)
D = pd.Timestamp('2026-10-01')
rows = [pd.DataFrame({'pid': [1, 2, 3], 'date': D, 'win': 'pkt', 'obs_mm': 1.0, 'src': 'mach_db'}),
        pd.DataFrame({'pid': [1, 3], 'date': D, 'win': 'pkt', 'obs_mm': 2.0, 'src': 'mach_obs'}),
        pd.DataFrame({'pid': [1, 9], 'date': D, 'win': 'pkt', 'obs_mm': 3.0, 'src': 'ews'})]
g = {'os': os, 'pd': pd, 'rows': rows, 'key2pid': {'al_jazari': 1, 'khaplu': 3, 'other': 2}}
exec(block, g)
R = g['rows']
ok(sorted(R[0].pid) == [2, 3], 'MACH database source: the held key (al_jazari) is dropped, a cleared hold (khaplu) is kept', list(R[0].pid))
ok(sorted(R[1].pid) == [3], 'MACH obs source: the held key is dropped', list(R[1].pid))
ok(sorted(R[2].pid) == [1, 9], 'a non-MACH source is untouched, even at the same pid', list(R[2].pid))
os.environ['NIGRAAN_APP'] = os.path.join(tmp, 'missing')
rows2 = [pd.DataFrame({'pid': [1, 2], 'date': D, 'win': 'pkt', 'obs_mm': 1.0, 'src': 'mach_db'})]
g2 = {'os': os, 'pd': pd, 'rows': rows2, 'key2pid': {'al_jazari': 1}}; exec(block, g2)
ok(sorted(g2['rows'][0].pid) == [1, 2], 'no holds file: nothing dropped, the run goes on (the reason is printed)', list(g2['rows'][0].pid))
print('SUMMARY %d pass %d fail' % (ok_n, fail_n)); sys.exit(1 if fail_n else 0)
