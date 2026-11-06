#!/usr/bin/env python3
"""DRYSPONGE · drought tests D1-D5 (rules: /tmp/claude-0/drysponge/RULES.md, written before this ran).
Rebuild of the served drought level month by month (as station-lake/scripts/drought_backtest.py C0), then
D1 rain-fed wheat loss, D2 documented episodes, D3 soil vs VHI, D5 calibration.
usage: python3 -I drought_test.py <app data dir> <raw dir> <out.json>"""
import sys, os, json, re, math, datetime as dt
import numpy as np
from scipy import stats

APP, RAW, OUT = sys.argv[1:4]
rng = np.random.default_rng(23)
B = 2000

# ---- served scheme (data/drought-class.json)
DC = json.load(open(os.path.join(APP, 'drought-class.json')))
KI = np.array(DC['scoreKnots']['index'], float); KS = np.array(DC['scoreKnots']['soilPercentile'], float)
def s_index(x): return None if x is None else float(np.interp(-x, -KI[:, 0], KI[:, 1]))
def s_pct(p): return None if p is None else float(np.interp(-p, -KS[:, 0], KS[:, 1]))
CAT = DC['categories']
cM, cW, cA = s_index(CAT['Monitor']['indexAtMost']), s_index(CAT['Watch']['indexAtMost']), s_index(CAT['Act']['indexAtMost'])
def level(score):          # 0 Low, 1 Monitor, 2 Watch, 3 Act
    if score is None or not np.isfinite(score): return None
    return 3 if score >= cA else 2 if score >= cW else 1 if score >= cM else 0

# ---- gamma SPI (copied from station-lake/scripts/spi_pentad.py fit_gamma / spi_of)
def fit_gamma(v):
    v = np.asarray([x for x in v if x is not None and np.isfinite(x) and x >= 0], float)
    if v.size < 15: return None
    nz = v[v > 0]; q = (v.size - nz.size) / v.size
    if nz.size < 8: return [q, None, None]
    mean = nz.mean(); A = math.log(mean) - np.log(nz).mean()
    if not A > 0: return None
    a = (1 + math.sqrt(1 + 4 * A / 3)) / (4 * A); b = mean / a
    return [q, a, b] if (a > 0 and b > 0) else None
def spi_of(f, x):
    if f is None or f[1] is None or not np.isfinite(x) or x < 0: return np.nan
    q, a, b = f; G = stats.gamma.cdf(x, a, scale=b) if x > 0 else 0.0
    H = min(0.999999, max(0.000001, q + (1 - q) * G)); return float(max(-3, min(3, stats.norm.ppf(H))))

# ---- rain: CHIRPS v3 calendar-month SPI-3 per tehsil
Z = np.load(os.path.join(APP, 'chirps-tehsil.npz'), allow_pickle=True)
UID = [str(u) for u in Z['uids']]; KEYS = [str(k) for k in Z['keys']]; P = Z['P']
months = sorted({k[:7] for k in KEYS}); full = [m for m in months if sum(1 for k in KEYS if k.startswith(m)) == 6]
idx = {m: [i for i, k in enumerate(KEYS) if k.startswith(m)] for m in full}
MON = np.stack([P[:, idx[m]].sum(1) for m in full], 1); mi = {m: i for i, m in enumerate(full)}
S3 = np.full(MON.shape, np.nan)
for j in range(2, len(full)):
    if mi.get(full[j - 2]) == j - 2: S3[:, j] = MON[:, j - 2:j + 1].sum(1)
SPI = np.full(MON.shape, np.nan); ARID = np.zeros(MON.shape, bool)
for cm in range(1, 13):
    cols = [mi[m] for m in full if int(m[5:7]) == cm and m >= '1991.03']
    base = [mi[m] for m in full if int(m[5:7]) == cm and '1991.03' <= m <= '2020.12']
    for u in range(len(UID)):
        b = S3[u, base]
        if np.nanmean(b) < 10: ARID[u, cols] = True; continue          # served ARID_MM: index not defined
        f = fit_gamma(b)
        for c in cols: SPI[u, c] = spi_of(f, S3[u, c])

# ---- soil: ERA5-Land root-zone monthly percentile, leave-one-year-out
C = json.load(open(os.path.join(APP, 'era5land-climatology.json')))['units']
YRS = list(range(1996, 2026))
def lov_pct(v, i):
    o = np.delete(v, i); o = o[np.isfinite(o)]
    if o.size < 15 or not np.isfinite(v[i]): return None
    return 100.0 * ((o < v[i]).sum() + 0.5 * (o == v[i]).sum()) / o.size
