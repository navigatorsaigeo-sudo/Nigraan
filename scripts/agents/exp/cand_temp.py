#!/usr/bin/env python3
"""NIGRAAN retrain prep (22 Oct 2026) - temperature candidates A, B, C, S on the national held-out design.

Input   station-lake/archive/national/pred_oof.parquet  (held-out predictions of the current national model: p_model, lo, hi)
        station-lake/archive/national/table.parquet     (T0 weather at the same rows: wind, zone)
        station-lake/archive/national/test_locked.json   (locked cells: never fitted, scored apart)
Method  every correction for fold k is fitted ONLY on rows of the other folds (cross-fold), locked points excluded from fitting.
  A  additive offset by zone x PKT 3-hour block x season (mean held-out residual of the other folds)
  B  A split further by the forecast temperature (T0) quintile within zone x season (bin MOS)
  C  90 % range: Mondrian split-conformal widening/narrowing by zone x 3-hour block (Vovk et al. 2005), quantile of the other folds'
     conformity scores, applied to the served-model raw quantile range (lo/hi already carry the per-zone widening)
  S  A plus, in the coast zone only, the split by onshore wind (T0 direction 180-300 deg, the Arabian Sea side)
Score   MAE (hourly), daily Tmax / Tmin (>= 20 hours), forecast-conditioned hot days / cold nights; two-way cluster bootstrap (stations x
        days, B = 1000) of the paired difference current - candidate. Rule: RULES_20261101.json (written before the results).
usage   python cand_temp.py <national dir> <out json>"""
import sys, json, numpy as np, pandas as pd

ND, OUT = sys.argv[1], sys.argv[2]
B = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
SEAS = {12: 'DJF', 1: 'DJF', 2: 'DJF', 3: 'MAM', 4: 'MAM', 5: 'MAM', 6: 'JJA', 7: 'JJA', 8: 'JJA', 9: 'SON', 10: 'SON', 11: 'SON'}
P = pd.read_parquet(f'{ND}/pred_oof.parquet', columns=['t', 'pid', 'zone', 'fold', 'obs', 'temperature_2m', 'p_model', 'lo', 'hi'])
W = pd.read_parquet(f'{ND}/table.parquet', columns=['t', 'pid', 'wind_direction_10m', 'wind_speed_10m'])
P = P.merge(W, on=['t', 'pid'], how='left'); del W
LOCK = set(json.load(open(f'{ND}/test_locked.json'))['points'])
import os
# v91.17.283.14 (owner decision 24 Oct 2026: a wrong value is dropped, never the whole station): the value-level quality control of the
# observed temperature (NIGRAAN server/api/obsqc.mjs through scripts/lib/obsqc_truth.py, step obs_qc of the run) wrote
# archive/national/obs_qc_flags*.parquet (pid, t, pass, test). Failing values are left out; no station list is read.
def qc_failing(nd):
    fs = [os.path.join(nd, f) for f in ('obs_qc_flags.parquet', 'obs_qc_flags_ghcnh.parquet') if os.path.exists(os.path.join(nd, f))]
    if not fs: sys.exit('archive/national/obs_qc_flags.parquet missing: run the obs_qc step (scripts/lib/obsqc_truth.py --table) first')
    F = pd.concat([pd.read_parquet(f, columns=['pid', 't', 'pass']) for f in fs], ignore_index=True); F['t'] = pd.to_datetime(F.t, utc=True)
    return F.loc[F['pass'] == 0, ['pid', 't']].drop_duplicates().assign(qcfail=True)
def with_qc(T, nd):
    t = pd.to_datetime(T.t, utc=True); K = T[['pid']].assign(t=t).merge(qc_failing(nd), on=['pid', 't'], how='left')
    return K.qcfail.fillna(False).astype(bool).values
