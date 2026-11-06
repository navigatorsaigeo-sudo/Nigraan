#!/usr/bin/env python3
"""BLEND-R candidate (rule RULES_20261101.json BLENDR_blend_weights_rebalanced, written before any result).

The Step-2 blend start (station-lake/scripts/step2_blend.py) is a convex, no-intercept mix of nine global models fitted per
zone x lead x 3-hour block. 45.5 % of its training rows are urban MACH stations; their urban night warmth is learned as a model
choice and is carried to rural points (bias trace 22 Oct: +0.87 C on rural plains Tmin, raw best_match +0.14).
Variants  V0 as served (unweighted rows); V1 per-network row weights: in every fit cell the MACH rows carry the same total weight as all
          other rows together; V2 MACH rows dropped.
Design    leave-station-out: 0.5-degree cells -> 5 folds (crc32-balanced, national_train.py); weights for fold k are fitted on the other
          folds' stations (all months); locked points are never fitted. v91.17.283.14: no station list; a truth value the quality
          control fails (obsqc.mjs through scripts/lib/obsqc_truth.py: obs_qc_flags*.parquet for the table, and the PMD AWS overlay
          judged here) is neither fitted nor scored.
Truth     archive/national/table.parquet obs; PMD AWS points overlaid with the newest PMD AWS hourly file given (LAMHA copy, incl. Sep-Oct 2026).
Scored    the blend START (no chain), leads 1, 2, 3, 5 pooled, against the station hour. Two-way cluster bootstrap (stations x days, B = 1000).
GHCNh     (data addition 22 Oct 2026, not a rule change) --ghcnh <ghcnh_truth.parquet>: NOAA GHCNh hours that no other source holds for
          the point (ghcnh_truth.py, de-duplicated by point and hour against ISD-Lite, METAR, synop and the table) are overlaid as truth
          and are HELD OUT ONLY: never in a weight fit, scored in the point's fold like every other row, reported also as 'ghcnh'.
usage     python blend_r.py <station-lake dir> <pmd aws hourly parquet or -> <out json> [--app <nigraan-local>] [--points N] [--ghcnh <parquet>]
          Low memory use: one point's frame at a time for scoring; rows held as float32."""
import os, sys, json, zlib, time, argparse, numpy as np, pandas as pd
from scipy.optimize import nnls
ap = argparse.ArgumentParser(); ap.add_argument('lake'); ap.add_argument('pmd'); ap.add_argument('out'); ap.add_argument('--app', default=None)
ap.add_argument('--points', type=int, default=0); ap.add_argument('--B', type=int, default=1000); ap.add_argument('--ghcnh', default=None); a = ap.parse_args()
sys.path.insert(0, os.path.join(a.lake, 'scripts'))
import mm_table as M, step2_blend as SB
NAT = os.path.join(a.lake, 'archive', 'national'); t0 = time.time()
LOCK = M.LOCK
APP = a.app or os.path.join(a.lake, '..', 'nigraan-local'); sys.path.insert(0, os.path.join(APP, 'scripts', 'lib'))
import obsqc_truth as QT
QF = [os.path.join(NAT, f) for f in ('obs_qc_flags.parquet', 'obs_qc_flags_ghcnh.parquet') if os.path.exists(os.path.join(NAT, f))]
if not QF: sys.exit('archive/national/obs_qc_flags.parquet missing: run the obs_qc step first')
QB = pd.concat([pd.read_parquet(f, columns=['pid', 't', 'pass']) for f in QF]); QB['t'] = pd.to_datetime(QB.t, utc=True)
QBAD = set(zip(QB.pid[QB['pass'] == 0], QB.t[QB['pass'] == 0])); del QB
try:
    import step2_screen; BAD = step2_screen.flagged()
