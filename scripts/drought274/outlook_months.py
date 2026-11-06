#!/usr/bin/env python3
"""v91.17.274 - the 15-day drought outlook gated PER CALENDAR MONTH on held-out windows (DROUGHT agent).

The v91.17.176 replay (station-lake/scripts/drought_outlook.py --replay) pooled every month into one score. A pooled pass can hide a
month in which the outlook is worse than simply keeping today's index. This script re-scores the SAME replay design per issue month:

  target    SPI-90 at the end of pentad p+2 (the outlook's valid-to), observed CHIRPS v3 (data/chirps-tehsil.npz)
  issue     every pentad p of 2015-2019 and 2021-2025 (CHIRPS3-GEFS has no 2020); last observed CHIRPS pentad = p-2 (live lag)
  forecasts (a) persistence: the index on the map at issue (SPI-90 ending p-2)
            (b) climatology fill: pentads after p-2 filled with the 1991-2020 pentad mean
            (c) CHIRPS3-GEFS: pentads p-1, p from lead 0, p+1 lead 1, p+2 lead 2 (only where the cached GEFS tehsil means exist;
                cache = station-lake/archive/chirps_gefs, written by drought_outlook.py; read only, nothing fetched)
  fits      identical to the drought layer: Thom gamma with zero share per pentad of the year, 1991-2020; arid refusal < 10 mm
  gate      (v270 rule, per month) window 1 = 2015-2019, window 2 = 2021-2025; gain = MAE(persistence) - MAE(forecast);
            window 1: 90 % bootstrap interval of the gain (resampling issue pentads) wholly above 0; window 2: gain >= 0.
            A month passes only if both windows pass. Bands: U.S. Drought Monitor SPI ranges (Svoboda et al. 2002).
  output    <app>/data/drought-outlook-test-months.json {months: {"01".."12": {gefs: {...}, climFill: {...}}}, passedMonths: [...]}
            The server shows the outlook only in passed months of the GEFS forecast once this file exists (climatology.mjs).
usage (laptop):  python outlook_months.py --app <nigraan-local> --lake <station-lake>
usage (cloud):   python outlook_months.py --app <copy> --lake <station-lake copy>   (no GEFS cache: scores (b) only, states it)
numpy only on the laptop; scipy is used when present (same CDF, vectorised).
"""
import os, sys, json, datetime as dt
import numpy as np
a = sys.argv[1:]; opt = lambda n, d: a[a.index(n) + 1] if n in a else d
APP = os.path.abspath(opt('--app', '.')); LAKE = os.path.abspath(opt('--lake', os.path.join(APP, '..', 'station-lake')))
OUT = opt('--out', os.path.join(APP, 'data', 'drought-outlook-test-months.json'))
CACHE = opt('--gefs', os.path.join(LAKE, 'archive', 'chirps_gefs'))
sys.path.insert(0, os.path.join(LAKE, 'scripts'))
sys.argv = [sys.argv[0]]                                  # drought_chirps parses argv at import
from drought_chirps import SP, ARID_MM
try:
    if '--no-scipy' in a: raise ImportError('numpy-only path requested')
    from scipy.special import gammainc as _ginc; from scipy.stats import norm as _norm
except Exception:
    _ginc = None

Z = np.load(os.path.join(APP, 'data', 'chirps-tehsil.npz'), allow_pickle=True)
UID = [str(u) for u in Z['uids']]; KEYS = [str(k) for k in Z['keys']]; P = Z['P'].astype(float); NU = len(UID)
KPOS = {k: i for i, k in enumerate(KEYS)}
PK = lambda k: (int(k[5:7]) - 1) * 6 + int(k[8]) - 1
YR = np.array([int(k[:4]) for k in KEYS]); PKA = np.array([PK(k) for k in KEYS])
def pnext(k, n=1):
    y, m, p = map(int, k.split('.')); i = (m - 1) * 6 + (p - 1) + n; y += i // 72; i %= 72; return '%04d.%02d.%d' % (y, i // 6 + 1, i % 6 + 1)