P = P[~with_qc(P, ND)].copy()   # values failing the quality control: never fitted, not scored (no station list)
P['locked'] = P.pid.isin(LOCK)
pkt = P.t + pd.Timedelta(hours=5)
# v91.17.283.24 (self-audit J26): the season from the PKT month, as the 3-hour block and the day (was the UTC month: 00-05 PKT on the first
# day of a season month fell in the season before); registered as temp-zone-abcs@2
P['blk'] = (pkt.dt.hour // 3).astype(np.int8); P['sea'] = pkt.dt.month.map(SEAS); P['day'] = pkt.dt.date
P['night'] = pkt.dt.hour.isin([20, 21, 22, 23, 0, 1, 2, 3, 4, 5])
P['res'] = P.obs - P.p_model
P['onshore'] = ((P.wind_direction_10m >= 180) & (P.wind_direction_10m <= 300)).astype(np.int8)
# T0 quintile edges per zone x season from the fitting folds are computed inside the fold loop
for c in ('A', 'B', 'S'): P['p_' + c] = np.nan
P['lo_C'] = np.nan; P['hi_C'] = np.nan
for k in sorted(P.fold.unique()):
    fit = (P.fold != k) & ~P.locked; app = P.fold == k
    F = P[fit]
    A = F.groupby(['zone', 'blk', 'sea']).res.mean()
    key = pd.MultiIndex.from_frame(P.loc[app, ['zone', 'blk', 'sea']])
    offA = A.reindex(key).fillna(0).values
    P.loc[app, 'p_A'] = P.loc[app, 'p_model'].values + offA
    # B: quintile of T0 within zone x season (edges from the fitting rows)
    qb = np.zeros(app.sum(), dtype=np.int8); qf = np.zeros(fit.sum(), dtype=np.int8)
    Fi = P.index[fit]; Ai = P.index[app]
    for (z, s), g in F.groupby(['zone', 'sea']):
        e = np.quantile(g.temperature_2m, [0.2, 0.4, 0.6, 0.8])
        qf[np.isin(Fi, g.index)] = np.searchsorted(e, g.temperature_2m.values)
        m = (P.loc[Ai, 'zone'].values == z) & (P.loc[Ai, 'sea'].values == s)
        qb[m] = np.searchsorted(e, P.loc[Ai, 'temperature_2m'].values[m])
    Fq = F.assign(q=qf)
    Bt = Fq.groupby(['zone', 'blk', 'sea', 'q']).res.agg(['mean', 'size'])
    Bt = Bt[Bt['size'] >= 300]['mean']
    keyB = pd.MultiIndex.from_arrays([P.loc[app, 'zone'].values, P.loc[app, 'blk'].values, P.loc[app, 'sea'].values, qb])
    offB = Bt.reindex(keyB).values; offB = np.where(np.isnan(offB), offA, offB)
    P.loc[app, 'p_B'] = P.loc[app, 'p_model'].values + offB
    # S: coast split by onshore
    St = F[F.zone == 'coast'].groupby(['blk', 'sea', 'onshore']).res.agg(['mean', 'size']); St = St[St['size'] >= 300]['mean']
    offS = offA.copy(); cz = P.loc[app, 'zone'].values == 'coast'
    keyS = pd.MultiIndex.from_arrays([P.loc[app, 'blk'].values[cz], P.loc[app, 'sea'].values[cz], P.loc[app, 'onshore'].values[cz]])
    v = St.reindex(keyS).values; offS[cz] = np.where(np.isnan(v), offA[cz], v)
    P.loc[app, 'p_S'] = P.loc[app, 'p_model'].values + offS
    # C: Mondrian conformal by zone x block, on the current range (target 90 %): signed score s = max(lo - y, y - hi)
    sc = np.maximum(F.lo - F.obs, F.obs - F.hi)
    Q = sc.groupby([F.zone, F.blk]).quantile(0.90)
    keyC = pd.MultiIndex.from_frame(P.loc[app, ['zone', 'blk']])
    q = Q.reindex(keyC).fillna(0).values
    P.loc[app, 'lo_C'] = P.loc[app, 'lo'].values - q; P.loc[app, 'hi_C'] = P.loc[app, 'hi'].values + q
P = P.dropna(subset=['p_A', 'p_B', 'p_S'])
st_codes, st_idx = np.unique(P.pid.values, return_inverse=True); d_codes, d_idx = np.unique(P.day.values.astype(str), return_inverse=True)
P['si'] = st_idx; P['di'] = d_idx
rng = np.random.default_rng(20261022)
WS = rng.multinomial(len(st_codes), np.ones(len(st_codes)) / len(st_codes), size=B).astype(np.float32)
WD = rng.multinomial(len(d_codes), np.ones(len(d_codes)) / len(d_codes), size=B).astype(np.float32)


def boot(si, di, diff, cnt=None):
    """two-way cluster bootstrap of a mean over units (rows) indexed by station si and day di; returns (mean, lo95, hi95)"""
    cnt = np.ones_like(diff) if cnt is None else cnt
    S = np.zeros((len(st_codes), len(d_codes)), np.float64); N = np.zeros_like(S)
    np.add.at(S, (si, di), diff); np.add.at(N, (si, di), cnt)
    num = ((WS @ S) * WD).sum(1); den = ((WS @ N) * WD).sum(1); ok = den > 0
    r = num[ok] / den[ok]
    return float(diff.sum() / cnt.sum()), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def compare(D, cand, label):
    ec = np.abs(D.p_model.values - D.obs.values); ek = np.abs(D[cand].values - D.obs.values)
    m, lo, hi = boot(D.si.values, D.di.values, ec - ek)
    return dict(stratum=label, n=int(len(D)), stations=int(D.pid.nunique()), mae_current=round(float(ec.mean()), 3), mae_candidate=round(float(ek.mean()), 3),
                bias_current=round(float((D.p_model - D.obs).mean()), 3), bias_candidate=round(float((D[cand] - D.obs).mean()), 3),
                gain=round(m, 3), ci95=[round(lo, 3), round(hi, 3)])


def daily(D, cand, how):
    g = D.groupby(['pid', 'day'])
    n = g.obs.transform('size'); D = D[n >= 20]
    f = 'min' if how == 'tmin' else 'max'
    a = D.groupby(['pid', 'day']).agg(o=('obs', f), c=('p_model', f), k=(cand, f), r=('temperature_2m', f), si=('si', 'first'), di=('di', 'first'), zone=('zone', 'first'), sea=('sea', 'first')).reset_index()
    return a


def compare_daily(a, label, sel=None):
    if sel is not None: a = a[sel]
    ec = np.abs(a.c - a.o).values; ek = np.abs(a.k - a.o).values
    if len(a) < 30: return dict(stratum=label, n=int(len(a)), note='too few station-days')
    m, lo, hi = boot(a.si.values, a.di.values, ec - ek)
    return dict(stratum=label, n=int(len(a)), stations=int(a.pid.nunique()), mae_current=round(float(ec.mean()), 3), mae_candidate=round(float(ek.mean()), 3),
                bias_current=round(float((a.c - a.o).mean()), 3), bias_candidate=round(float((a.k - a.o).mean()), 3), gain=round(m, 3), ci95=[round(lo, 3), round(hi, 3)])


res = {'design': 'cross-fold on the national OOF (5 spatial folds x alternate weeks); locked points scored apart', 'B': B, 'rows': int(len(P)),
       'stations': int(len(st_codes)), 'days': int(len(d_codes))}
NL = P[~P.locked]; LK = P[P.locked]
for cand in ('p_A', 'p_B', 'p_S'):
    out = []
    for z in ['plains', 'hills', 'mountain', 'coast']:
        out.append(compare(NL[NL.zone == z], cand, f'{z} all hours'))
    out.append(compare(NL[(NL.zone == 'plains') & NL.night], cand, 'plains night 20-05 PKT'))
    out.append(compare(NL[(NL.zone == 'hills') & NL.night], cand, 'hills night 20-05 PKT'))
    if len(LK): out.append(compare(LK, cand, 'LOCKED test points, all zones'))
    for z in ['plains', 'hills']:
        a = daily(NL[NL.zone == z], cand, 'tmin'); out.append(compare_daily(a, f'{z} daily Tmin'))
        a = daily(NL[NL.zone == z], cand, 'tmax'); out.append(compare_daily(a, f'{z} daily Tmax'))
    # forecast-conditioned extremes (Lerch et al. 2017)
    for z in ['plains', 'hills', 'mountain', 'coast']:
        ax = daily(NL[NL.zone == z], cand, 'tmax'); thr = ax.groupby('sea').r.transform(lambda v: np.quantile(v, 0.9))
        out.append(compare_daily(ax, f'{z} hot days (T0 Tmax >= zone-season p90, MAM+JJA)', (ax.r >= thr) & ax.sea.isin(['MAM', 'JJA'])))
        an = daily(NL[NL.zone == z], cand, 'tmin'); thr = an.groupby('sea').r.transform(lambda v: np.quantile(v, 0.1))
        out.append(compare_daily(an, f'{z} cold nights (T0 Tmin <= zone-season p10, DJF)', (an.r <= thr) & (an.sea == 'DJF')))
    res[cand] = out
# C: coverage and interval score per zone x block
cov = []
def iscore(lo, hi, y, a=0.10): return (hi - lo) + (2 / a) * (lo - y) * (y < lo) + (2 / a) * (y - hi) * (y > hi)
for (z, b), g in NL.groupby(['zone', 'blk']):
    cc = ((g.obs >= g.lo) & (g.obs <= g.hi)).mean(); ck = ((g.obs >= g.lo_C) & (g.obs <= g.hi_C)).mean()
    cov.append(dict(zone=z, blk_pkt=f'{3*b:02d}-{3*b+3:02d}', n=int(len(g)), cover_current=round(float(cc), 3), cover_candidate=round(float(ck), 3)))
isc = iscore(NL.lo.values, NL.hi.values, NL.obs.values); isk = iscore(NL.lo_C.values, NL.hi_C.values, NL.obs.values)
m, lo, hi = boot(NL.si.values, NL.di.values, isc - isk)
res['C'] = dict(cells=cov, interval_score_current=round(float(isc.mean()), 3), interval_score_candidate=round(float(isk.mean()), 3), gain=round(m, 3), ci95=[round(lo, 3), round(hi, 3)],
                cells_in_band_current=int(sum(0.87 <= c['cover_current'] <= 0.93 for c in cov if c['n'] >= 300)),
                cells_in_band_candidate=int(sum(0.87 <= c['cover_candidate'] <= 0.93 for c in cov if c['n'] >= 300)),
                locked_cover_current=round(float(((LK.obs >= LK.lo) & (LK.obs <= LK.hi)).mean()), 3) if len(LK) else None, locked_cover_candidate=round(float(((LK.obs >= LK.lo_C) & (LK.obs <= LK.hi_C)).mean()), 3) if len(LK) else None)
res['C']['n_cells_300'] = int(sum(c['n'] >= 300 for c in cov))
def holm_pass(items):
    # items: list of (lower bound of gain) for the target strata; Holm at 5 %: approximate with the 95 % bounds of the ordered tests
    return all(lb > 0 for lb in items)
for cand, targets in (('p_A', ['plains night 20-05 PKT', 'hills all hours']), ('p_B', ['plains night 20-05 PKT', 'hills all hours']), ('p_S', ['coast all hours'])):
    S = {x['stratum']: x for x in res[cand] if 'gain' in x}
    t_ok = holm_pass([S[t]['ci95'][0] for t in targets if t in S])
    z_ok = all(S[f'{z} all hours']['ci95'][0] > -max(0.05, 0.03 * S[f'{z} all hours']['mae_current']) for z in ['plains', 'hills', 'mountain', 'coast'] if f'{z} all hours' in S)
    l = S.get('LOCKED test points, all zones'); l_ok = (l is None) or l['ci95'][0] > -max(0.05, 0.03 * l['mae_current'])
    res[cand + '_promotable'] = bool(t_ok and z_ok and l_ok)
c = res['C']; big = [x for x in c['cells'] if x['n'] >= 300]
res['C_promotable'] = bool(all(0.87 <= x['cover_candidate'] <= 0.93 for x in big) and not all(0.87 <= x['cover_current'] <= 0.93 for x in big) and c['ci95'][0] > -0.03 * c['interval_score_current'])
json.dump(res, open(OUT, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'C'}, indent=1)[:6000])
print('C', {k: v for k, v in res['C'].items() if k != 'cells'}); print({k: v for k, v in res.items() if k.endswith('_promotable')})
