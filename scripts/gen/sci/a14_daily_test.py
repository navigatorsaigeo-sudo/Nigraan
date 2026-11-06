"""SCI (v283.3) item 1 · audit A14 · daily Tmax/Tmin 90 % range per zone, held out in time. Rule: /tmp/claude-0/sci/RULES.md item 1.
usage: python3 a14_daily_test.py <daily_bulletin.parquet> <out.json>"""
import sys, json, numpy as np, pandas as pd
D = pd.read_parquet(sys.argv[1]); OUT = sys.argv[2]
X = []
for var, f, lo, hi, o in [('Tmax', 'fmax', 'lomax', 'himax', 'tmax'), ('Tmin', 'fmin', 'lomin', 'himin', 'tmin')]:
    d = D[D[o].notna() & D[lo].notna() & D[hi].notna() & D[f].notna()].copy()
    d = d[(d[lo] <= d[f]) & (d[f] <= d[hi])]
    d['var'] = var; d['obs'] = d[o]; d['T'] = d[f]; d['lo'] = d[lo]; d['hi'] = d[hi]
    X.append(d[['pid', 'zone', 'L', 'date', 'var', 'obs', 'T', 'lo', 'hi', 'month']])
X = pd.concat(X); X['dt'] = pd.to_datetime(X.date); X['blk'] = X.pid + '|' + X.dt.dt.isocalendar().week.astype(str)
def sides(g):
    a = ((g['T'] - g.obs) / (g['T'] - g.lo).clip(lower=0.05)).values; b = ((g.obs - g['T']) / (g.hi - g['T']).clip(lower=0.05)).values; return a, b
def kq(v, a=0.95):
    n = len(v); q = min(1.0, np.ceil((n + 1) * a) / n); return float(np.quantile(v, q, method='higher'))
def ci(inside, blk, nb=2000, seed=7):
    rng = np.random.default_rng(seed); keys = np.unique(blk); idx = {k: np.where(blk == k)[0] for k in keys}; out = []
    for _ in range(nb): out.append(inside[np.concatenate([idx[k] for k in rng.choice(keys, len(keys))])].mean())
    return [round(float(np.percentile(out, 2.5)), 3), round(float(np.percentile(out, 97.5)), 3)]
def summ(g, lo, hi):
    ins = ((g.obs.values >= lo) & (g.obs.values <= hi)).astype(float); c = ci(ins, g.blk.values)
    return dict(n=len(g), stations=int(g.pid.nunique()), coverage=round(float(ins.mean()), 3), ci95=c, below=round(float((g.obs.values < lo).mean()), 3),
                above=round(float((g.obs.values > hi).mean()), 3), width=round(float((hi - lo).mean()), 2), contains90=bool(c[0] <= 0.90 <= c[1]))
def rec(t, kl, kh): return (t['T'] - kl * (t['T'] - t.lo)).values, (t['T'] + kh * (t.hi - t['T'])).values
res = {}
for (z, v), g in X.groupby(['zone', 'var']):
    r = {}
    a, b = g[g.month <= 6], g[g.month >= 7]
    sa, sb = sides(a); kl, kh = kq(sa), kq(sb)
    r['D1'] = dict(calibrate='Jan-Jun', test='Jul-Sep', kLo=round(kl, 3), kHi=round(kh, 3), served=summ(b, b.lo.values, b.hi.values), recal=summ(b, *rec(b, kl, kh)))
    parts = []
    for m in range(3, 10):
        start = pd.Timestamp(2026, m, 1); cal = g[(g.dt < start) & (g.dt >= start - pd.Timedelta(days=60))]; t = g[g.month == m].copy()
        if len(cal) < 50 or not len(t): continue
        sa, sb = sides(cal); kl2, kh2 = kq(sa), kq(sb); t['lo2'], t['hi2'] = rec(t, kl2, kh2); parts.append(t)
    t = pd.concat(parts); r['D2'] = dict(calibrate='60 days before each test month', test='Mar-Sep', served=summ(t, t.lo.values, t.hi.values), recal=summ(t, t.lo2.values, t.hi2.values))
    a, b = g[g.month >= 4], g[g.month <= 3]
    sa, sb = sides(a); kl3, kh3 = kq(sa), kq(sb)
    r['D3'] = dict(calibrate='Apr-Sep', test='Jan-Mar', kLo=round(kl3, 3), kHi=round(kh3, 3), served=summ(b, b.lo.values, b.hi.values), recal=summ(b, *rec(b, kl3, kh3)))
    sa, sb = sides(g); r['final'] = dict(kLo=round(kq(sa), 3), kHi=round(kq(sb), 3), n=len(g), stations=int(g.pid.nunique()), days=[str(g.date.min()), str(g.date.max())])
    ok = all(r[k]['recal']['contains90'] and not r[k]['served']['contains90'] for k in ('D1', 'D2')) and r['D1']['recal']['n'] >= 300
    r['serve'] = bool(ok); r['allMonths'] = bool(ok and r['D3']['recal']['contains90'])
    r['months'] = list(range(1, 13)) if r['allMonths'] else sorted(int(m) for m in g.month.unique())
    res[f'{z}|{v}'] = r
json.dump(res, open(OUT, 'w'), indent=1)
for k, r in res.items():
    print(k, 'serve', r['serve'], 'allMonths', r['allMonths'], {d: (r[d]['served']['coverage'], r[d]['served']['ci95'], r[d]['recal']['coverage'], r[d]['recal']['ci95'], r[d]['served']['width'], r[d]['recal']['width']) for d in ('D1', 'D2', 'D3')}, r['final'])