except Exception: BAD = set()
P = pd.read_csv(os.path.join(NAT, 'points.csv'))
if a.points: P = P.head(a.points)
ZN, zsrc = SB.zones(P)
O = pd.read_parquet(os.path.join(NAT, 'table_full.parquet') if os.path.exists(os.path.join(NAT, 'table_full.parquet')) else os.path.join(NAT, 'table.parquet'), columns=['t', 'pid', 'obs'])
O['t'] = pd.to_datetime(O.t, utc=True); O = O[[(p, t) not in QBAD for p, t in zip(O.pid, O.t)]]; O = {p: g.drop_duplicates('t').set_index('t').obs for p, g in O.groupby('pid')}
if a.pmd != '-' and os.path.exists(a.pmd):
    A = pd.read_parquet(a.pmd, columns=['st', 'hour_utc', 'temp_c']); A['t'] = pd.to_datetime(A.hour_utc).dt.tz_localize('UTC')
    A['pid'] = 'pmd:' + A.st.astype(str).str.replace(' ', '_')   # the overlay through the same quality control (its stations at the points' positions)
    _st = P.merge(pd.DataFrame({'pid': list(ZN.keys()), 'zone': list(ZN.values())}), on='pid', how='left')[['pid', 'lat', 'lon', 'elev', 'zone']]
    _F = QT.qc_frame(pd.DataFrame({'pid': A.pid, 'time': A.t, 'T': A.temp_c}), _st[_st.pid.isin(set(A.pid))], APP, nearest_min=0)
    _ok = set(zip(_F.pid[(_F['var'] == 'T') & (_F['pass'] == 1)], _F.time_utc[(_F['var'] == 'T') & (_F['pass'] == 1)]))
    A = A[[(p, t.strftime('%Y-%m-%dT%H:%MZ')) in _ok for p, t in zip(A.pid, A.t)]]; print('PMD AWS overlay values passing the quality control:', len(A), flush=True)
    for st, g in A.groupby('st'):
        k = 'pmd:' + str(st).replace(' ', '_'); s = g.drop_duplicates('t').set_index('t').temp_c
        O[k] = pd.concat([O[k], s[~s.index.isin(O[k].index)]]).sort_index() if k in O else s
GHT = {}
if a.ghcnh and os.path.exists(a.ghcnh):   # GHCNh held-out truth overlay (hours no other source holds; never fitted)
    Gh = pd.read_parquet(a.ghcnh, columns=['pid', 't', 'obs']); Gh['t'] = pd.to_datetime(Gh.t, utc=True)
    for pid, g in Gh.groupby('pid'):
        s = g.drop_duplicates('t').set_index('t').obs.astype(float)
        if pid in O: s = s[~s.index.isin(O[pid].index)]; O[pid] = pd.concat([O[pid], s]).sort_index()
        else: O[pid] = s
        GHT[pid] = s.index
    print('GHCNh held-out hours overlaid:', sum(len(v) for v in GHT.values()), 'points', len(GHT), flush=True)
cells = (np.floor(P.lat * 2).astype(int).astype(str) + '_' + np.floor(P.lon * 2).astype(int).astype(str)).values
cs = pd.Series(cells).value_counts(); order = sorted(cs.index, key=lambda c: zlib.crc32(c.encode())); load = [0] * 5; fold_of = {}
for c in sorted(order, key=lambda c: -cs[c]): k = int(np.argmin(load)); fold_of[c] = k; load[k] += cs[c]
FOLD = dict(zip(P.pid, [fold_of[c] for c in cells])); NET = dict(zip(P.pid, P.net))
rows = []
for i, r in enumerate(P.itertuples()):
    o = O.get(r.pid)
    if o is None: continue
    F = SB.frame(r.pid)
    if F is None: continue
    F = F.drop(columns=[c for c in F.columns if c.endswith('_td')])
    F['obs'] = o.reindex(F.ts).values; F = F[F.obs.notna()]
    if BAD: F = F[~(r.pid + '|' + F.ts.dt.strftime('%Y-%m')).isin(BAD)]
    if not len(F): continue
    F['pid'] = r.pid; F['zone'] = ZN.get(r.pid, 'plains'); F['blk'] = ((F.ts.dt.hour + 5) % 24) // 3
    F['net'] = NET.get(r.pid, '?'); F['fold'] = FOLD[r.pid]; F['fitok'] = r.pid not in LOCK
    F['gh'] = F.ts.isin(GHT[r.pid]) if r.pid in GHT else False
    rows.append(F)
    if i % 25 == 0: print(i, r.pid, f'{time.time() - t0:.0f}s', flush=True)
