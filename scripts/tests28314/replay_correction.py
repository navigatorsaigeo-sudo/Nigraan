#!/usr/bin/env python3
"""v91.17.283.14 . replay of the live MACH correction before / after value-level QC (NIGRAAN's own copies, read only).

Truth (the same in both arms): every hourly MACH temperature that passes obsqc.mjs (qc_mach_hourly.csv from replay_shares /
dump), scored at the station-hours the fleet pairs hold (fc_raw_c = served basis, fc_served_c = served value at the hour).

L2 running correction (fleet.mjs runningBias, temperature, own site): for station s and day D the correction of a 3-hour PKT block is
the decayed mean (decay^age, window_days) of s's residuals (obs - basis) in that block over the days before D, with at least min_days
days and min_block_hours per block, capped at cap_c (data/model-zone.json l2Rule). Arm BEFORE: only stations the v283.11 build
served (siting verdict 'trusted' in data/mach-siting.json, not registry-excluded, not held), residuals from the pairs the v283.11 poll
kept. Arm AFTER: every station, residuals only from values obsqc passes. Score: MAE of basis + correction against the truth.

L3 live layer (hyperlocal.mjs, leave-one-station-out): the value at a station-hour is served + the kriged mean of the other stations'
residuals (obs - served) within radius_km at that hour (exponential variogram of data/hyperlocal-model.json, simple kriging with zero
mean). BEFORE: neighbours = rows the v283.11 screen kept, not registry-excluded / held / held out by the siting offsets, then its
residual buddy check (|res - median| > max(min_c, mad_k x MAD), 3+ neighbours within buddy radius). AFTER: neighbours = values obsqc
passes (its buddy check replaces the layer's own). Score: MAE of served + L3 against the truth, per zone.
usage: python replay_correction.py <qc_mach_hourly.csv> <fleet_pairs dir> <old data dir> <new data dir> <from> <to> <out.json>"""
import sys, json, math, glob, os
import numpy as np, pandas as pd

qcf, pdir, old, new, d0, d1, out = sys.argv[1:8]
Q = pd.read_csv(qcf); Q['key'] = Q.pid.str.slice(5); Q['hour'] = Q.hour_utc
P = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(os.path.join(pdir, 'fleet_pairs_2026-*.csv')))], ignore_index=True)
P['hour'] = P.hour_utc.str.slice(0, 13); P = P.drop_duplicates(['key', 'hour'], keep='last')
P = P.merge(Q[['key', 'hour', 'zone', 'Tpass']], on=['key', 'hour'], how='left')
rj = lambda d, f: json.load(open(os.path.join(d, f), encoding='utf-8'))
reg = rj(old, 'mach-fleet-stations.json')['stations']
EX = {s['key'] for s in reg if s.get('exclude')} | {h['key'] for h in rj(old, 'station-holds.json')['holds']}
pos = {s['key']: (s['lat'], s['lon']) for s in reg if s.get('lat') is not None}
sit = rj(old, 'mach-siting.json')['stations']; TRUST = {k for k, v in sit.items() if v.get('verdict') == 'trusted'} - EX
off = rj(old, 'mach-offsets.json')['stations']; HELD = {k for k, v in off.items() if v.get('heldOut')}
L2 = rj(new, 'model-zone.json')['l2Rule']; HL = rj(new, 'hyperlocal-model.json')
P['t'] = pd.to_datetime(P.hour + ':00Z', utc=True); P['pk'] = P.t + pd.Timedelta(hours=5); P['day'] = P.pk.dt.strftime('%Y-%m-%d'); P['blk'] = (((P.pk.dt.hour - 1.5) / 3).apply(math.floor) % 8)
P['res_b'] = P.temp_c - P.fc_raw_c; P['res_s'] = P.temp_c - P.fc_served_c
truth = P[(P.Tpass == 1) & (P.day >= d0) & (P.day <= d1)].copy()

def l2_arm(use_station, use_value):
    corr = {}
    days = sorted(P.day.unique())
    for key, g in P[P.key.map(use_station)].groupby('key'):
        g = g[use_value(g)]
        byday = {d: x for d, x in g.groupby('day')}
        for D in days:
            if D < d0 or D > d1: continue
            prev = [d for d in byday if d < D and (pd.Timestamp(D) - pd.Timestamp(d)).days <= L2['window_days']]
            if len(prev) < L2['min_days']: continue
            for b in range(8):
                num = den = 0.0; nd = 0
                for d in prev:
                    x = byday[d]; x = x[x.blk == b]
                    if len(x) < L2['min_block_hours']: continue
                    w = L2['decay'] ** ((pd.Timestamp(D) - pd.Timestamp(d)).days - 1); num += w * x.res_b.mean(); den += w; nd += 1
                if nd >= 3 and den > 0: corr[(key, D, b)] = max(-L2['cap_c'], min(L2['cap_c'], num / den))
    return corr

