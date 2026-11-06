"""v91.17.283.44 · EWS full scale, station-lake side: station list, sample rule, owner truth rule, sync diagnostic. python lake44_test.py <scripts_dir> <app_dir>"""
import os, sys, json, tempfile, importlib, types
import numpy as np, pandas as pd
SC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'station-lake', 'scripts'))
APP = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(SC, 'lib44')); sys.path.insert(0, SC)
import ews_stations, ews_truth
N = [0]
def ok(name): N[0] += 1; print('ok', name)
tmp = tempfile.mkdtemp(prefix='lake44_'); arch = os.path.join(tmp, 'archive'); os.makedirs(os.path.join(arch, 'obs'))
pd.DataFrame({'station': ['F_ARG_1', 'PMD_Lahore_AWS'], 'lat': [36, 31.5], 'lon': [74, 74.3], 'type': ['ARG', 'AWS'], 'elevation_m': [3000, 215], 'slope_deg': [5, 0], 'aspect_deg': [0, 0], 'aspect_class': ['N', 'N'], 'southness': [0, 0], 'tier': ['A', 'A'], 'completeness_12m_pct': [90, 90]}).to_csv(os.path.join(arch, 'verify_stations.csv'), index=False)
pd.DataFrame({'stationName': ['N_AWS_1'], 'lat': [36.2], 'lon': [74.2], 'type': ['AWS'], 'elevation_m': [2500], 'slope_deg': [3], 'aspect_deg': [10], 'aspect_class': ['N'], 'southness': [-1]}).to_csv(os.path.join(arch, 'stations.csv'), index=False)
t = pd.date_range('2026-10-01', periods=12 * 6, freq='10min', tz='UTC')
def rows(st, el, eid, tt, vals, qc=None):
    return pd.DataFrame({'timestamp_utc': tt, 'timestamp_pkt': tt.tz_convert('Asia/Karachi'), 'element_id': eid, 'station_name': st, 'element_name': el, 'quantity': 'Air Temperature', 'unit': 'C',
                         'value': vals, 'qc': pd.Categorical(qc if qc is not None else ['ok'] * len(tt)), 'value_qc': [v if (qc is None or q == 'ok') else np.nan for v, q in zip(vals, qc if qc is not None else ['ok'] * len(tt))]})
t30 = pd.date_range('2026-10-01', periods=12 * 2, freq='30min', tz='UTC')
vals = list(np.linspace(5, 6, len(t)))
qc = ['ok'] * len(t); qc[7] = 'sentinel'; qc[13] = 'spike'
T = pd.concat([rows('F_ARG_1', 'Air Temperature', 1, t, vals, qc), rows('N_AWS_1', 'Air Temperature THS', 2, t30, list(np.linspace(1, 2, len(t30)))),
               rows('N_AWS_1', 'Air Temperature Hukseflux', 3, t, list(np.linspace(9, 9.5, len(t)))), rows('C_ARG_1', 'Air Temperature', 4, t30, [3.0] * len(t30))], ignore_index=True)
T.to_parquet(os.path.join(arch, 'obs', 'Air_Temperature.parquet'), index=False)
R = T.copy(); R['element_name'] = R.element_name.str.replace('Air Temperature', 'Relative Humidity').str.replace('Relative Humidity Hukseflux', 'Relative Humidity THS'); R['value'] = 60.0; R['value_qc'] = np.where(R.qc.astype(str) == 'ok', 60.0, np.nan); R['quantity'] = 'Relative Humidity'
R.to_parquet(os.path.join(arch, 'obs', 'Relative_Humidity.parquet'), index=False)
cat = os.path.join(tmp, 'aegis_elements.csv')
pd.DataFrame({'element_id': [1, 2, 3, 9], 'station_id': [10, 20, 20, 40], 'station': ['F_ARG_1', 'N_AWS_1', 'N_AWS_1', 'K_ARG_1'], 'element': ['Air Temperature', 'Air Temperature THS', 'Air Temperature Hukseflux', 'Air Temperature'], 'unit': 'C', 'latitude': [36, 36.2, 36.2, 35.5], 'longitude': [74, 74.2, 74.2, 72.5]}).to_csv(cat, index=False)