D = pd.concat(rows, ignore_index=True); del rows
for c in ('pid', 'zone', 'net'): D[c] = D[c].astype(str).astype('category')
D['mach'] = D.net.eq('mach')
cov = D[[m + '_t' for m in SB.SET9 if m + '_t' in D]].notna().mean().sort_values(ascending=False); order = [c[:-2] for c in cov.index]
SB.SETS[:] = [order[:k] for k in range(len(order), 3, -1)]
D['gh'] = D.gh.astype(bool)
print('rows', len(D), 'points', D.pid.nunique(), 'GHCNh held-out rows', int(D.gh.sum()), 'MACH share of fit rows', round(float(D[D.fitok & ~D.gh].mach.mean()), 3), flush=True)


def wsolve(X, y, w):
    s = np.sqrt(w)[:, None]; Xw = X * s; yw = y * s[:, 0]
    lam = 1e3 * np.sqrt(w.sum()) * max(1.0, float(np.abs(y).mean()))
    A = np.vstack([Xw, lam * np.ones((1, X.shape[1]))]); b = np.append(yw, lam)
    v, _ = nnls(A.astype(np.float64), b.astype(np.float64)); t = v.sum()
    return v / t if t > 0 else np.full(X.shape[1], 1.0 / X.shape[1])


def cellw(mach, variant):
    if variant == 'V0': return np.ones(len(mach))
    if variant == 'V2': return np.where(mach, 0.0, 1.0)
    nm, no = mach.sum(), (~mach).sum()
    if nm == 0 or no == 0: return np.ones(len(mach))
    return np.where(mach, 0.5 / nm, 0.5 / no) * len(mach)


def fit(Dtr, variant):
    out = {}
    for si, S in enumerate(SB.SETS):
        c = [s + '_t' for s in S]; d = Dtr[Dtr[c].notna().all(axis=1)]
        if variant == 'V2': d = d[~d.mach]
        if len(d) < SB.MIN_ROWS: continue
        X = d[c].values.astype(np.float64); y = d.obs.values.astype(np.float64); zz = d.zone.values; LL = d.L.values; bb = d.blk.values; mm = d.mach.values
        for L in SB.LEADS:
            mL = LL == L
            if mL.sum() < SB.MIN_ROWS: continue
            out[(si, '*', L, -1)] = (wsolve(X[mL], y[mL], cellw(mm[mL], variant)), int(mL.sum()))
            for z in np.unique(zz):
                mz = mL & (zz == z)
                if mz.sum() < SB.MIN_ROWS: continue
                out[(si, z, L, -1)] = (wsolve(X[mz], y[mz], cellw(mm[mz], variant)), int(mz.sum()))
                for b in range(8):
                    m = mz & (bb == b)
                    if m.sum() >= SB.MIN_ROWS: out[(si, z, L, b)] = (wsolve(X[m], y[m], cellw(mm[m], variant)), int(m.sum()))
    return out


def blend(F, Wt, z):
    bt = np.full(len(F), np.nan)
    for si, S in enumerate(SB.SETS):
        c = [s + '_t' for s in S]
        if not all(x in F for x in c): continue
        ok = F[c].notna().all(axis=1).values & np.isnan(bt)
        if not ok.any(): continue
        for (L, b), ix in F[ok].groupby(['L', 'blk']).groups.items():
            w = SB.pick(Wt, si, z, L, b)
            if w is None: continue
            i = F.index.get_indexer(ix); bt[i] = F.loc[ix, c].values @ w
    return bt


VAR = ['V0', 'V1', 'V2']
for v in VAR: D['p_' + v] = np.nan
for k in range(5):
    tr = D[(D.fold != k) & D.fitok & ~D.gh]   # GHCNh hours are truth only
    for v in VAR:
        W = fit(tr, v)
        for (pid, z), F in D[D.fold == k].groupby(['pid', 'zone'], observed=True):
            D.loc[F.index, 'p_' + v] = blend(F, W, z)
    print('fold', k, f'{time.time() - t0:.0f}s', flush=True)
