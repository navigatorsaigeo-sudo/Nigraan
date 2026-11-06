#!/usr/bin/env python3
"""writes data/river-cal.json from the held-out results (rivercal.py, rivercal_score.py A/B/C, rivercal_stale.py) and the final
seasonal quantile-mapping fit (variant C, all seasons) for the reaches whose FLOW passed the gate. Nothing is typed by hand:
which reaches carry what comes only from the gate files."""
import os, sys, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rivercal import REACH, M3, UP, obs, limits, fit_lag, fit_map, blocks_boot, model_series, SERVED

W = os.environ.get('RIVERCAL_WORK') or os.path.dirname(os.path.abspath(__file__)); APP = os.environ.get('RIVERCAL_APP') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')
D = pd.read_csv(os.path.join(W, 'rivercal_heldout_days.csv.gz'), parse_dates=['date'])


def flow_gate(R, col):
    d = (R.raw - R.obs).abs() - (R[col] - R.obs).abs(); w1 = R.season < 2026
    a = blocks_boot(d[w1].values, R.date[w1], 2000); b = blocks_boot(d[~w1].values, R.date[~w1], 2000)
    worse = []
    for mo, g in R.groupby(R.date.dt.to_period('M')):
        if len(g) < 10: continue
        dd = (g.raw - g.obs).abs() - (g[col] - g.obs).abs(); bb = blocks_boot(dd.values, g.date, 1000)
        if bb[2] < 0: worse.append(str(mo))
    return dict(w1=[round(x, 1) for x in a], w2=[round(x, 1) for x in b], monthsWorse=worse,
                maeRaw=round(float((R.raw - R.obs).abs().mean()), 1), maeCal=round(float((R[col] - R.obs).abs().mean()), 1),
                passes=bool(a[1] > 0 and b[0] >= 0 and not worse))