W = 18
cs = np.concatenate([np.zeros((NU, 1)), np.nancumsum(np.nan_to_num(P), 1)], 1)
def roll(i): return cs[:, i + 1] - cs[:, i + 1 - W]                       # 18-pentad sum ending at column i
FQ = np.full((NU, 72), np.nan); FA = np.full((NU, 72), np.nan); FB = np.full((NU, 72), np.nan); CL = np.full((NU, 72), np.nan)
PMEAN = np.zeros((NU, 72))
for q in range(72):
    base = np.where((PKA == q) & (YR >= 1991) & (YR <= 2020) & (np.arange(len(KEYS)) >= W - 1))[0]
    PMEAN[:, q] = np.nanmean(P[:, (PKA == q) & (YR >= 1991) & (YR <= 2020)], 1)
    R = np.stack([roll(i) for i in base], 1)
    for u in range(NU):
        v = R[u][np.isfinite(R[u])]; CL[u, q] = v.mean() if v.size else np.nan
        f = SP.fit_gamma(v) if v.size >= 15 else None
        if f and f[1] is not None: FQ[u, q], FA[u, q], FB[u, q] = f
def spi(q, x):
    """vector SPI-90 for all units at pentad-of-year q, window sums x (NU,)"""
    ok = np.isfinite(x) & np.isfinite(FA[:, q]) & (CL[:, q] >= ARID_MM) & (x >= 0)
    out = np.full(NU, np.nan)
    if _ginc is not None:
        xx = np.where(ok, x, 0); G = np.where(xx > 0, _ginc(np.where(ok, FA[:, q], 1), xx / np.where(ok, FB[:, q], 1)), 0)
        H = np.clip(FQ[:, q] + (1 - FQ[:, q]) * G, 1e-6, 1 - 1e-6); out[ok] = np.clip(_norm.ppf(H[ok]), -3, 3)
    else:
        for u in np.where(ok)[0]: out[u] = SP.spi_of([FQ[u, q], FA[u, q], FB[u, q]], float(x[u]))
    return out
def gefs(lead, key):
    f = os.path.join(CACHE, 'L%d_%s.npy' % (lead, key))
    return np.load(f).astype(float) if os.path.exists(f) else None
BANDS = [-0.5, -0.8, -1.3, -1.6, -2.0]
def band(x): return np.where(np.isfinite(x), sum((x <= b).astype(int) for b in BANDS), -9)

