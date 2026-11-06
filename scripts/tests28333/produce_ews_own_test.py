"""v91.17.283.33 · the retrain producer extends the EWS 10-min wind and gust tables from NIGRAAN's own feed (ews_sync.py raw files) after the
archive's last reading; the retrain view puts the own EWS hourly tables first. Run: python produce_ews_own_test.py <station-lake>"""
import sys, os, json, tempfile, shutil, importlib.util, pandas as pd
LAKE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'station-lake'); P = os.path.join(LAKE, 'retrain', 'produce'); sys.path[:0] = [P, os.path.join(LAKE, 'retrain', 'auto')]
ok_n = fail_n = 0
def ok(c, m, d=''):
    global ok_n, fail_n
    print(('PASS ' if c else 'FAIL ') + m + ('' if c else ' :: ' + str(d)[:300])); ok_n += bool(c); fail_n += (not c)
spec = importlib.util.spec_from_file_location('ptruth', os.path.join(P, 'truth.py')); T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
tmp = tempfile.mkdtemp()
try:
    raw = os.path.join(tmp, 'raw'); os.makedirs(raw)
    pd.DataFrame({'element_id': [7, 7, 7, 8, 7], 'time_utc': ['2026-10-26 00:10', '2026-10-26 00:20', '2026-10-26 00:20', '2026-10-26 00:10', '2026-10-26 00:30'],
                  'value': [5.0, 6.0, 6.0, 3.0, 99.0], 'element': ['Gust Wind Speed', 'Gust Wind Speed', 'Gust Wind Speed', 'Wind Speed', 'Gust Wind Speed']}
                 ).to_csv(os.path.join(raw, 'ews_raw_20261026.csv.gz'), index=False, compression='gzip')
    class C:
        S = {'own': {'ews_raw': raw}}
        def own(self, k): return self.S['own'][k]
    B = pd.DataFrame({'element_id': pd.Series([7], dtype='int32'), 'time_utc': pd.to_datetime(['2026-10-25 23:50']), 'value': [4.0], 'qc': [''], 'source': ['archive']})
    G = T.ews10_own(C(), 'Gust_Wind_Speed', B, pd.Timestamp('2026-10-25 23:50'), pd.Timestamp('2026-10-27'))
    ok(G is not None and list(G.value) == [5.0, 6.0], 'gust rows from the own feed: only that element, de-duplicated, out-of-range (99) dropped', None if G is None else G.to_dict('list'))
    ok(set(G.source) == {'nigraan_own_feed'}, 'labelled as the own feed')
    W = T.ews10_own(C(), 'Wind_Speed', B, pd.Timestamp('2026-10-25 23:50'), pd.Timestamp('2026-10-27'))
    ok(W is not None and list(W.element_id) == [8], 'wind speed rows from the own feed', None if W is None else W.to_dict('list'))
    out, n = T.append_after(B, G, 'element_id', 'time_utc')
    ok(n == 2 and len(out) == 3, 'appended after the archive rows; archive rows win', (n, len(out)))
    ok(T.ews10_own(C(), 'Rain_Increment', B, pd.Timestamp('2026-10-25'), pd.Timestamp('2026-10-27')) is None, 'rain increments are not taken from the own feed (not in scope)')
    S = json.load(open(os.path.join(LAKE, 'retrain', 'produce', 'sources.json')))
    ok(S['own'].get('ews_raw', '').endswith('own/data/pmd/ews_live/raw'), 'sources.json names the own raw folder', S['own'].get('ews_raw'))
    I = json.load(open(os.path.join(LAKE, 'retrain', 'auto', 'inputs.json')))
    v = {e['to']: e.get('from', []) for e in I['view'] if 'to' in e}
    ok(v['ews/ews_live_hourly.parquet'][0].startswith('own_ews:') and v['ews/ews_hydro_hourly.parquet'][0].startswith('own_ews:'), 'the retrain view takes the own EWS hourly tables first', v['ews/ews_live_hourly.parquet'])
    ok(I['roots'].get('own_ews') == ['{NIG}/own/data/pmd/ews_live'], 'root own_ews is NIGRAAN own EWS folder', I['roots'].get('own_ews'))
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print('SUMMARY %d pass %d fail' % (ok_n, fail_n)); sys.exit(1 if fail_n else 0)
