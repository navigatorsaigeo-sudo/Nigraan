"""DEW v275 - raw provider dew point (best_match day-0 at the station, ds2 wx/served) vs the served tehsil dew point at synop stations,
26 Sep - 14 Oct, by zone (trace evidence; served = tehsil value <= 25 km / 300 m, raw = station point: favours raw)."""
import os, sys, json, glob, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
P = pd.read_parquet(os.path.join(HERE, 'out', 'tehsil_pairs.parquet')); P = P[(P.net == 'synop') & (P.lead <= 2)].copy()
def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)
P['fTd'] = dew(P.fT, P.fRH)
DS2 = '/mnt/user-data/uploads/NIGRAAN/nig/ds2/out'; pts = pd.read_csv(DS2 + '/points.csv'); loc = {str(r.sid): r.loc for r in pts[pts.set == 'synop'].itertuples()}
raw = {}
for sid in P.key.astype(str).unique():
    fs = sorted(glob.glob(DS2 + '/wx/served/%s_2026*.parquet' % loc.get(sid, 'none')))
    if not fs: continue
    d = pd.concat([pd.read_parquet(f, columns=['time', 'dew_point_2m']) for f in fs]); d['h'] = (pd.to_datetime(d.time, utc=True) - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds().astype('int64') * 1000
    raw[sid] = dict(zip(d.h, d.dew_point_2m))
P['rTd'] = [raw.get(str(k), {}).get(int(h), np.nan) for k, h in zip(P.key, P.vms)]
S = P.dropna(subset=['rTd', 'fTd']); S['er'] = S.rTd - S.oTd; S['es'] = S.fTd - S.oTd
t = S.groupby('zone').agg(stations=('key', 'nunique'), n=('er', 'size'), raw_bias=('er', 'mean'), raw_mae=('er', lambda x: x.abs().mean()), served_bias=('es', 'mean'), served_mae=('es', lambda x: x.abs().mean())).round(2)
print(t.to_string()); t.to_json(os.path.join(HERE, 'out', 'raw_vs_served_synop.json'), orient='index', indent=1)