issues = [k for k in KEYS if '2015.01.1' <= k <= '2025.12.4' and not k.startswith('2020') and not (k.startswith('2021.01') and k[8] in '12')]
issues = [k for k in issues if pnext(k, 2) in KPOS]
if '--max-issues' in a: issues = issues[::max(1, len(issues) // int(opt('--max-issues', '0')))]   # test runs only
rows = {}                                                  # month -> list of (window, issue, obs, now, clim, gefs) arrays
ngefs = 0
for p in issues:
    lo = pnext(p, -2); tgt = pnext(p, 2); il, it = KPOS[lo], KPOS[tgt]
    obs = spi(PK(tgt), roll(it)); now = spi(PK(lo), roll(il))
    ks = [pnext(tgt, -n) for n in range(W - 1, -1, -1)]
    obs_part = sum(P[:, KPOS[k]] for k in ks if k <= lo)
    fill_keys = [k for k in ks if k > lo]                 # p-1, p, p+1, p+2
    clim = spi(PK(tgt), obs_part + sum(PMEAN[:, PK(k)] for k in fill_keys))
    G = [gefs(0, fill_keys[0]), gefs(0, fill_keys[1]), gefs(1, fill_keys[2]), gefs(2, fill_keys[3])]
    gf = spi(PK(tgt), obs_part + sum(G)) if all(g is not None and g.shape[0] == NU for g in G) else np.full(NU, np.nan)
    if np.isfinite(gf).any(): ngefs += 1
    m = p[5:7]; wdw = 1 if int(p[:4]) <= 2019 else 2
    rows.setdefault(m, []).append((wdw, p, obs, now, clim, gf))

rng = np.random.default_rng(1)
def score(R, which):
    """per-window MAE gain vs persistence with the 90 % bootstrap interval over issue pentads (window 1) """
    res = {}
    for wdw in (1, 2):
        gains, n, mf, mp = [], 0, [], []
        per = []
        for (w, p, obs, now, clim, gf) in R:
            if w != wdw: continue
            fc = clim if which == 'climFill' else gf
            ok = np.isfinite(obs) & np.isfinite(now) & np.isfinite(fc)
            if ok.sum() == 0: continue
            per.append((np.abs(now[ok] - obs[ok]).sum(), np.abs(fc[ok] - obs[ok]).sum(), ok.sum(),
                        band(obs[ok]), band(now[ok]), band(fc[ok])))
        if not per: res['w%d' % wdw] = None; continue
        A = np.array([[x[0], x[1], x[2]] for x in per])
        g = (A[:, 0].sum() - A[:, 1].sum()) / A[:, 2].sum()
        bs = []
        for _ in range(1000):
            ix = rng.integers(0, len(A), len(A)); s = A[ix].sum(0); bs.append((s[0] - s[1]) / s[2])
        bo = np.concatenate([x[3] for x in per]); bn = np.concatenate([x[4] for x in per]); bf = np.concatenate([x[5] for x in per])
        tc, fcc = np.sign(bo - bn), np.sign(bf - bn); exp = sum(np.mean(fcc == c) * np.mean(tc == c) for c in (-1, 0, 1))
        hss = float((np.mean(fcc == tc) - exp) / (1 - exp)) if exp < 1 else None
        res['w%d' % wdw] = dict(issues=len(per), n=int(A[:, 2].sum()), maeForecast=round(float(A[:, 1].sum() / A[:, 2].sum()), 3),
                                maePersistence=round(float(A[:, 0].sum() / A[:, 2].sum()), 3), gain=round(float(g), 3),
                                gain90=[round(float(np.quantile(bs, .05)), 3), round(float(np.quantile(bs, .95)), 3)],
                                heidkeBandChange=None if hss is None else round(hss, 3))
    w1, w2 = res.get('w1'), res.get('w2')
    res['passed'] = bool(w1 and w2 and w1['gain90'][0] > 0 and w2['gain'] >= 0)
    return res
months = {}
for m in sorted(rows):
    months[m] = {'climFill': score(rows[m], 'climFill'), 'gefs': score(rows[m], 'gefs') if ngefs else None}
have = ngefs > 0
out = dict(version='drought-outlook-test-months-91.17.274', built=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
           rule='per issue month: window 1 (2015-2019) 90 % bootstrap interval of the SPI-90 MAE gain over persistence wholly above 0, '
                'window 2 (2021-2025) gain >= 0 (v270 gate); the outlook is shown only in months whose CHIRPS3-GEFS forecast passes',
           design='drought_outlook.py --replay design, every pentad (GEFS: every cached issue), one-pentad CHIRPS lag; target SPI-90 at p+2',
           gefsIssues=ngefs, gefsCache=CACHE if have else None,
           gefsNote=None if have else 'no CHIRPS3-GEFS cache in this copy: only the climatology fill is scored; run on the laptop for the forecast',
           months=months,
           passedMonths=[m for m in months if months[m]['gefs'] and months[m]['gefs']['passed']] if have else None,
           passedMonthsClimFill=[m for m in months if months[m]['climFill']['passed']],
           source='CHIRPS v3 pentads (UCSB CHC, CC BY 4.0); CHIRPS3-GEFS pentad leads 0-2 (UCSB CHC)')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w'), indent=1)
print('gefs issues', ngefs, 'passed months (gefs)', out['passedMonths'], 'passed months (clim fill)', out['passedMonthsClimFill'])
