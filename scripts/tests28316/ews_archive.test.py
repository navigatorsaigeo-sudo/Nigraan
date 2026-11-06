"""v91.17.283.16 . unit test of the curated EWS archive rule in scripts/lib/obsqc_truth.py (owner decision 24 Oct 2026 22:07 PKT):
the archive's qc column: empty = pass (the deterministic checks - sentinel, gross range, internal - still apply); sentinel / range = dropped (removed before the series checks); spike / flat = dropped only when
obsqc.mjs (EWS network setting: technical checks only) also fails the value. A synthetic archive in a temporary folder; nothing else read.
  python scripts/tests28316/ews_archive.test.py      exit 0 all pass, 1 a failure (node: NIGRAAN_NODE or the server's runtime or PATH)"""
import os, sys, tempfile, shutil
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(APP, 'scripts', 'lib'))
import obsqc_truth as QT

n = 0; fails = 0
def ok(c, m):
    global n, fails
    n += 1; print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails += 1

d = tempfile.mkdtemp(prefix='ewsarch_')
try:
    t = pd.date_range('2026-10-10 00:00', periods=12 * 6, freq='10min')
    k = np.arange(len(t))
    T = np.round(5 + 4 * np.sin(k / 30) + 0.1 * (k * 7 % 5), 1).astype('float32'); RH = np.round(50 + 10 * np.cos(k / 25) + 0.3 * (k * 3 % 4), 2).astype('float32')
    qT = np.array([''] * len(t), dtype=object); qR = np.array([''] * len(t), dtype=object)
    i2 = 2 * 6; T[i2] = 200.8; qT[i2] = 'range'                      # 02:00 range: dropped by the archive flag
    i3 = 3 * 6; T[i3] = np.nan; qT[i3] = 'sentinel'                 # 03:00 sentinel (the archive holds it as NaN)
    i5 = 5 * 6; qT[i5] = 'spike'                                    # 05:00 flagged spike, but the value is ordinary: obsqc passes it -> pass
    RH[7 * 6:11 * 6] = 63.21; qR[7 * 6:11 * 6] = 'flat'             # 07:00-10:50 flat humidity, flagged flat; obsqc persistence also fails -> dropped
    i1 = 1 * 6; RH[i1] = 1.5                                         # 01:00 RH 1.5 % with qc empty: obsqc's internal check fails it -> dropped (deterministic check)
    i4 = 4 * 6; RH[i4] = RH[i4 - 1] - 35                             # 04:00 humidity spike with qc empty: obsqc's step fails it -> kept (series verdict: information)
    cat = pd.CategoricalDtype(['', 'flat', 'range', 'sentinel', 'spike'])
    pd.DataFrame({'element_id': np.int32(1), 'time_utc': t, 'value': T, 'qc': pd.Series(qT).astype(cat), 'source': 'test'}).to_parquet(os.path.join(d, 'ews_10min_air_temperature.parquet'))
    pd.DataFrame({'element_id': np.int32(2), 'time_utc': t, 'value': RH, 'qc': pd.Series(qR).astype(cat), 'source': 'test'}).to_parquet(os.path.join(d, 'ews_10min_relative_humidity.parquet'))
    pd.DataFrame({'element_id': [1, 2, 3], 'station': ['Test_AWS_1'] * 3, 'element': ['Air Temperature', 'Relative Humidity', 'Air Temperature THS'], 'latitude': 36.3, 'longitude': 74.6, 'altitude': np.nan}).to_parquet(os.path.join(d, 'ews_elements.parquet'))
    pd.DataFrame({'station': ['Test_AWS_1'], 'latitude': [36.3], 'longitude': [74.6], 'elevation_m': [2600.0]}).to_parquet(os.path.join(d, 'ews_stations.parquet'))
    F = QT.load_ews_archive(d, APP, '2026-10-10', '2026-10-11')
    g = lambda h, v: F[(F.time_utc == '2026-10-10T%02d:00Z' % h) & (F['var'] == v)]
    ok(len(F) > 0 and set(F.pid) == {'aws:Test_AWS_1'}, 'the archive is read as the EWS network (pid aws:<station>)')
    x = g(2, 'T'); ok(len(x) == 1 and float(x.value.iloc[0]) < 60 and x['pass'].iloc[0] == 1 and x.time_obs.iloc[0] != '2026-10-10T02:00Z', 'range: the flagged value is dropped before the checks; the hour takes the nearest other reading')
    x = g(3, 'T'); ok(len(x) == 1 and x.time_obs.iloc[0] != '2026-10-10T03:00Z', 'sentinel: the code is not the hour\'s value')
    ok(F.attrs.get('archiveDropped', {}).get('T:range') == 1 and F.attrs.get('archiveDropped', {}).get('T:sentinel') == 1, 'the drops on the archive flag are counted per variable and flag')
    x = g(5, 'T'); ok(len(x) == 1 and x['pass'].iloc[0] == 1 and x.archive_qc.iloc[0] == 'spike' and x.own_pass.iloc[0] == 1, 'spike flagged but not failed by obsqc: passes')
    x = F[(F['var'] == 'RH') & (F.archive_qc == 'flat')]; ok(len(x) >= 3 and (x['pass'] == 0).all() and x.test.str.startswith('archive-flat+').all(), 'flat flagged and failed by obsqc (persistence): dropped, test archive-flat+' + (x.own_test.iloc[0] if len(x) else ''))
    x = g(1, 'RH'); ok(len(x) == 1 and x['pass'].iloc[0] == 0 and x.test.iloc[0] == 'internal', 'qc empty but RH 1.5 %: dropped by the internal check (a deterministic technical check applies to archive values too)')
    x = g(4, 'RH'); ok(len(x) == 1 and x['pass'].iloc[0] == 1 and x.own_test.iloc[0] == 'step', 'qc empty and a spike to obsqc: kept (the archive judges the series; obsqc\'s step verdict kept in own_test)')
    ok(not F.test.isin(['buddy', 'background', 'climate-range', 'copy']).any() and not F.own_test.isin(['buddy', 'background', 'climate-range', 'copy']).any(), 'no buddy, background, climate or copy verdict on EWS values (network setting)')
finally:
    shutil.rmtree(d, ignore_errors=True)
print('%d checks, %d failed' % (n, fails)); sys.exit(1 if fails else 0)
