"""T1-A: sealed share (current bf*isf vs fixed bf*(bsf+isf)) against ESA WorldCover 2021 10 m built share (independent)."""
import json, sys, numpy as np
LCZ = sys.argv[1]; WC = sys.argv[2]; OUT = sys.argv[3]
t = json.load(open(LCZ))['tehsils']; w = json.load(open(WC))['units']
rng = np.random.default_rng(31); B = 2000
rows = []
for k, v in t.items():
    if v.get('status') != 'ok' or k not in w or w[k].get('worldcoverBuilt10m') is None: continue
    bf = min(1, max(0, v['bf'] or 0)); cur = bf * (v['isf'] or 0); fix = bf * min(1, (v['bsf'] or 0) + (v['isf'] or 0))
    rows.append(dict(uid=k, lcz=v['lcz'], bf=bf, cur=cur, fix=fix, roofs=bf * (v['bsf'] or 0), wc=w[k]['worldcoverBuilt10m'], fp=w[k].get('footprintShare')))
def test(R, name):
    c = np.array([r['cur'] for r in R]); f = np.array([r['fix'] for r in R]); y = np.array([r['wc'] for r in R])
    ec, ef = np.abs(c - y), np.abs(f - y); d = []
    for _ in range(B):
        i = rng.integers(0, len(R), len(R)); d.append(ef[i].mean() - ec[i].mean())
    fp = np.array([np.nan if r['fp'] is None else r['fp'] for r in R]); ro = np.array([r['roofs'] for r in R]); m = np.isfinite(fp)
    return dict(set=name, n=len(R), mae_current=round(float(ec.mean()), 4), mae_fixed=round(float(ef.mean()), 4),
                diff_ci=[round(float(np.percentile(d, 2.5)), 4), round(float(np.percentile(d, 97.5)), 4)],
                bias_current=round(float((c - y).mean()), 4), bias_fixed=round(float((f - y).mean()), 4),
                roof_vs_footprint_bias=round(float((ro[m] - fp[m]).mean()), 4) if m.any() else None,
                current_below_roof_floor=int((c[m] < fp[m]).sum()), fixed_below_roof_floor=int((f[m] < fp[m]).sum()))
urb = [r for r in rows if r['lcz'] in (1, 2, 3)]
res = dict(primary=test(urb, 'LCZ 1-3 dominated'), guard=test(rows, 'all ok tehsils'),
           byClass={str(c): test([r for r in rows if r['lcz'] == c], 'LCZ %d dominated' % c) for c in sorted({r['lcz'] for r in rows})})
res['primaryPass'] = res['primary']['diff_ci'][1] < 0; res['guardPass'] = not (res['guard']['diff_ci'][0] > 0)
res['serve'] = res['primaryPass'] and res['guardPass']
json.dump(res, open(OUT, 'w'), indent=1); print(json.dumps(res, indent=1))
