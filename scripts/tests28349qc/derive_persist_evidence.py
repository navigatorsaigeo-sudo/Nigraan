"""v91.17.283.49 (1.0.10, change set "station QC frozen check") - re-measurement of the frozen / persistence run limits on the held MACH
database record (one file per UTC day, obs_YYYYMMDD.csv: stationKey,time,source,temperatureC,dewPointC,humidityPct,pressureHpa,...).

Method = the derivation of stuckscreen.mjs FROZEN_MIN (scripts/tests272/stuck_screen.py derive()), on distinct reading timestamps only
(duplicate station x time rows dropped) and with runs split at gaps over 90 min (MAXGAP):
  population  the clean feeds ('wu_api', 'ecowitt'), minus every station whose humidity / dew point ever fails the fleet's range rules
              (Td > 40 or < -35 C, RH > 100 or <= 2 %) in the window - the same exclusion as v91.17.272
  run         consecutive distinct readings of one station carrying the same value of the variable (exact, at the sensor's resolution)
  statistic   99th and 99.9th percentile of run length, all hours and runs ending 15:00-05:59 PKT (the calm evening and night)
Also reported (evidence for the 2 Nov 2026 evening):
  the whole-record runs (T, Td, RH, P identical) of the same population,
  the share of 'wu' readings that differ from the station's previous reading, by PKT hour, on the last day given.
usage: python -I derive_persist_evidence.py <db folder> [<db folder> ...] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
       (a later folder's file of the same day replaces an earlier one; read-only on every folder)"""
import sys, os, glob, json
import numpy as np
import pandas as pd


def args(a):
    o = {'dirs': [], 'from': None, 'to': None}; i = 0
    while i < len(a):
        if a[i] in ('--from', '--to'): o[a[i][2:]] = a[i + 1]; i += 2
        else: o['dirs'].append(a[i]); i += 1
    return o


def load(dirs):
    files = {}
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, 'obs_2*.csv'))): files[os.path.basename(f)] = f
    d = pd.concat([pd.read_csv(f) for f in files.values()])
    d['t'] = pd.to_datetime(d.time, format='ISO8601'); d['ms'] = (d.t - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() * 1000
    d = d[d.temperatureC.notna()].drop_duplicates(['stationKey', 'ms']).sort_values(['stationKey', 'ms'])
    d['pkth'] = (d.t.dt.hour + 5) % 24
    return d, len(files)


def runs(c, cols):
    sp, ev = [], []
    for _, s in c.groupby('stationKey'):
        V = list(zip(*[s[x].values for x in cols])); ms = s.ms.values; h = s.pkth.values; a = 0
        for i in range(1, len(V) + 1):
            if i == len(V) or V[i] != V[a] or (ms[i] - ms[i - 1]) / 6e4 > 90:
                if not any(isinstance(x, float) and np.isnan(x) for x in V[a]):
                    x = (ms[i - 1] - ms[a]) / 6e4; sp.append(x)
                    if h[i - 1] >= 15 or h[i - 1] < 6: ev.append(x)
                a = i
    S, E = pd.Series(sp, dtype=float), pd.Series(ev, dtype=float)
    r = lambda x: round(float(x), 1)
    return {'runs': len(S), 'all_q99_min': r(S.quantile(.99)), 'all_q999_min': r(S.quantile(.999)),
            'evening_night_runs': len(E), 'evening_night_q99_min': r(E.quantile(.99)), 'evening_night_q999_min': r(E.quantile(.999))}


def main():
    o = args(sys.argv[1:]); d, nf = load(o['dirs'])
    if o['from']: d = d[d.t >= pd.Timestamp(o['from'], tz='UTC')]
    if o['to']: d = d[d.t < pd.Timestamp(o['to'], tz='UTC') + pd.Timedelta(days=1)]
    bad = sorted(set(d[(d.dewPointC > 40) | (d.dewPointC < -35) | (d.humidityPct > 100) | (d.humidityPct <= 2)].stationKey))
    c = d[d.source.isin(['wu_api', 'ecowitt']) & ~d.stationKey.isin(bad)]
    out = {'files': nf, 'window': [str(d.t.min()), str(d.t.max())], 'stations': int(c.stationKey.nunique()), 'leftOut': bad}
    for v, col in [('T', 'temperatureC'), ('Td', 'dewPointC'), ('P', 'pressureHpa')]: out[v] = runs(c, [col])
    out['record'] = runs(c, ['temperatureC', 'dewPointC', 'humidityPct', 'pressureHpa'])
    last = d[d.t.dt.date == d.t.max().date()]; w = last[last.source == 'wu'].copy()
    w['sig'] = w[['temperatureC', 'dewPointC', 'humidityPct', 'pressureHpa']].apply(lambda r: '|'.join('-' if pd.isna(x) else repr(float(x)) for x in r), axis=1)   # a missing value is '-' (NaN never compares equal)
    w['chg'] = w.groupby('stationKey').sig.shift() != w.sig; w = w[w.groupby('stationKey').cumcount() > 0]
    out['wu_changed_share_by_pkt_hour_last_day'] = {int(h): round(float(g.chg.mean()), 2) for h, g in w.groupby('pkth')}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