SOIL = {}
for u in UID:
    rz = C.get(u, {}).get('rz')
    if not rz or 'v' not in rz: continue
    for cm in range(12):
        v = np.array([np.nan if x is None else x for x in rz['v'][cm]], float)
        for i, y in enumerate(YRS): SOIL[(u, '%04d.%02d' % (y, cm + 1))] = lov_pct(v, i)

UI = {u: i for i, u in enumerate(UID)}
def rec(u, m):
    """served record for tehsil u, month m: (score, level, index score, soil score) or None when not defined"""
    j = mi.get(m); i = UI[u]
    if j is None: return None
    if ARID[i, j]: return None
    x = SPI[i, j]; si = s_index(float(x)) if np.isfinite(x) else None
    ss = s_pct(SOIL.get((u, m)))
    if si is not None and ss is not None: sc = min(si, ss)
    elif si is not None: sc = min(si, cW - 1)
    elif ss is not None: sc = min(ss, cM - 1)
    else: return None
    return sc, level(sc), si, ss
ALLM = ['%04d.%02d' % (y, k) for y in YRS for k in range(1, 13)]
R = {(u, m): rec(u, m) for u in UID for m in ALLM}
def auc(x, y):
    x = np.asarray(x, float); y = np.asarray(y, bool); n1 = y.sum(); n0 = (~y).sum()
    if n1 == 0 or n0 == 0: return np.nan
    r = stats.rankdata(x); return float((r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))
ci = lambda v: [round(float(np.nanpercentile(v, 2.5)), 3), round(float(np.nanpercentile(v, 97.5)), 3)]

OUTJ = dict(rules='/tmp/claude-0/drysponge/RULES.md', rebuilt='served level C0 rebuilt monthly 1996-2025 (CHIRPS v3 SPI-3 + ERA5-Land root-zone percentile, USDM cuts)')

# ================= D5 calibration
def freq(m_from, m_to):
    by = {}
    for (u, m), r in R.items():
        if r is None or not (m_from <= m <= m_to): continue
        by.setdefault(m[:4], []).append(r[1])
    yrs = sorted(by); lv = {y: np.array(by[y]) for y in yrs}
    def share(ys, k): a = np.concatenate([lv[y] for y in ys]); return float((a >= k).mean())
    out = {}
    for k, nm in ((1, 'MonitorOrAbove'), (2, 'WatchOrAbove'), (3, 'Act')):
        bs = [share(list(rng.choice(yrs, len(yrs))), k) for _ in range(B)]
        out[nm] = dict(share=round(share(yrs, k), 4), ci=ci(bs))
    # single indicator (SPI-3 alone) for comparison
    a = np.array([SPI[UI[u], mi[m]] for (u, m), r in R.items() if r is not None and m_from <= m <= m_to and m in mi])
    a = a[np.isfinite(a)]
    out['spiAlone'] = {nm: round(float((a <= CAT[c]['indexAtMost']).mean()), 4) for nm, c in (('MonitorOrAbove', 'Monitor'), ('WatchOrAbove', 'Watch'), ('Act', 'Act'))}
    out['n'] = int(sum(len(v) for v in lv.values()))
    return out
nominal = {'MonitorOrAbove': round(float(stats.norm.cdf(-0.8)), 4), 'WatchOrAbove': round(float(stats.norm.cdf(-1.3)), 4), 'Act': round(float(stats.norm.cdf(-1.6)), 4)}
claim = {k: [1 / float(DC['firingFrequency']['rho0'][k].split()[-1]), 1 / float(DC['firingFrequency']['rho0.8'][k].split()[-1])] for k in ('MonitorOrAbove', 'WatchOrAbove', 'Act')}
F1 = freq('1996.01', '2020.12'); F2 = freq('1996.01', '2025.12')
cal_pass = all(F1[k]['ci'][1] >= claim[k][0] and F1[k]['ci'][0] <= claim[k][1] for k in claim) and F1['Act']['ci'][1] <= nominal['Act'] + 1e-9
# arid share
arid_share = float(ARID[:, [mi[m] for m in ALLM if m in mi]].mean())
OUTJ['D5_calibration'] = dict(nominalSingleIndicator=nominal, fileClaimRho0toRho08=claim, fitPeriod1996_2020=F1, all1996_2025=F2,
                              aridTehsilMonthShare=round(arid_share, 4), passes=bool(cal_pass))