before = l2_arm(lambda k: k in TRUST, lambda g: pd.Series(True, index=g.index))
after = l2_arm(lambda k: True, lambda g: g.Tpass == 1)
def score_l2(corr):
    c = np.array([corr.get((k, d, b), 0.0) for k, d, b in zip(truth.key, truth.day, truth.blk)])
    e = np.abs(truth.fc_raw_c.values + c - truth.temp_c.values); return e, (c != 0)
eb, ab = score_l2(before); ea, aa = score_l2(after)
res = {'window': [d0, d1], 'truthHours': int(len(truth)), 'L2': {}, 'L3': {}}
plains = (truth.zone == 'plains').values
for z in sorted(truth.zone.dropna().unique()):
    m = (truth.zone == z).values
    res['L2'][z] = {'n': int(m.sum()), 'maeBasis': round(float(np.abs(truth.fc_raw_c.values - truth.temp_c.values)[m].mean()), 3), 'maeBefore': round(float(eb[m].mean()), 3), 'maeAfter': round(float(ea[m].mean()), 3),
                    'correctedHoursBefore': int(ab[m].sum()), 'correctedHoursAfter': int(aa[m].sum()), 'appliesIn': L2['zones_t']}
# L3
V = HL['variogram']; R = HL['radius_km']; B = HL['buddy']
def km(a, b, c, d):
    p = math.pi / 180; x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2; return 12742 * math.asin(math.sqrt(min(1, x)))
cov = lambda h: V['psill'] * math.exp(-3 * h / V['range_km'])
def krig(t, nbs):
    if not nbs: return 0.0
    n = len(nbs); K = np.zeros((n, n)); k = np.zeros(n)
    for i, (a, ra) in enumerate(nbs):
        k[i] = cov(km(t[0], t[1], a[0], a[1]))
        for j, (b, rb) in enumerate(nbs): K[i, j] = cov(km(a[0], a[1], b[0], b[1])) + (V['nugget'] if i == j else 0)
    w = np.linalg.solve(K, k); return float(w @ np.array([r for _, r in nbs]))
def l3(arm):
    errs = {}
    for hour, g in truth.groupby('hour'):
        cand = P[P.hour == hour]
        if arm == 'before':
            cand = cand[~cand.key.isin(EX | HELD)]
            keep = []
            for i, r in cand.iterrows():
                if r.key not in pos: continue
                nb = [x.res_s for j, x in cand.iterrows() if j != i and x.key in pos and km(*pos[r.key], *pos[x.key]) <= B['radius_km']]
                if len(nb) >= 3:
                    md = np.median(nb); mad = np.median(np.abs(np.array(nb) - md)) * 1.4826
                    if abs(r.res_s - md) > max(B['min_c'], B['mad_k'] * mad): continue
                keep.append(r)
            cand = pd.DataFrame(keep)
        else:
            cand = cand[cand.Tpass == 1]
        if not len(cand): continue
        for _, t in g.iterrows():
            if t.key not in pos: continue
            nbs = [(pos[x.key], x.res_s) for _, x in cand.iterrows() if x.key != t.key and x.key in pos and km(*pos[t.key], *pos[x.key]) <= R][:25]
            e = abs(t.fc_served_c + krig(pos[t.key], nbs) - t.temp_c); errs.setdefault(t.zone, []).append(e)
    return errs
lb, la = l3('before'), l3('after')
for z in sorted(set(lb) | set(la)):
    res['L3'][z] = {'n': len(la.get(z, [])), 'maeServed': None, 'maeBefore': round(float(np.mean(lb[z])), 3) if z in lb else None, 'maeAfter': round(float(np.mean(la[z])), 3) if z in la else None}
for z in res['L3']:
    m = (truth.zone == z).values; res['L3'][z]['maeServed'] = round(float(np.abs(truth.fc_served_c.values - truth.temp_c.values)[m].mean()), 3)
res['arms'] = {'trustedBefore': len(TRUST), 'excludedBefore': sorted(EX), 'heldOutBefore': sorted(HELD)}
json.dump(res, open(out, 'w'), indent=1); print(json.dumps({k: res[k] for k in ('L2', 'L3')}, indent=1))
