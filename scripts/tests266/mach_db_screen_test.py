"""v91.17.266 · the history screen (scripts/mach_db_screen.py) on a synthetic record: neighbours, reference (synop feed) neighbours,
the forecast-residual check, too few days, an excluded key, and the source line written once.
usage: python scripts/tests266/mach_db_screen_test.py   (builds a temporary nigraan-local + station-lake; runs the script there)"""
import os, sys, json, shutil, tempfile, subprocess, math, random
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); NL0 = os.path.dirname(os.path.dirname(HERE))
RULE = json.load(open(os.path.join(NL0, 'data', 'mach-siting.json')))['rule']
tmp = tempfile.mkdtemp(prefix='v266-db-'); NL = os.path.join(tmp, 'nigraan-local'); LAKE = os.path.join(tmp, 'station-lake', 'archive')
for d in [os.path.join(NL, 'scripts'), os.path.join(NL, 'data'), os.path.join(LAKE, 'fleet', 'db'), os.path.join(LAKE, 'synop')]: os.makedirs(d, exist_ok=True)
shutil.copy(os.path.join(NL0, 'scripts', 'mach_db_screen.py'), os.path.join(NL, 'scripts'))
P = {'A': (33.60, 73.00), 'B': (33.62, 73.02), 'C': (33.58, 73.03), 'D': (33.61, 72.99), 'E': (31.00, 70.00), 'F': (31.08, 70.05), 'G': (29.0, 66.0), 'H': (28.0, 64.0), 'I': (27.0, 62.0), 'X': (33.59, 73.01), 'Y': (33.591, 73.011)}
OFF = {'A': 0.2, 'B': -0.3, 'C': 0.1, 'D': 4.0, 'E': 0.4, 'F': -0.2, 'G': 0.3, 'H': 3.6, 'I': 0.0, 'X': 0.0, 'Y': 0.0}
random.seed(3)
hours = pd.date_range('2026-09-20', '2026-10-06 23:00', freq='h', tz='UTC')
truth = lambda t: 22 + 7 * math.sin((((t.hour + 5) % 24) - 9) / 24 * 2 * math.pi)
err = lambda t: 1.5 * math.sin(t.value / 86400e9)
dewp = lambda T, rh: (lambda g: 243.5 * g / (17.67 - g))(math.log(rh / 100) + 17.67 * T / (243.5 + T))   # psychro.mjs dewPointC
db, pairs = [], []
for k, (la, lo) in P.items():
    hs = hours[-72:] if k == 'I' else hours
    for t in hs:
        T = truth(t) + OFF[k] + random.uniform(-0.2, 0.2); rh = 50 + random.uniform(-1, 1)
        db.append(dict(time=t.isoformat(), station_key=k, source='api', temperature_c=round(T, 1), dew_point_c=None, humidity_pct=round(rh, 1), pressure_hpa=round(950 + random.uniform(-5, 5) + hash(k) % 7, 1)))
        pairs.append(dict(paired_utc=t.isoformat(), key=k, lat=la, lon=lo, model_elev_m=500, obs_utc=t.isoformat(), hour_utc=t.strftime('%Y-%m-%dT%H:00Z'), lead_h=1, temp_c=round(T, 1), rh_pct=round(rh, 1), dew_c=round(dewp(T, rh), 1), wind_kmh=None,
                          fc_raw_c=round(truth(t) + err(t), 2), fc_served_c=None, fc_rh_pct=50, fc_served_rh_pct=None, fc_wind_kmh=None, corrected=0))
pd.DataFrame(db).to_csv(os.path.join(LAKE, 'fleet', 'db', 'mach_db_2026-10.csv'), index=False)
pd.DataFrame(pairs).to_csv(os.path.join(LAKE, 'fleet', 'fleet_pairs_2026-10.csv'), index=False)
json.dump({'stations': [dict(station_key=k, lat=la, lng=lo, provider='ecowitt', provider_station_id=('same' if k in ('X', 'Y') else k)) for k, (la, lo) in P.items()]}, open(os.path.join(LAKE, 'fleet', 'db', 'stations.json'), 'w'))
with open(os.path.join(LAKE, 'synop', 'synop_2026-10.jsonl'), 'w') as f:
    for t in hours[::3]: f.write(json.dumps(dict(sid='41999', t=t.strftime('%Y-%m-%dT%H:00Z'), t_c=round(truth(t) + random.uniform(-0.1, 0.1), 1), td_c=None, served_c=None)) + '\n')
json.dump({'stations': {'41999': dict(name='Reference', lat=31.02, lon=70.01, elevM=520)}}, open(os.path.join(NL, 'data', 'synop-stations.json'), 'w'))
json.dump({'stations': {k: dict(lat=la, lon=lo, elevM=500, basis=dict(zone='plains', model='t'), hours={}) for k, (la, lo) in P.items()}}, open(os.path.join(NL, 'data', 'mach-running-bias.json'), 'w'))
json.dump({'built': 'x', 'source': 'AGN MACH fleet history; from 6 Oct 2026 the AGN MACH observation database record (old run); from 6 Oct 2026 the AGN MACH observation database record (older run)', 'rule': RULE, 'stations': {}}, open(os.path.join(NL, 'data', 'mach-siting.json'), 'w'))
out = subprocess.run([sys.executable, os.path.join(NL, 'scripts', 'mach_db_screen.py')], capture_output=True, text=True, cwd=NL)
print(out.stdout[-1500:], out.stderr[-3000:])
S = json.load(open(os.path.join(NL, 'data', 'mach-siting.json')))
st = S['stations']; ok_n = fail_n = 0
def ok(c, name, d=''):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1
    print(('PASS ' if c else 'FAIL ') + name + (' · ' + str(d)[:300] if d != '' else ''))
for k in 'ABC': ok(st[k]['verdict'] == 'trusted' and st[k].get('checkedBy') == 'neighbours', k + ' trusted by neighbours', st[k])
ok(st['D']['verdict'] == 'bad siting' and st['D'].get('checkedBy') == 'neighbours', 'D bad siting by neighbours', st['D'])
ok(st['E']['verdict'] == 'trusted' and st['E'].get('checkedBy') == 'reference', 'E trusted with the reference station as second neighbour', st['E'])
ok(st['G']['verdict'] == 'trusted' and st['G'].get('checkedBy') == 'forecast', 'G isolated: trusted by the forecast-residual check', st['G'])
ok(st['G'].get('humidityTrusted') is True and st['G'].get('dewAnomC') is not None and abs(st['G']['dewAnomC']) <= RULE['dew_abs_c'], 'G dew point judged against the forecast dew point (fleet pairs dew_c, fc_rh_pct)', st['G'])
ok(st['H']['verdict'] == 'bad siting' and st['H'].get('checkedBy') == 'forecast', 'H isolated, 3.6 C off: bad siting by the forecast check', st['H'])
ok(st['I']['verdict'] == 'unscreened', 'I with 3 days: unscreened', st['I'])
ok(st['X']['verdict'] == 'excluded' and st['Y']['verdict'] == 'excluded', 'X and Y share one source id: excluded', (st['X'], st['Y']))
ok(S['source'].count('from 6 Oct 2026') == 1 and 'reference neighbours: 1' in S['source'], 'the source line is written once', S['source'])
ok(S['rule'] == RULE, 'the rule block is unchanged')
shutil.rmtree(tmp, ignore_errors=True)
print('\n%s mach_db_screen: %d passed, %d failed' % ('FAIL' if fail_n else 'PASS', ok_n, fail_n)); sys.exit(1 if fail_n else 0)