E = D.dropna(subset=['p_' + v for v in VAR]).copy(); E['day'] = (E.ts + pd.Timedelta(hours=5)).dt.date.astype(str)
rng = np.random.default_rng(20261022)


def boot(G, v, B=a.B):
    si = pd.factorize(G.pid.astype(str))[0]; di = pd.factorize(G.day)[0]
    d = ((G.p_V0 - G.obs).abs() - (G['p_' + v] - G.obs).abs()).values
    ns, nd = si.max() + 1, di.max() + 1; S = np.zeros((ns, nd)); N = np.zeros((ns, nd)); np.add.at(S, (si, di), d); np.add.at(N, (si, di), 1)
    WS = rng.multinomial(ns, np.ones(ns) / ns, size=B); WD = rng.multinomial(nd, np.ones(nd) / nd, size=B)
    num = ((WS @ S) * WD).sum(1); den = ((WS @ N) * WD).sum(1); rr = num[den > 0] / den[den > 0]
    m0 = float((G.p_V0 - G.obs).abs().mean())
    return dict(n=int(len(G)), stations=int(G.pid.astype(str).nunique()), mae_V0=round(m0, 3), mae=round(float((G['p_' + v] - G.obs).abs().mean()), 3),
                bias_V0=round(float((G.p_V0 - G.obs).mean()), 3), bias=round(float((G['p_' + v] - G.obs).mean()), 3), gain=round(float(d.mean()), 3),
                p1_25=round(float(np.percentile(rr, 1.25)), 3), ci95=[round(float(np.percentile(rr, 2.5)), 3), round(float(np.percentile(rr, 97.5)), 3)],
                margin=round(max(0.05, 0.03 * m0), 3))


def tmin(G, v):
    h = (G.ts.dt.hour + 5) % 24; g = G[h <= 8].groupby(['pid', 'day'], observed=True).agg(o=('obs', 'min'), p=('p_' + v, 'min'), n=('obs', 'size')); g = g[g.n >= 8]
    return dict(n=int(len(g)), bias=round(float((g.p - g.o).mean()), 3), mae=round(float((g.p - g.o).abs().mean()), 3))


S = E
res = {'design': 'leave-station-out (5 cell folds), blend start only, leads 1/2/3/5 pooled', 'rows': int(len(S)), 'stations': int(S.pid.nunique()),
       'mach_share_fit_rows': round(float(D[D.fitok & ~D.gh].mach.mean()), 3), 'model_order': order, 'variants': {},
       'ghcnh_rows_scored': int(S.gh.sum()), 'ghcnh_source': a.ghcnh if GHT else None}
for v in ('V1', 'V2'):
    R = {'all': boot(S, v), 'zones': {z: boot(S[S.zone == z], v) for z in sorted(S.zone.unique()) if S[S.zone == z].pid.nunique() >= 3},
         'urban_mach': boot(S[S.mach], v) if S.mach.any() else None, 'rural_non_mach': boot(S[~S.mach], v),
         'ghcnh': boot(S[S.gh], v) if S.gh.sum() > 100 else None, 'without_ghcnh': boot(S[~S.gh], v) if S.gh.any() else None,
         'pmd_aws_plains': boot(S[(S.net == 'pmdaws') & (S.zone == 'plains')], v) if ((S.net == 'pmdaws') & (S.zone == 'plains')).any() else None,
         'pmd_plains_daily_tmin': {'V0': tmin(S[(S.net == 'pmdaws') & (S.zone == 'plains') & (S.L == 1)], 'V0'), v: tmin(S[(S.net == 'pmdaws') & (S.zone == 'plains') & (S.L == 1)], v)},
         'pmd_plains_after_1sep_L1': boot(S[(S.net == 'pmdaws') & (S.zone == 'plains') & (S.L == 1) & (S.ts >= pd.Timestamp('2026-09-01', tz='UTC'))], v) if ((S.net == 'pmdaws') & (S.ts >= pd.Timestamp('2026-09-01', tz='UTC'))).sum() > 200 else None}
    ok = R['all']['p1_25'] > 0 and all(x['p1_25'] > -x['margin'] for x in R['zones'].values()) and (R['urban_mach'] is None or R['urban_mach']['p1_25'] > -R['urban_mach']['margin'])
    R['passes'] = bool(ok); res['variants'][v] = R
