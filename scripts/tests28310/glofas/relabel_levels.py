#!/usr/bin/env python3
"""v283.10 part 2 · R4(b): does relabelling the river forecast (row D = mean of UTC day D, instead of the provider's Asia/Karachi
label, which held the mean of D-2 in the forecast part and D-1 in the reanalysis part) move any client-visible map level the wrong
way against gauge truth?

For every gauge whose map level is shown to clients (rivercal.served_shown, the same rule as flood.mjs rarityClass) and every
2024/25/26 gauge day (06:00 PKT sheet, thousand cusecs, official limits), the served level (rivercal.served_level: the same
arithmetic as flood.mjs riverLevel, the current data/river-rarity.json and data/river-level-scale.json) is computed from
  old: the provider series in the pre-v283.10 frame (timezone Asia/Karachi) at label D
  new: the served series in the v283.10 frame (UTC day of the mean) at label D
and compared with the gauge class (min(class, 4), as rivercal). Also: how much the rarity table itself would move if it were
rebuilt on the new labels (Gumbel 2-year flow; half-month p95), same estimators as station-lake/scripts/river_rarity.py.
usage: RIVERCAL_UP=<nig> RIVERCAL_APP=<data dir> python relabel_levels.py --old <pkt csv.gz> --new <utc csv.gz> --out <json>"""
import os, sys, json
import numpy as np, pandas as pd
a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'rivercal'))
import rivercal as RC
RNG = np.random.default_rng(28310)


def boot(d, dates, n=2000):
    d = np.asarray(d, float); wk = pd.Series(pd.to_datetime(dates)).dt.to_period('W').astype(str).values
    u = np.unique(wk); idx = {w: np.where(wk == w)[0] for w in u}
    if len(u) < 3: return [float(d.mean())] * 3
    ms = [d[np.concatenate([idx[w] for w in RNG.choice(u, len(u))])].mean() for _ in range(n)]
    return [round(float(d.mean()), 4), round(float(np.quantile(ms, 0.025)), 4), round(float(np.quantile(ms, 0.975)), 4)]


def gumbel_rp2(s):
    s = s.dropna(); n = s.groupby(s.index.year).count(); mx = s.groupby(s.index.year).max()[n >= 350]
    b = np.sqrt(6) * mx.std(ddof=1) / np.pi; mu = mx.mean() - 0.5772 * b
    return mu - b * np.log(-np.log(0.5))


def hm_p95(s):
    s = s.dropna(); b = (s.index.month - 1) * 2 + (s.index.day > 15)
    return s.groupby(b).quantile(0.95)


def main():
    OLD = pd.read_csv(opt('--old'), index_col=0, parse_dates=True); NEW = pd.read_csv(opt('--new'), index_col=0, parse_dates=True)
    O = RC.obs(); LIM = RC.limits(); out = dict(byGauge={}, rarityShift={}); allrows = []
    for rid in RC.REACH:
        if rid not in LIM or rid not in OLD.columns: continue
        shown = RC.served_shown(rid)
        g = O[(O.st == rid)].set_index('date').sort_index()
        rows = []
        for d, o in zip(g.index, g.inflow.values):
            qo, qn = OLD[rid].get(d), NEW[rid].get(d)
            if qo is None or qn is None or not (np.isfinite(qo) and np.isfinite(qn)): continue
            lo, ln = RC.served_level(rid, qo, d), RC.served_level(rid, qn, d)
            if lo is None or ln is None: continue
            t = min(RC.cls(o, LIM[rid]), 4)
            rows.append(dict(reach=rid, date=str(d.date()), gauge=t, old=lo, new=ln, eo=abs(lo - t), en=abs(ln - t)))
        if not rows: continue
        R = pd.DataFrame(rows); diff = (R.en - R.eo).values
        rec = dict(clientVisible=shown, n=len(R), maeOld=round(float(R.eo.mean()), 4), maeNew=round(float(R.en.mean()), 4),
                   diffNewMinusOld=boot(diff, R.date), changedDays=int((R.old != R.new).sum()), toward=int((diff < 0).sum()),
                   away=int((diff > 0).sum()), sameErrorChanged=int(((diff == 0) & (R.old != R.new)).sum()),
                   passes=bool(R.en.mean() <= R.eo.mean()), days=[[r.date, r.gauge, r.old, r.new] for r in R.itertuples() if r.old != r.new])
        out['byGauge'][rid] = rec
        if shown: allrows.append(R)
        cut = slice('1997', '2025')
        p_o, p_n = hm_p95(OLD[rid][cut]), hm_p95(NEW[rid][cut])
        out['rarityShift'][rid] = dict(rp2Pct=round(float(100 * (gumbel_rp2(NEW[rid][cut]) / gumbel_rp2(OLD[rid][cut]) - 1)), 2),
                                       halfMonthP95MedianAbsPct=round(float(np.median(np.abs(100 * (p_n / p_o - 1)))), 2),
                                       halfMonthP95MaxAbsPct=round(float(np.max(np.abs(100 * (p_n / p_o - 1)))), 2))
    A = pd.concat(allrows); dd = (A.en - A.eo).values
    out['pooledClientVisible'] = dict(n=len(A), maeOld=round(float(A.eo.mean()), 4), maeNew=round(float(A.en.mean()), 4), diffNewMinusOld=boot(dd, A.date),
                                      changedDays=int((A.old != A.new).sum()), toward=int((dd < 0).sum()), away=int((dd > 0).sum()))
    shownGauges = [k for k, v in out['byGauge'].items() if v['clientVisible']]
    pooled = out['pooledClientVisible']['diffNewMinusOld']
    out['R4b'] = dict(everyShownGaugeNotWorse=all(out['byGauge'][k]['passes'] for k in shownGauges),
                      pooledOk=bool(pooled[2] <= 0 or pooled[0] <= 0), failing=[k for k in shownGauges if not out['byGauge'][k]['passes']])
    out['R4b']['passes'] = out['R4b']['everyShownGaugeNotWorse'] and out['R4b']['pooledOk']
    json.dump(out, open(opt('--out'), 'w'), indent=1)
    for k, v in out['byGauge'].items():
        print(f"{k:10s} shown={v['clientVisible']!s:5s} n={v['n']:4d} err old {v['maeOld']:.3f} new {v['maeNew']:.3f} diff {v['diffNewMinusOld']} changed {v['changedDays']:3d} toward {v['toward']:3d} away {v['away']:3d} | rarity rp2 {out['rarityShift'][k]['rp2Pct']:+.2f}% p95 med {out['rarityShift'][k]['halfMonthP95MedianAbsPct']}%")
    print('pooled', out['pooledClientVisible']); print('R4b', out['R4b'])


if __name__ == '__main__':
    main()