# ================= D1 rain-fed wheat
Y = json.load(open(os.path.join(RAW, 'punjab_wheat_yield.json')))
norm = lambda s: re.sub(r'[^a-z]', '', s.lower().replace('dera ghazi', 'dg').replace('d.g.', 'dg').replace('dg.', 'dg'))
dist_units = {}
for u in UID:
    p, d, _ = u.split('|')
    if p == 'Punjab': dist_units.setdefault(norm(d), []).append(u)
def season_months(s): y0 = int(s[:4]); return ['%04d.11' % y0, '%04d.12' % y0] + ['%04d.%02d' % (y0 + 1, k) for k in (1, 2, 3)]
recs = []
for dname, ser in Y.items():
    if not isinstance(ser, dict) or dname.upper() == 'DISTRICTS': continue
    us = dist_units.get(norm(dname))
    pts = sorted((s, v.get('unirri')) for s, v in ser.items() if isinstance(v, dict) and v.get('unirri'))
    if not us or len(pts) < 10: continue
    x = np.array([int(s[:4]) for s, _ in pts], float); yv = np.array([float(v) for _, v in pts])
    b = np.polyfit(x, yv, 1); tr = np.polyval(b, x); an = (yv - tr) / tr
    for (s, _), a in zip(pts, an):
        ms = season_months(s)
        rr = [R.get((u, m)) for u in us for m in ms]; rr = [r for r in rr if r is not None]
        if not rr: continue
        sc = float(np.mean([r[0] for r in rr])); si = [r[2] for r in rr if r[2] is not None]
        # alarm: in any month, at least half the district's tehsils at Monitor or above
        alarm = any(np.mean([(R.get((u, m)) or (0, 0))[1] >= 1 for u in us]) >= 0.5 for m in ms)
        recs.append(dict(district=dname, season=s, anom=float(a), score=sc, spiScore=float(np.mean(si)) if si else np.nan, alarm=bool(alarm)))
recs = [r for r in recs if np.isfinite(r['spiScore'])]
seasons = sorted({r['season'] for r in recs})
def d1(rs):
    a = np.array([r['anom'] for r in rs]); s = np.array([r['score'] for r in rs]); sp = np.array([r['spiScore'] for r in rs]); al = np.array([r['alarm'] for r in rs])
    loss = a <= -0.15
    return dict(auc=auc(s, loss), aucSpi=auc(sp, loss), rho=float(stats.spearmanr(s, a)[0]),
                hit=float(al[loss].mean()) if loss.any() else np.nan, fa=float(al[~loss].mean()) if (~loss).any() else np.nan)
bs = [d1([r for s in rng.choice(seasons, len(seasons)) for r in recs if r['season'] == s]) for _ in range(B)]
D1 = d1(recs); loss_n = int(sum(r['anom'] <= -0.15 for r in recs))
OUTJ['D1_wheat'] = dict(truth='Punjab CRS un-irrigated wheat yield, detrended per district; loss = anomaly <= -15 % (independent of every input)',
    n=len(recs), lossSeasons=loss_n, districts=sorted({r['district'] for r in recs}), seasons=seasons,
    aucLevel=round(D1['auc'], 3), aucLevel_ci=ci([b['auc'] for b in bs]),
    aucSpiAlone=round(D1['aucSpi'], 3), aucSpiAlone_ci=ci([b['aucSpi'] for b in bs]),
    aucDiffLevelMinusSpi_ci=ci([b['auc'] - b['aucSpi'] for b in bs]),
    spearmanScoreVsAnom=round(D1['rho'], 3), spearman_ci=ci([b['rho'] for b in bs]),
    hitRate=round(D1['hit'], 3), hit_ci=ci([b['hit'] for b in bs]), falseAlarmRate=round(D1['fa'], 3), fa_ci=ci([b['fa'] for b in bs]),
    primaryPass=bool(ci([b['auc'] for b in bs])[0] > 0.5))