L = ews_stations.build(arch, cat)
assert set(L.station) == {'F_ARG_1', 'PMD_Lahore_AWS', 'N_AWS_1', 'K_ARG_1'}, set(L.station)   # C_ARG_1: readings but no position anywhere (cannot be placed)
assert L.set_index('station').loc['N_AWS_1', 'elevation_m'] == 2500 and L.set_index('station').loc['F_ARG_1', 'source'] == 'fixed list'
assert np.isnan(L.set_index('station').loc['K_ARG_1', 'elevation_m'])          # catalogue only: height from the model response later
ok('station list: fixed + archive + catalogue; only a station with no position is left out; fixed list rows unchanged')
before = open(os.path.join(arch, 'verify_stations.csv')).read(); ews_stations.build(arch, cat); assert open(os.path.join(arch, 'verify_stations.csv')).read() == before
ok('station list: the fixed list file is never written')

h = ews_truth.hour_need(T[['station_name', 'element_id', 'timestamp_utc']])
assert set(h[h.element_id == 1].need) == {4} and set(h[h.element_id == 2].need) == {2}, h.groupby('element_id').need.unique()
ok('sample rule: 4 of 6 at 10 min, 2 of 2 at 30 min')

os.environ.pop('NIGRAAN_RETRAIN_SAMPLES', None)
dr, cf, al = ews_truth.rule(APP)
H0 = ews_truth.hourly(arch, 'Air_Temperature', ews_truth.T_PREF, dr, cf)
assert 'C_ARG_1' not in set(H0.station) and (H0.station == 'N_AWS_1').sum() == 0        # 30-min stations: 2 samples < 4
os.environ['NIGRAAN_RETRAIN_SAMPLES'] = 'own_step'
H1 = ews_truth.hourly(arch, 'Air_Temperature', ews_truth.T_PREF, dr, cf)
assert 'N_AWS_1' in set(H1.station) and H1[H1.station == 'N_AWS_1'].obs.max() < 3     # the THS channel, not the Hukseflux (9 C)
f = H1[H1.station == 'F_ARG_1']; assert (f.archive_qc == 'spike').sum() == 1 and f.n_samples.min() >= 4
ok('owner truth: sentinel dropped, spike hour marked and kept for the obsqc verdict, THS chosen over Hukseflux, own-step samples')
os.environ.pop('NIGRAAN_RETRAIN_SAMPLES', None)

# verify.py with every switch unset is the 1.0.6 function (same hours as a direct re-implementation of its rule)
import verify as V
o = V.hourly_obs(arch, 'Air Temperature', 'mean')
d = T[T.qc.astype(str) == 'ok'].dropna(subset=['value_qc'])
assert set(o.station) == {'F_ARG_1', 'N_AWS_1'} and o.n_samples.min() >= 4                       # N_AWS_1 via its Hukseflux channel (most rows): the old rule
ok('verify.hourly_obs switch off: the old rule (4 samples, most-rows channel) unchanged')

# ews_sync diagnostic: a fake element list; elements() drops wanted elements with a reason and makes no request for them
os.environ['NIGRAAN_OWN_DIR'] = tmp
import ews_sync as S
S._imports()
calls = []
def fake_api(path, params, tries=3):
    calls.append(path)
    return [{'elementId': 1, 'stationId': 10, 'stationName': 'F_ARG_1', 'elementName': 'Air Temperature', 'measUnit': 'C', 'time': '2026-11-01T10:00:00Z', 'isQueryable': True},
            {'elementId': 2, 'stationId': 10, 'stationName': 'F_ARG_1', 'elementName': 'Gust Wind Speed', 'measUnit': 'm/s', 'time': None, 'isQueryable': True},
            {'elementId': 3, 'stationId': 10, 'stationName': 'F_ARG_1', 'elementName': 'Scalar Wind Speed', 'measUnit': 'm/s', 'time': '2026-11-01T10:00:00Z', 'isQueryable': False},
            {'elementId': 4, 'stationId': 10, 'stationName': 'F_ARG_1', 'elementName': 'Battery Voltage', 'measUnit': 'V', 'time': '2026-11-01T10:00:00Z', 'isQueryable': True}]
S.api = fake_api
S.configure(app=os.path.join(tmp, 'app'), own=tmp); os.makedirs(S.G['OUT'], exist_ok=True)
E = S.elements()
assert list(E.elementId) == [1] and len(calls) == 1
assert dict(zip(S.DROPPED.elementId, S.DROPPED.reason)) == {2: 'no newest time', 3: 'not queryable'}
info = S._write_dropped([], [])
assert info['dropped_by_element'] == {'Gust Wind Speed': 1, 'Scalar Wind Speed': 1} and os.path.exists(os.path.join(S.G['OUT'], 'aegis_elements_dropped.csv'))
assert S.load_cfg()['probeDropped'] is False
ok('sync diagnostic: wanted elements dropped with a reason, no extra request, probe off by default')
print(N[0], 'passed')
