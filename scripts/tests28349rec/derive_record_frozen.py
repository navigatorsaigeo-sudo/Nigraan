"""v91.17.283.49 (NIGRAAN 1.0.10) - the limit of the WHOLE-RECORD FROZEN check (obsqc.mjs recordFrozen) and of the coarse-grid pressure
persistence (obsqc.mjs persist.P_grid), measured on the held MACH database record (obs_YYYYMMDD.csv, one file per UTC day; read only).

Whole record: the run method of scripts/tests28349qc/derive_persist_evidence.py (stuckscreen.mjs FROZEN_MIN): distinct reading timestamps
only; a run = consecutive readings of one station whose temperature, dew point, humidity AND pressure are all reported and all identical;
runs split at gaps over 90 min; population = the clean feeds (wu_api, ecowitt) minus every station whose humidity / dew point fails the
fleet's range rules in the window. Statistic: 99.9th percentile of run length (minutes), all hours and runs ending 15:00-05:59 PKT, per
window. The LIMIT = the largest of those percentiles (the most lenient window, so a clean station is not flagged where any window says
its run is genuine).

Coarse-grid pressure: stations whose pressure is reported on the 0.01 inHg grid (0.3386 hPa; the 'qm' consoles) - a pressure
grid is recognised when >= 95 % of the station's pressure values sit within 0.006 hPa of a multiple of 0.33864 hPa and the station has at
least 500 readings. Their own pressure runs (same run rule, while the temperature reading moves = a live console) give the 99.9th
percentile of genuine unchanged-pressure runs on that grid; reported with the number of runs so the decision on thin evidence is visible.

usage: python3 -I derive_record_frozen.py <db folder> [<db folder> ...]   (a later folder's file of the same day replaces an earlier one)"""
import sys, os, glob, json
import numpy as np
import pandas as pd

INHG = 33.8639 / 100.0   # hPa per 0.01 inHg


def load(dirs):
    files = {}
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, 'obs_2*.csv'))): files[os.path.basename(f)] = f
    d = pd.concat([pd.read_csv(f) for f in files.values()])
    d['t'] = pd.to_datetime(d.time, format='ISO8601'); d['ms'] = (d.t - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() * 1000
    d = d[d.temperatureC.notna()].drop_duplicates(['stationKey', 'ms']).sort_values(['stationKey', 'ms'])
    d['pkth'] = (d.t.dt.hour + 5) % 24
    return d, sorted(files)


def runs(c, cols, need_all=True):
    sp, ev, per = [], [], {}
    for k, s in c.groupby('stationKey'):
        V = list(zip(*[s[x].values for x in cols])); ms = s.ms.values; h = s.pkth.values; a = 0
        for i in range(1, len(V) + 1):
            if i == len(V) or V[i] != V[a] or (ms[i] - ms[i - 1]) / 6e4 > 90:
                if not any(isinstance(x, float) and np.isnan(x) for x in V[a]):
                    x = (ms[i - 1] - ms[a]) / 6e4; sp.append(x); per.setdefault(k, []).append(x)
                    if h[i - 1] >= 15 or h[i - 1] < 6: ev.append(x)
                a = i
    S, E = pd.Series(sp, dtype=float), pd.Series(ev, dtype=float)
    r = lambda x: None if pd.isna(x) else round(float(x), 1)
    return {'runs': len(S), 'all_q99_min': r(S.quantile(.99)), 'all_q999_min': r(S.quantile(.999)), 'all_max_min': r(S.max()),
            'evening_night_runs': len(E), 'evening_night_q99_min': r(E.quantile(.99)), 'evening_night_q999_min': r(E.quantile(.999))}, per


def window(d, a, b):
    return d[(d.t >= pd.Timestamp(a, tz='UTC')) & (d.t < pd.Timestamp(b, tz='UTC') + pd.Timedelta(days=1))]


def main():
    dirs = sys.argv[1:]; d, files = load(dirs)
    REC = ['temperatureC', 'dewPointC', 'humidityPct', 'pressureHpa']
    W = [('6 Oct - 2 Nov 2026', '2026-10-06', '2026-11-02'), ('6 - 16 Oct 2026', '2026-10-06', '2026-10-16'), ('20 Oct - 2 Nov 2026', '2026-10-20', '2026-11-02')]
    out = {'files': [files[0], files[-1], len(files)], 'record': {}, 'pgrid': {}}
    for name, a, b in W:
        x = window(d, a, b)
        bad = sorted(set(x[(x.dewPointC > 40) | (x.dewPointC < -35) | (x.humidityPct > 100) | (x.humidityPct <= 2)].stationKey))
        c = x[x.source.isin(['wu_api', 'ecowitt']) & ~x.stationKey.isin(bad)]
        st, _ = runs(c, REC); st['stations'] = int(c[c[REC].notna().all(axis=1)].stationKey.nunique()); out['record'][name] = st
        if name.startswith('6 Oct - 2'): out['record_leftOut'] = bad
    q = [v[k] for v in out['record'].values() for k in ('all_q999_min', 'evening_night_q999_min') if v[k] is not None]
    out['record_limit_min'] = max(q)
    # pressure grid stations (0.01 inHg)
    g = {}
    for k, s in d[d.pressureHpa.notna()].groupby('stationKey'):
        p = s.pressureHpa.values; n = len(p)
        if n < 500: continue
        off = np.abs(p / INHG - np.round(p / INHG)) * INHG
        if (off <= 0.006).mean() >= 0.95: g[k] = {'n': int(n), 'source': ','.join(sorted(set(s.source))), 'onGrid': round(float((off <= 0.006).mean()), 3)}
    out['pgrid']['stations'] = g
    if g:
        c = d[d.stationKey.isin(list(g))]
        st, per = runs(c, ['pressureHpa']); out['pgrid']['P'] = st
        out['pgrid']['perStation'] = {k: {'runs': len(v), 'q999_min': round(float(np.quantile(v, .999)), 1), 'max_min': round(float(max(v)), 1)} for k, v in per.items()}
        # whole-record runs at the grid consoles (the record check must not flag them)
        st2, _ = runs(c, REC); out['pgrid']['record'] = st2
    # the clean population's own 0.1 hPa pressure runs, for comparison
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
