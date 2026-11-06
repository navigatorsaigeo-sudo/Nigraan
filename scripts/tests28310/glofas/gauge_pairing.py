#!/usr/bin/env python3
"""v283.10 part 3 · R6 + R7 (PASS_RULES.txt): which GloFAS UTC-day mean physically pairs with the 06:00 PKT gauge sheet of day G,
and does relabelling the client day D to that mean hold up against gauge truth?

R6: gauge inflow G(t) vs model UTC-day mean M(t+L), L = -1 (day G-1) and 0 (day G); Pearson r of day-to-day log changes, pooled over
    every gauge-year (2024/25/26) and counted per gauge-year. M = the served flow relabelled to the UTC day of the mean.
R7: current client value for day D = provider Asia/Karachi label D (archive); relabelled value = M(D + L*) with L* from R6.
    Map level (rivercal.served_level = flood.mjs riverLevel) vs gauge class (min(class, 4)) at client-visible gauges
    (rivercal.served_shown); per gauge and pooled change of mean |error| with 7-day block bootstrap 95 % CIs.
usage: RIVERCAL_UP=<nig> RIVERCAL_APP=<data> python gauge_pairing.py --old <pkt csv.gz> --utc <utc csv.gz> --out <json>"""
import os, sys, json
import numpy as np, pandas as pd
a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'rivercal'))
import rivercal as RC
RNG = np.random.default_rng(28311)


def boot(d, dates, n=2000):
    d = np.asarray(d, float); wk = pd.Series(pd.to_datetime(dates)).dt.to_period('W').astype(str).values
    u = np.unique(wk); idx = {w: np.where(wk == w)[0] for w in u}
    ms = [d[np.concatenate([idx[w] for w in RNG.choice(u, len(u))])].mean() for _ in range(n)]
    return [round(float(d.mean()), 4), round(float(np.quantile(ms, 0.025)), 4), round(float(np.quantile(ms, 0.975)), 4)]


def main():
    OLD = pd.read_csv(opt('--old'), index_col=0, parse_dates=True); M = pd.read_csv(opt('--utc'), index_col=0, parse_dates=True)
    O = RC.obs(); LIM = RC.limits(); out = dict(R6=dict(byGaugeYear={}, pooled={}), R7=dict(byGauge={}))
    pool = {-1: [], 0: []}; wins = {-1: 0, 0: 0, 'n': 0}
    for rid in RC.REACH:
        if rid not in M.columns: continue
        g = O[O.st == rid].set_index('date').sort_index().inflow.asfreq('D')
        for y in (2024, 2025, 2026):
            gy = g[str(y)] if str(y) in g.index.year.astype(str) else None
            if gy is None or gy.notna().sum() < 40: continue
            dg = np.log(gy).diff(); r = {}
            for L in (-1, 0):
                dm = np.log(M[rid].where(M[rid] > 0)).diff().shift(-L).reindex(dg.index)
                x = pd.concat([dg, dm], axis=1).replace([np.inf, -np.inf], np.nan).dropna(); x.columns = ['g', 'm']
                if len(x) >= 30 and x.iloc[:, 0].std() > 0 and x.iloc[:, 1].std() > 0:
                    r[L] = round(float(np.corrcoef(x.iloc[:, 0], x.iloc[:, 1])[0, 1]), 3); pool[L].append(x)
            if len(r) == 2:
                w = max(r, key=r.get); wins[w] += 1; wins['n'] += 1
                out['R6']['byGaugeYear'].setdefault(rid, {})[str(y)] = dict(rGminus1=r[-1], rG=r[0], wins='G-1' if w == -1 else 'G')
    for L in (-1, 0):
        X = pd.concat(pool[L]); out['R6']['pooled']['G-1' if L == -1 else 'G'] = dict(n=len(X), r=round(float(np.corrcoef(X.iloc[:, 0], X.iloc[:, 1])[0, 1]), 4))
    rp = out['R6']['pooled']; best = -1 if rp['G-1']['r'] > rp['G']['r'] else 0
    share = wins[best] / wins['n']
    out['R6'].update(winsGminus1=wins[-1], winsG=wins[0], gaugeYears=wins['n'], picked='G-1' if best == -1 else 'G', share=round(share, 3), established=bool(share >= 0.5))
    print('R6', out['R6']['pooled'], 'wins G-1', wins[-1], 'G', wins[0], 'of', wins['n'], '->', out['R6']['picked'], out['R6']['established'])
    if not out['R6']['established']:
        out['R7'] = dict(skipped='no pairing established (R6)'); json.dump(out, open(opt('--out'), 'w'), indent=1); return
    rows_all = []
    for rid in RC.REACH:
        if rid not in LIM or rid not in OLD.columns: continue
        g = O[O.st == rid].set_index('date').sort_index(); rows = []
        for d, o in zip(g.index, g.inflow.values):
            qo = OLD[rid].get(d); qn = M[rid].get(d + pd.Timedelta(days=best))
            if qo is None or qn is None or not (np.isfinite(qo) and np.isfinite(qn)): continue
            lo, ln = RC.served_level(rid, qo, d), RC.served_level(rid, qn, d)
            if lo is None or ln is None: continue
            t = min(RC.cls(o, LIM[rid]), 4); rows.append(dict(date=d, gauge=t, old=lo, new=ln, eo=abs(lo - t), en=abs(ln - t)))
        if not rows: continue
        R = pd.DataFrame(rows); diff = (R.en - R.eo).values; shown = RC.served_shown(rid); b = boot(diff, R.date)
        out['R7']['byGauge'][rid] = dict(clientVisible=shown, n=len(R), maeCurrent=round(float(R.eo.mean()), 4), maeNew=round(float(R.en.mean()), 4), diffNewMinusCurrent=b,
                                         changedDays=int((R.old != R.new).sum()), toward=int((diff < 0).sum()), away=int((diff > 0).sum()), worseCiSeparated=bool(b[1] > 0),
                                         days=[[str(r.date.date()), r.gauge, r.old, r.new] for r in R.itertuples() if r.old != r.new])
        if shown: rows_all.append(R)
    A = pd.concat(rows_all); pb = boot((A.en - A.eo).values, A.date)
    shownG = [k for k, v in out['R7']['byGauge'].items() if v['clientVisible']]
    sep = [k for k in shownG if out['R7']['byGauge'][k]['worseCiSeparated']]
    out['R7'].update(clientDayShows='UTC mean of day D%s' % ('-1' if best == -1 else ''), pooled=dict(n=len(A), maeCurrent=round(float(A.eo.mean()), 4), maeNew=round(float(A.en.mean()), 4),
                     diffNewMinusCurrent=pb, changedDays=int((A.old != A.new).sum()), toward=int((A.en < A.eo).sum()), away=int((A.en > A.eo).sum())),
                     worseCiSeparated=sep, passes=bool(pb[0] <= 0 and pb[2] <= 0.002 and not sep))
    json.dump(out, open(opt('--out'), 'w'), indent=1)
    for k, v in out['R7']['byGauge'].items():
        print(f"{k:10s} shown={v['clientVisible']!s:5s} n={v['n']:4d} err {v['maeCurrent']:.4f} -> {v['maeNew']:.4f} diff {v['diffNewMinusCurrent']} changed {v['changedDays']:3d} toward {v['toward']:3d} away {v['away']:3d}")
    print('pooled', out['R7']['pooled']); print('R7 passes', out['R7']['passes'], 'CI-separated worse', sep)


if __name__ == '__main__':
    main()
