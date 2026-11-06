"""v91.17.283.31 . data lane . the EWS register (data/ews-register.json) applied by station-lake/scripts/ews_register.py:
Kandia_Karang_WP_1 alarm button held (that element only), Sishper-Ultar WL-R_2 0.0 values from 21 Aug dropped per value, the three
down posts reported with their last good reading, AWS-H_1 / ARG_1 / WP_2 kept, 19 post coordinates.
  python scripts/tests28331/ews_register_test.py   (STATION_LAKE_SCRIPTS=<dir with ews_register.py>)"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
cands = [os.environ.get('STATION_LAKE_SCRIPTS'), os.path.join(APP, '..', 'station-lake', 'scripts'), os.path.join(APP, 'station-lake', 'scripts')]
d = next((c for c in cands if c and os.path.exists(os.path.join(c, 'ews_register.py'))), None)
n = f = 0
def ok(c, m):
    global n, f; n += 1; print(('PASS ' if c else 'FAIL ') + m); f += 0 if c else 1
if not d: print('SKIP ews_register.py not found'); sys.exit(0)
sys.path.insert(0, d); import ews_register as R
import pandas as pd
reg = R.load(os.path.join(APP, 'data'))
ok(reg is not None and len(reg['posts']) == 19, 'the register loads with 19 post coordinates')
df = pd.DataFrame([
  {'station': 'Kandia_Karang_WP_1', 'element': 'Alarm button', 'value': 0.0, 'time_utc': '2026-10-28T10:00Z'},
  {'station': 'Kandia_Karang_WP_1', 'element': 'Water level', 'value': 1.2, 'time_utc': '2026-10-28T10:00Z'},
  {'station': 'Sishper-Ultar_WL-R_2', 'element': 'Water level', 'value': 0.0, 'time_utc': '2026-09-01T00:00Z'},
  {'station': 'Sishper-Ultar_WL-R_2', 'element': 'Water level', 'value': 0.42, 'time_utc': '2026-08-20T00:00Z'},
  {'station': 'Sishper-Ultar_WL-R_2', 'element': 'Water level', 'value': 0.0, 'time_utc': '2026-08-01T00:00Z'},
  {'station': 'Sishper-Ultar_AWS-H_1', 'element': 'Temperature', 'value': 3.1, 'time_utc': '2026-10-28T10:00Z'},
  {'station': 'Sishper-Ultar_ARG_1', 'element': 'Rain', 'value': 0.0, 'time_utc': '2026-10-28T10:00Z'}])
kept, dropped = R.apply(df, reg)
ok(not ((kept.station == 'Kandia_Karang_WP_1') & (kept.element == 'Alarm button')).any(), 'Kandia_Karang_WP_1 alarm button held (never alerts)')
ok(((kept.station == 'Kandia_Karang_WP_1') & (kept.element == 'Water level')).any(), 'its other elements stay')
w = kept[kept.station == 'Sishper-Ultar_WL-R_2']
ok(len(w) == 2 and 0.42 in list(w.value) and dropped == 2, 'WL-R_2: the 0.0 from 21 Aug dropped per value; earlier values kept')
ok((kept.station == 'Sishper-Ultar_AWS-H_1').any() and (kept.station == 'Sishper-Ultar_ARG_1').any(), 'AWS-H_1 and ARG_1 kept in use')
st = R.status(df, reg); dn = {x['station']: x for x in st['down']}
ok(set(dn) == {'Sishper-Ultar_DG_1', 'Sishper-Ultar_ARG_2', 'Sishper-Ultar_WL-R_2'} and dn['Sishper-Ultar_WL-R_2']['lastGood']['value'] == 0.42, 'three posts down; WL-R_2 last good reading 0.42 (20 Aug)')
reg2 = json.loads(json.dumps(reg)); reg2['holds'][0]['cleared'] = '2026-11-03 fixed'
k2, _ = R.apply(df, reg2); ok(((k2.station == 'Kandia_Karang_WP_1') & (k2.element == 'Alarm button')).any(), 'the owner clears the hold: the alarm button is read again')
print('\n%d pass, %d fail' % (n - f, f)); sys.exit(1 if f else 0)