passing = [v for v in ('V1', 'V2') if res['variants'][v]['passes']]
res['promote'] = max(passing, key=lambda v: res['variants'][v]['all']['p1_25']) if passing else None
# v91.17.283.6 serving hook (NIGRAAN server/api/blend.mjs + data/blend-weights-active.json): when a variant passes, its weights fitted on
# every fit-eligible row are written as a CANDIDATE file in the served format (sets, window2_weights with keys set<i>|<zone>|L<L>|blk<b> and
# values {n, w:{model: weight}}, regime) next to <out>, plus a PROMOTION RECORD <out minus .json>.promotion.json (promote, rule, variant,
# version, candidateFile, candidateSha256, sourceRun). Nothing is installed here: promotion only flips the server's pointer
#   node scripts\gen\blend_promote.mjs <promotion record>        (refuses unless promote is true and the checksum matches)
# The heat-regime ('|hot') cells are not refitted by BLEND-R and were not used in its scoring (SB.pick has no hot keys), so the candidate
# carries none and an empty regime: it serves exactly the weights that were tested, at every hour.
import hashlib, datetime
stamp = datetime.datetime.utcnow().strftime('%Y%m%d'); base = a.out[:-5] if a.out.endswith('.json') else a.out
rec = {'rule': 'BLENDR_blend_weights_rebalanced (RULES_20261101.json)', 'promote': bool(res['promote']), 'variant': res['promote'],
       'sourceRun': 'py/blend_r.py ' + os.path.basename(a.out) + ' (' + datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M') + ' UTC, ' + res['design'] + ')',
       'gain': res['variants'][res['promote']]['all'] if res['promote'] else None,
       'why': None if res['promote'] else 'no variant met the promotion rule (overall gain p1.25 > 0, every zone and urban MACH above -max(0.05, 0.03 MAE))'}
if res['promote']:   # weights file for the serving hook, fitted on every fit-eligible row
    W = fit(D[D.fitok & ~D.gh], res['promote'])
    res['weights_all_rows'] = {f'set{k[0]}|{k[1]}|L{k[2]}|blk{k[3]}': dict(n=n, w={s: round(float(x), 4) for s, x in zip(SB.SETS[k[0]], w)}) for k, (w, n) in W.items()}
    res['sets'] = {str(i): s for i, s in enumerate(SB.SETS)}
    cand = {'built': datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M'), 'source': 'BLEND-R ' + res['promote'] + ' (py/blend_r.py), fitted on every fit-eligible row',
            'sets': res['sets'], 'window2_weights': res['weights_all_rows'], 'regime': {}, 'model_order': order, 'train_rows': int((D.fitok & ~D.gh).sum()), 'train_points': int(D[D.fitok & ~D.gh].pid.nunique())}
    cname = 'blend-weights-blendr-%s-%s.json' % (res['promote'], stamp); cpath = os.path.join(os.path.dirname(os.path.abspath(a.out)), cname)
    cb = json.dumps(cand, indent=1).encode('utf-8'); open(cpath, 'wb').write(cb)
    rec.update(version='blendr-%s-%s' % (res['promote'], stamp), candidateFile=cname, candidateSha256=hashlib.sha256(cb).hexdigest())
    res['candidate'] = {'file': cname, 'sha256': rec['candidateSha256']}
json.dump(rec, open(base + '.promotion.json', 'w'), indent=1); res['promotionRecord'] = os.path.basename(base + '.promotion.json')
json.dump(res, open(a.out, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'weights_all_rows'}, indent=1)[:8000]); print('done', f'{time.time() - t0:.0f}s')