# ================= D2 documented episodes
def units_where(p, ds=None): return [u for u in UID if u.split('|')[0] == p and (ds is None or u.split('|')[1] in ds)]
def mrange(a, b):
    out = []; y, k = int(a[:4]), int(a[5:7])
    while '%04d.%02d' % (y, k) <= b: out.append('%04d.%02d' % (y, k)); k += 1; y += (k == 13); k = 1 if k == 13 else k
    return out
EV = [('E1 Balochistan 1999-2001', units_where('Balochistan'), mrange('1999.10', '2001.09'), True),
      ('E2 Sindh 1999-2001', units_where('Sindh'), mrange('1999.10', '2001.09'), True),
      ('E3 Tharparkar+Umerkot 2014-15', units_where('Sindh', {'Tharparkar', 'Umerkot', 'Umer Kot', 'Umarkot'}), mrange('2014.08', '2015.03'), True),
      ('E4 Sindh 2018-19', units_where('Sindh'), mrange('2018.07', '2019.06'), True),
      ('E5 Balochistan 2018-19', units_where('Balochistan'), mrange('2018.07', '2019.06'), True),
      ('E6 rain-fed rabi 2024-25 (PMD advisories; rain-based)', units_where('Punjab') + units_where('Khyber Pakhtunkhwa') + units_where('Balochistan'), mrange('2024.11', '2025.03'), False)]
def mdist(m, ms):
    y, k = int(m[:4]), int(m[5:7]); t = y * 12 + k
    return min(abs(t - (int(x[:4]) * 12 + int(x[5:7]))) for x in ms)
def d2(include_e6):
    evs = [e for e in EV if include_e6 or e[3]]
    pos = set(); areas = set()
    for _, us, ms, _ in evs:
        for u in us:
            areas.add(u)
            for m in ms: pos.add((u, m))
    allev = {}
    for _, us, ms, _ in EV:
        for u in us: allev.setdefault(u, []).extend(ms)
    rows = []
    for u in areas:
        for m in ALLM:
            r = R.get((u, m))
            if r is None: continue
            if (u, m) in pos: rows.append((m[:4], r[0], r[1], True))
            elif mdist(m, allev[u]) > 6: rows.append((m[:4], r[0], r[1], False))
    yrs = sorted({r[0] for r in rows}); byy = {y: [r for r in rows if r[0] == y] for y in yrs}
    def met(rs):
        s = np.array([r[1] for r in rs]); l = np.array([r[2] for r in rs]); y = np.array([r[3] for r in rs])
        return auc(s, y), float((l[y] >= 1).mean()) if y.any() else np.nan, float((l[~y] >= 1).mean()) if (~y).any() else np.nan, float((l[y] >= 2).mean()) if y.any() else np.nan
    base = met(rows); bs = [met([r for y in rng.choice(yrs, len(yrs)) for r in byy[y]]) for _ in range(B)]
    per = []
    for name, us, ms, indep in evs:
        ev = [R.get((u, m)) for u in us for m in ms]; ev = [r for r in ev if r is not None]
        per.append(dict(event=name, tehsilMonths=len(ev), shareMonitorPlus=round(float(np.mean([r[1] >= 1 for r in ev])), 3) if ev else None,
                        shareWatchPlus=round(float(np.mean([r[1] >= 2 for r in ev])), 3) if ev else None, meanScore=round(float(np.mean([r[0] for r in ev])), 1) if ev else None))
    return dict(n=len(rows), positives=int(sum(r[3] for r in rows)), auc=round(base[0], 3), auc_ci=ci([b[0] for b in bs]),
                hitRateMonitorPlus=round(base[1], 3), hit_ci=ci([b[1] for b in bs]), falseAlarmMonitorPlus=round(base[2], 3), fa_ci=ci([b[2] for b in bs]),
                hitRateWatchPlus=round(base[3], 3), perEvent=per)
OUTJ['D2_episodes'] = dict(truth='documented drought declarations (NDMA/PDMA, provincial); PARTLY DEPENDENT on rain deficits (PMD / GTS gauges also in CHIRPS)',
                           independentEventsE1toE5=d2(False), withE6=d2(True))