def main():
    gateL = {v: {r['reach']: r for r in json.load(open(os.path.join(W, 'rivercal_gate%s.json' % v)))} for v in ['', 'B', 'C']}
    stale = json.load(open(os.path.join(W, 'rivercal_stale.json')))
    fitpath = os.environ.get('RIVERCAL_FIT'); G = model_series(fitpath); legacy = bool(fitpath) and 'irsa' in os.path.basename(fitpath)
    O = obs(); LIM = limits()
    reaches = {}
    for rid, R in D.groupby('reach'):
        fg = flow_gate(R.reset_index(drop=True), 'calC')
        lv = gateL['C'][rid]
        # the spec gate for the flow as a whole: MAE (above), seasonal peak timing and flood-class days not worse
        pr, pc = lv['peak_raw'] or [], lv['peak_cal'] or []
        fg['peakDaysRaw'], fg['peakDaysCal'] = pr, pc
        fg['floodDayLevelGain'] = lv['imp_flood']; fg['podServed'], fg['podCal'], fg['farCal'] = lv['pod_srv'], lv['pod_cal'], lv['far_cal']
        peak_ok = not (pr and pc and np.mean(pc) > np.mean(pr) + 1)
        flood_ok = not (lv['imp_flood'] and lv['imp_flood'][2] is not None and lv['imp_flood'][2] < 0)
        if not peak_ok: fg['why'] = (fg.get('why') or []) + ['peak timing worse']
        if not flood_ok: fg['why'] = (fg.get('why') or []) + ['flood days worse']
        fg['passes'] = bool(fg['passes'] and peak_ok and flood_ok)
        reaches[rid] = dict(levelGate=dict(passes=bool(lv['passes']), why=lv['why'], gainW1=lv['imp_w1'], gainW2=lv['imp_w2'],
                                           exactServed=lv['exact_srv'], exactCal=lv['exact_cal'], floodDays=lv['flood_days']),
                            levelGateOtherVariants={'quantileMap': bool(gateL[''][rid]['passes']), 'logLinear': bool(gateL['B'][rid]['passes'])},
                            flowGate=fg)
        st = stale.get(rid)
        if st:
            t = st['table']; ok = [x['gain'][1] > 0 and (x['gain2026'][0] or 0) >= 0 for x in t]; age = None
            for i in range(len(ok)):
                if all(ok[i:]): age = t[i]['age']; break
            reaches[rid]['staleSheet'] = dict(switchAgeDays=age, gainByAge=[[x['age'], round(x['gain'][0], 3), round(x['gain'][1], 3), round(x['gain'][2], 3)] for x in t])
        if fg['passes'] and legacy and rid in ('balloki', 'sidhnai'):
            reaches[rid]['flowGate']['servedCellDiffers'] = True   # the served reach cell is not the gauge cell: nothing served
            continue
        if fg['passes']:
            m_k = G[rid] / M3; g = O[O.st == rid].set_index('date').sort_index()
            L = fit_lag(m_k, g.index, g.inflow.values); mf = m_k.shift(-L).reindex(g.index); ok = mf.notna().values
            mqA, oqA = fit_map(mf.values[ok], g.inflow.values[ok])
            doy = g.index.dayofyear.values; bins = []
            for b in range(24):
                mo, half = b // 2 + 1, b % 2
                c = pd.Timestamp(2025, mo, 8 if half == 0 else 23).dayofyear
                dd = np.abs(((doy - c) + 182) % 365 - 182); w = ok & (dd <= 30)
                if w.sum() >= 40:
                    mq, oq = fit_map(mf.values[w], g.inflow.values[w]); bins.append(dict(n=int(w.sum()), m=[round(float(v) * M3, 1) for v in mq], o=[round(float(v), 2) for v in oq]))
                else:
                    bins.append(None)
            reaches[rid]['flow'] = dict(lagDays=int(L), unit='thousand cusecs', all=dict(n=int(ok.sum()), m=[round(float(v) * M3, 1) for v in mqA], o=[round(float(v), 2) for v in oqA]),
                                        halfMonth=bins, seasons=sorted(int(s) for s in g.season.unique()),
                                        testedBins=sorted({int((d.month - 1) * 2 + (1 if d.day > 15 else 0)) for d in R.date}),
                                        testedBinsNote='half-month bins (0 = 1-15 Jan) that held-out days covered; no value is served outside them')
    out = dict(
        version='rcal-91.17.283.10', modelFrame='provider-api-gmt', modelSeries=os.path.basename(fitpath or SERVED), built=pd.Timestamp.now(tz='Asia/Karachi').strftime('%Y-%m-%d %H:%M PKT'),
        what='River model flow checked against the daily river-gauge record (internal). Map level: unchanged everywhere (no calibration beat the served level on held-out seasons). '
             'Gauge panel: when the daily river sheet stops, a gauge switches from its last reading to the reach model level only from the sheet age at which the model level matched the gauge class better on held-out data. '
             'Operator only: a gauge-equivalent model flow where the calibrated flow beat the raw model flow on held-out seasons.',
        method='GloFAS v4 river flow as served (provider API at the snapped reach cells, timezone GMT as served from v283.10; was the station file glofas_irsa_daily.csv.gz) vs gauge inflow 2024-06-16..2025-10-15 and 2026-05-05..10-13; '
               'lag -2..+2 d in the served frame by Spearman; empirical quantile mapping (99 quantiles) inside a +-30-day window of the day of year (all fit days where the window holds < 40 pairs); '
               'leave one season out; W1 = held-out 2024+2025, W2 = held-out 2026 (fit 2024-25). 7-day block bootstrap 95 % intervals. Three calibration forms were tested '
               '(quantile map, log-linear, seasonal quantile map); the seasonal quantile map is served because it is the only one whose flow passed on more than one reach.',
        scope='lead 0 only: from 2023-08 the served series is the provider archive of the first forecast day, so the test is at the shortest lead; later forecast days add the weather-forecast error to both the raw and the calibrated flow.',
        script='_work/rivercal.py, rivercal_score.py, rivercal_stale.py, rivercal_build.py (v91.17.274 RIVER)',
        reaches=reaches)
    # v283.10: the served-series refit did NOT pass R5 against the current table applied to the served flow (data/evidence/glofas28310/
    # refit_compare.json), so a rebuild writes a candidate next to the held-out files; data/river-cal.json is replaced only with
    # RIVERCAL_WRITE=1 after scripts/tests28310/glofas/refit_compare.py says the candidate is no worse.
    dest = os.path.join(APP, 'river-cal.json') if os.environ.get('RIVERCAL_WRITE') == '1' else os.path.join(W, 'river-cal.candidate.json')
    json.dump(out, open(dest, 'w'), separators=(',', ':')); print('wrote', dest)
    print({k: (v['levelGate']['passes'], v['flowGate']['passes'], 'flow' in v, (v.get('staleSheet') or {}).get('switchAgeDays')) for k, v in reaches.items()})


if __name__ == '__main__':
    main()
