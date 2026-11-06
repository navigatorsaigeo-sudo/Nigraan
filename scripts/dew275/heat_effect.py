"""DEW v275 - effect of the served mountain dew offset on humidity, UTCI and the heat / cold levels: every mountain tehsil in the served
forecast archive (26 Sep - 14 Oct issues, lead days 0-2), served vs fixed (dew + offset, capped at T; RH from T and dew). UTCI in shade
(Tmrt = Ta, served wind), daily maximum (heat level) and daily minimum (cold level) via the server's utci.mjs and the hazard-scale cuts."""
import os, sys, json, gzip, glob, subprocess, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
G = json.load(open(os.path.join(APP, 'data', 'dew-final.json'))); OFF = G['zones']['mountain']['offsetsC'][0]
def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)
def rh(T, Td): return np.clip(100 * np.exp(17.625 * Td / (243.04 + Td)) / np.exp(17.625 * T / (243.04 + T)), 1, 100)
R = []
for f in sorted(glob.glob(os.path.join(APP, 'data', 'archive', 'forecast', 'fc_*.jsonl.gz'))):
    for l in gzip.open(f, 'rt'):
        r = json.loads(l)
        if r.get('z') != 'mountain' or not r.get('RH'): continue
        b = pd.Timestamp(r['base']).value // 10**6
        for i in range(min(r['n'], 72)):
            if r['T'][i] is None or r['RH'][i] is None: continue
            R.append((r['u'], r['d'], b + i * 3600_000, r['T'][i] / 10, r['RH'][i], (r['W'][i] if r.get('W') else 0)))
D = pd.DataFrame(R, columns=['u', 'issue', 'vms', 'T', 'RH', 'W']); D['vday'] = pd.to_datetime(D.vms + 5 * 3600_000, unit='ms').dt.strftime('%Y-%m-%d')
D['Td'] = dew(D['T'], D.RH); D['Tdf'] = np.minimum(D.Td + OFF, D['T']); D['RHf'] = rh(D['T'], D.Tdf)
def ut(T, V, RHs):
    rows = [[float(t), float(v), float(x)] for t, v, x in zip(T, V, RHs)]
    o = json.loads(subprocess.run(['node', os.path.join(HERE, 'utci_batch.mjs')], input=json.dumps({'rows': rows}), capture_output=True, text=True, check=True).stdout)
    return np.array([np.nan if x is None else x for x in o['utci']], float)
V = D.W.astype(float).values / 3.6
D['us'] = ut(D['T'], V, D.RH); D['uf'] = ut(D['T'], V, D.RHf)
cuts = json.load(open(os.path.join(APP, 'data', 'hazard-scale.json')))['screeningCuts']
HP = [[9, 0], [26, 25], [32, 45], [38, 65], [46, 82], [54, 100]]; CP = [[9, 0], [0, 25], [-13, 45], [-27, 65], [-40, 82], [-50, 100]]
def score(u, P, cold=False):
    if not np.isfinite(u): return None
    if not cold:
        if u <= P[0][0]: return 0
        for i in range(1, len(P)):
            if u == P[i][0]: return P[i][1]
            if u < P[i][0]: return min(P[i][1] - 1, round(P[i - 1][1] + (u - P[i - 1][0]) / (P[i][0] - P[i - 1][0]) * (P[i][1] - P[i - 1][1])))
        return 100
    if u >= P[0][0]: return 0
    for i in range(1, len(P)):
        if u == P[i][0]: return P[i][1] - 1
        if u > P[i][0]: return min(P[i][1] - 1, round(P[i - 1][1] + (P[i - 1][0] - u) / (P[i - 1][0] - P[i][0]) * (P[i][1] - P[i - 1][1])))
    return 100
def lvl(s): return None if s is None else next(c['level'] for c in cuts if s >= c['min'])
day = D.groupby(['u', 'issue', 'vday']).agg(n=('us', 'size'), usx=('us', 'max'), ufx=('uf', 'max'), usn=('us', 'min'), ufn=('uf', 'min'), rhs=('RH', 'mean'), rhf=('RHf', 'mean'), sat_s=('RH', lambda x: (x >= 99.5).mean()), sat_f=('RHf', lambda x: (x >= 99.5).mean())).reset_index()
day = day[day.n >= 24]
day['hs'] = [lvl(score(x, HP)) for x in day.usx]; day['hf'] = [lvl(score(x, HP)) for x in day.ufx]
day['cs'] = [lvl(score(x, CP, True)) for x in day.usn]; day['cf'] = [lvl(score(x, CP, True)) for x in day.ufn]
out = {'tehsilDays': int(len(day)), 'tehsils': int(day.u.nunique()), 'offsetC': OFF,
       'dewMeanChangeC': round(float((D.Tdf - D.Td).mean()), 2), 'rhMeanPts': {'served': round(float(day.rhs.mean()), 1), 'fixed': round(float(day.rhf.mean()), 1)},
       'saturatedHourShare': {'served': round(float(day.sat_s.mean()), 3), 'fixed': round(float(day.sat_f.mean()), 3)},
       'utciDailyMaxChangeC': {'mean': round(float((day.ufx - day.usx).mean()), 2), 'p95': round(float((day.ufx - day.usx).quantile(.95)), 2), 'max': round(float((day.ufx - day.usx).max()), 2)},
       'utciDailyMinChangeC': {'mean': round(float((day.ufn - day.usn).mean()), 2), 'max': round(float((day.ufn - day.usn).max()), 2)},
       'heatLevelChanges': {f'{a}->{b}': int(n) for (a, b), n in day[day.hs != day.hf].groupby(['hs', 'hf']).size().items()},
       'heatLevels': {'served': day.hs.value_counts().to_dict(), 'fixed': day.hf.value_counts().to_dict()},
       'coldLevelChanges': {f'{a}->{b}': int(n) for (a, b), n in day[day.cs != day.cf].groupby(['cs', 'cf']).size().items()},
       'coldLevels': {'served': day.cs.value_counts().to_dict(), 'fixed': day.cf.value_counts().to_dict()}}
# observed saturation share at the mountain synop stations (the gate pairs) for comparison
P = pd.read_parquet(os.path.join(HERE, 'out', 'tehsil_pairs.parquet')); P = P[(P.zone == 'mountain') & (P.net == 'synop')].dropna(subset=['oTd'])
out['observedSaturatedShare_synopMountain'] = round(float((rh(P.oT, P.oTd) >= 99.5).mean()), 3)
json.dump(out, open(os.path.join(HERE, 'out', 'heat_effect.json'), 'w'), indent=1); print(json.dumps(out, indent=1))
