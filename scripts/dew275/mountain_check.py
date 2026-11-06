"""DEW v275 - mountain: served vs served + fitted offset (fit_gate.py, synop-fitted) vs raw provider dew point, on data the offset never
saw: the MACH mountain stations (fleet pairs = the server's own point chain at the station, lead 0-1 h; raw = the start the pairs
carry), and the synop mountain stations with the raw best_match day-0 dew point at the station (ds2 wx/served, as ARCH v275)."""
import os, sys, json, glob, numpy as np, pandas as pd
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); rng = np.random.default_rng(2752)
G = json.load(open(os.path.join(HERE, 'out', 'gate.json'))); OFF = G['served']['mountain']['zoneMedianC']
def boot(a, b, d, n=1000):
    a = np.abs(np.asarray(a, float)); b = np.abs(np.asarray(b, float)); d = np.asarray(d); ud = np.unique(d); ix = {k: np.where(d == k)[0] for k in ud}; bs = []
    for _ in range(n):
        pk = rng.choice(ud, len(ud)); ii = np.concatenate([ix[k] for k in pk]); bs.append(a[ii].mean() - b[ii].mean())
    return {'n': int(len(a)), 'days': int(len(ud)), 'maeA': round(float(a.mean()), 2), 'maeB': round(float(b.mean()), 2), 'gainB': round(float(a.mean() - b.mean()), 2), 'lo': round(float(np.quantile(bs, .05)), 2), 'hi': round(float(np.quantile(bs, .95)), 2)}
out = {'offsetC': OFF}
F = pd.read_parquet(os.path.join(HERE, 'out', 'fleet_pairs_dew.parquet')); F = F[F.zone == 'mountain'].copy()
F['fx'] = np.minimum(F.sTd + OFF, F.fc_served_c); F['day'] = F.hour_utc.str[:10]
for nm, s in [('all', F), ('to14Oct', F[F.day <= '2026-10-14']), ('since13Oct', F[F.day >= '2026-10-13'])]:
    out['fleet_' + nm] = {'stations': sorted(s.key.unique().tolist()), 'served_bias': round(float((s.sTd - s.oTd).mean()), 2), 'fixed_bias': round(float((s.fx - s.oTd).mean()), 2), 'raw_bias': round(float((s.rTd - s.oTd).mean()), 2),
                          'served_vs_fixed': boot(s.sTd - s.oTd, s.fx - s.oTd, s.day), 'served_vs_raw': boot(s.sTd - s.oTd, s.rTd - s.oTd, s.day), 'raw_vs_fixed': boot(s.rTd - s.oTd, s.fx - s.oTd, s.day)}
# synop mountain: raw at the station (ds2) vs served tehsil (and fixed) on the same station-hours
P = pd.read_parquet(os.path.join(HERE, 'out', 'tehsil_pairs.parquet')); P = P[(P.zone == 'mountain') & (P.net == 'synop') & (P.lead <= 2)].copy()
def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)
P['fTd'] = dew(P.fT, P.fRH); P['fx'] = np.minimum(P.fTd + OFF, P.fT)
DS2 = '/mnt/user-data/uploads/NIGRAAN/nig/ds2/out'; pts = pd.read_csv(DS2 + '/points.csv'); loc = {str(r.sid): r.loc for r in pts[pts.set == 'synop'].itertuples()}
raw = {}
for sid in P.key.astype(str).unique():
    if sid not in loc: continue
    fs = sorted(glob.glob(DS2 + '/wx/served/%s_2026*.parquet' % loc[sid]))
    if not fs: continue
    d = pd.concat([pd.read_parquet(f, columns=['time', 'dew_point_2m']) for f in fs]); d['h'] = (pd.to_datetime(d.time, utc=True) - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds().astype('int64') * 1000
    raw[sid] = dict(zip(d.h, d.dew_point_2m))
P['rTd'] = [raw.get(str(k), {}).get(int(h), np.nan) for k, h in zip(P.key, P.vms)]
S = P.dropna(subset=['rTd', 'fTd'])
out['synop'] = {'stations': sorted(S.key.astype(str).unique().tolist()), 'served_bias': round(float((S.fTd - S.oTd).mean()), 2), 'fixed_bias': round(float((S.fx - S.oTd).mean()), 2), 'raw_bias': round(float((S.rTd - S.oTd).mean()), 2),
                'served_vs_raw': boot(S.fTd - S.oTd, S.rTd - S.oTd, S.vday), 'raw_vs_fixed': boot(S.rTd - S.oTd, S.fx - S.oTd, S.vday),
                'note': 'served / fixed = the tehsil value (<= 25 km, <= 300 m), raw = the provider at the station point: the comparison favours raw'}
json.dump(out, open(os.path.join(HERE, 'out', 'mountain_check.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