# ================= D3 soil indicator vs province VHI ; crops vs yields
PROV = {'Balochistan': 2, 'Khyber Pakhtunkhwa': 5, 'Punjab': 7, 'Sindh': 8}
VHI = {}
for pv, pid in PROV.items():
    acc = {}
    for l in open(os.path.join(RAW, 'vhp_admin', 'PAK_%d.txt' % pid)):
        l = l.strip().replace('<tt><pre>', '')
        if not re.match(r'^\d{4},\s*\d+,', l): continue
        r = [x.strip() for x in l.rstrip(',').split(',')]; y, w, v = int(r[0]), int(r[1]), float(r[6])
        if v < 0: continue
        d = dt.date(y, 1, 1) + dt.timedelta(days=7 * (w - 1) + 3); acc.setdefault('%04d.%02d' % (d.year, d.month), []).append(v)
    for k, v in acc.items(): VHI[(pv, k)] = float(np.mean(v))
rows3 = []
for pv in PROV:
    us = [u for u in UID if u.split('|')[0] == pv]
    for m in ALLM:
        if (pv, m) not in VHI: continue
        ss = [R.get((u, m)) for u in us]; ss = [r[3] for r in ss if r is not None and r[3] is not None]
        if len(ss) < 3: continue
        rows3.append((m[:4], pv, float(np.mean(ss)), VHI[(pv, m)] < 40, VHI[(pv, m)]))
yrs3 = sorted({r[0] for r in rows3}); byy3 = {y: [r for r in rows3 if r[0] == y] for y in yrs3}
def d3(rs): return auc([r[2] for r in rs], [r[3] for r in rs]), float(stats.spearmanr([r[2] for r in rs], [-r[4] for r in rs])[0])
b3 = [d3([r for y in rng.choice(yrs3, len(yrs3)) for r in byy3[y]]) for _ in range(B)]
D3 = d3(rows3)
per_prov = {}
for pv in PROV:
    rs = [r for r in rows3 if r[1] == pv]; yy = sorted({r[0] for r in rs}); by = {y: [r for r in rs if r[0] == y] for y in yy}
    bb = [d3([r for y in rng.choice(yy, len(yy)) for r in by[y]])[0] for _ in range(B)]
    per_prov[pv] = dict(n=len(rs), vhiDroughtMonths=int(sum(r[3] for r in rs)), auc=round(d3(rs)[0], 3), auc_ci=ci(bb))
# crops (VHI) vs yields: Punjab province VHI Feb-Mar mean vs the Punjab district rain-fed yield anomalies, per season
sv = []
for s in seasons:
    y1 = int(s[:4]) + 1; v = [VHI.get(('Punjab', '%04d.%02d' % (y1, k))) for k in (2, 3)]; v = [x for x in v if x is not None]
    an = [r['anom'] for r in recs if r['season'] == s]
    if v and an: sv.append((s, float(np.mean(v)), float(np.mean(an))))
def rho_s(rs): return float(stats.spearmanr([r[1] for r in rs], [r[2] for r in rs])[0])
bsv = [rho_s([sv[i] for i in rng.integers(0, len(sv), len(sv))]) for _ in range(B)]
OUTJ['D3_agricultural'] = dict(
    soilVsVhi=dict(truth='NOAA STAR VHI province cropland monthly mean < 40 (Kogan); independent of the soil indicator, NOT of the crops indicator',
                   n=len(rows3), vhiDroughtMonths=int(sum(r[3] for r in rows3)), auc=round(D3[0], 3), auc_ci=ci([b[0] for b in b3]),
                   spearmanSoilScoreVsLowVhi=round(D3[1], 3), spearman_ci=ci([b[1] for b in b3]), perProvince=per_prov,
                   vhiBelow40Share=round(float(np.mean([r[3] for r in rows3])), 3), primaryPass=bool(ci([b[0] for b in b3])[0] > 0.5)),
    cropsVsYield=dict(truth='Punjab rain-fed wheat (district mean anomaly per season) vs Punjab province cropland VHI Feb-Mar (province scale; served VHI is tehsil 4 km)',
                      seasons=len(sv), spearman=round(rho_s(sv), 3), spearman_ci=ci(bsv), rows=sv))

# ================= D4 hydrological
OUTJ['D4_hydrological'] = dict(tested=False, why='no observed river-flow, reservoir or snow record with >= 10 years is in the cloud or laptop folders read (IRSA daily drops start 5 May 2026; GloFAS is a model and is the served input itself; GRACE needs an Earthdata login)')
json.dump(OUTJ, open(OUT, 'w'), indent=1, default=float)
o2 = json.loads(json.dumps(OUTJ, default=float)); o2['D3_agricultural']['cropsVsYield'].pop('rows', None)
print(json.dumps(o2, indent=1))
