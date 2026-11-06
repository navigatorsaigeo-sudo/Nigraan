#!/usr/bin/env python3
"""Score the ECMWF 0.1 deg shadow against MACH observations and apply the switch rule (v91.17.283.2).

Input   : the shadow files data/ecmwf010-shadow/<YYYY-MM>/<run>.csv written by server/api/ecmwf010.mjs after each ECMWF run: at every
          MACH station and future valid time, ecmwf010 (e_*) and the forecast NIGRAAN served at that moment (c_*: the fleet pairs'
          cache: c_t2m_start = the served start, c_t2m_served = the served temperature up to the live layer, c_d2m, c_wind_kmh,
          c_tp_mm = the served start's hourly rain summed over the same interval).
          MACH observations (--obs, repeatable, first folder wins per station and minute): NIGRAAN's copies of LAMHA's
          data/mach/db/obs_YYYYMMDD.csv (stationKey,time,temperatureC,dewPointC,windSpeedKmh,precipTotalMm,...) and
          station-lake/archive/fleet/db/mach_db_YYYY-MM.csv (time,station_key,temperature_c,dew_point_c,...).
Pairing : instantaneous variables: the reading nearest the valid time within 10 min. Rain over the step interval: the sum of the
          positive steps of the station's running total (precipTotalMm; a drop is a reset and counts the new value), only when
          readings exist within 15 min of both ends and no gap inside is over 60 min. Stations the fleet registry excludes
          v91.17.283.14: no station is left out; every observed value is judged by NIGRAAN's value-level quality control
          (server/api/obsqc.mjs via scripts/lib/obsqc_truth.py) and only failing values are not scored. Wind compares 10 m model wind with the station's own anemometer height.
Metrics : for each variable, on the SAME station-times for both sources (paired): MAE and bias (forecast - observed), overall, by
          zone (mos.zoneOfPoint) and by lead (0-24, 24-48, 48-72 h of the ECMWF run).
Rule    : v91.17.283.8 (audit 14; the decision rule of 25 Oct 2026) THE FULL SERVED CHAIN. Serving substitutes the 9 km values into the
          provider answer BEFORE the correction chain, so the candidate is the value that would be served: the 9 km values substituted
          where serving substitutes them, then the existing corrections (fleet.mjs: c_<var>_served_e), scored against the value served now
          (c_<var>_served), on the same station-times. A variable passes only if ALL of:
            - at least --min-pairs pairs (100), --min-days valid days (3) and --min-runs ECMWF runs (3);
            - paired MAE of the candidate chain <= paired MAE of the served chain, overall;
            - NO ZONE WORSE: in every zone that holds shadow pairs, at least --min-stratum pairs (50) and candidate MAE <= served MAE;
            - NO LEAD WORSE: in every lead bucket (0-24, 24-48, 48-72 h) that holds pairs, at least --min-stratum pairs and not worse.
          Rain (tp) has no full-chain column yet: it is reported against the served start and never passes.
          The raw 9 km value against the served value (the v283.2 comparison) is still reported (raw_vs_served), never decides.
Output  : --out (data/ecmwf010-score.json): metrics and decision[var] = { pass, why, ... }. Standard library only.
"""
import argparse, csv, datetime as dt, glob, json, os, sys
from collections import defaultdict

VARS = {  # name: (candidate column = the served chain with the 9 km values substituted, served column, obs field, reference label)
    't2m': ('c_t2m_served_e', 'c_t2m_served', 'T', 'served temperature (up to the live layer) against the same chain with the 9 km values substituted'),
    'd2m': ('c_d2m_served_e', 'c_d2m_served', 'Td', 'served dew point against the same chain with the 9 km values substituted'),
    'wind10': ('c_wind_served_e', 'c_wind_served', 'W', 'served 10 m wind (km/h) against the same chain with the 9 km values substituted'),
    'tp': ('e_tp_mm', 'c_tp_mm', 'R', 'raw 9 km rain against the served start over the interval (mm): no full-chain column, never passes'),
}
EXTRA = {'t2m_raw_vs_served': ('e_t2m', 'c_t2m_served', 'T'), 't2m_raw_vs_start': ('e_t2m', 'c_t2m_start', 'T')}
FULL_CHAIN = ('t2m', 'd2m', 'wind10')
LEADS = ((0, 24), (24, 48), (48, 72), (72, 1000))
HDR = {'key': ('stationKey', 'station_key', 'key'), 'time': ('time', 'time_utc', 'timestamp'), 'T': ('temperatureC', 'temperature_c', 'temp_c'),
       'Td': ('dewPointC', 'dew_point_c', 'dew_c'), 'W': ('windSpeedKmh', 'wind_speed_kmh', 'wind_kmh'), 'P': ('precipTotalMm', 'precip_total_mm')}


def ms(s):
    try:
        s = s.strip().replace('Z', '+00:00')
        t = dt.datetime.fromisoformat(s)
        if t.tzinfo is None:
            t = t.replace(tzinfo=dt.timezone.utc)
        return int(t.timestamp())
    except Exception:
        return None


def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except Exception:
        return None


def load_obs(dirs, t_from, t_to):
    obs = defaultdict(dict)   # key -> {epoch_s: (T, Td, W, P)}
    owner = {}
    for d in dirs:
        if not os.path.isdir(d):
            continue
        files = sorted(glob.glob(os.path.join(d, 'obs_*.csv')) + glob.glob(os.path.join(d, 'mach_db_*.csv')))
        for f in files:
            b = os.path.basename(f)
            day = b[4:12] if b.startswith('obs_') else None
            if day and not (t_from - 86400 <= int(dt.datetime.strptime(day, '%Y%m%d').replace(tzinfo=dt.timezone.utc).timestamp()) <= t_to + 86400):
                continue
            if b.startswith('mach_db_'):
                m = b[8:15]
                m0 = int(dt.datetime.strptime(m + '-01', '%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp())
                if m0 > t_to + 86400 or m0 + 32 * 86400 < t_from - 86400:
                    continue
            with open(f, 'r', encoding='utf-8', errors='replace', newline='') as h:
                r = csv.reader(h)
                try:
                    head = next(r)
                except StopIteration:
                    continue
                ix = {k: next((head.index(n) for n in names if n in head), -1) for k, names in HDR.items()}
                if ix['key'] < 0 or ix['time'] < 0:
                    continue
                for row in r:
                    if len(row) != len(head):
                        continue
                    t = ms(row[ix['time']])
                    if t is None or t < t_from - 7200 or t > t_to + 7200:
                        continue
                    k = row[ix['key']].strip()
                    if owner.setdefault(k, d) != d:
                        continue   # the first folder that holds a station is its source
                    g = lambda n: num(row[ix[n]]) if ix[n] >= 0 else None
                    obs[k].setdefault(t, (g('T'), g('Td'), g('W'), g('P')))
    out = {}
    for k, m in obs.items():
        ts = sorted(m)
        out[k] = (ts, [m[t] for t in ts])
    return out


def nearest(ser, t, field, tol):
    import bisect
    ts, vals = ser
    i = bisect.bisect_left(ts, t)
    best = None
    for j in (i - 1, i):
        if 0 <= j < len(ts) and abs(ts[j] - t) <= tol and vals[j][field] is not None:
            if best is None or abs(ts[j] - t) < abs(ts[best] - t):
                best = j
    return None if best is None else vals[best][field]


def rain(ser, t0, t1):
    import bisect
    ts, vals = ser
    i0 = bisect.bisect_left(ts, t0 - 900); i1 = bisect.bisect_right(ts, t1 + 900)
    pts = [(ts[j], vals[j][3]) for j in range(i0, i1) if vals[j][3] is not None]
    if len(pts) < 2 or abs(pts[0][0] - t0) > 900 or abs(pts[-1][0] - t1) > 900:
        return None
    s = 0.0
    for (ta, a), (tb, b) in zip(pts, pts[1:]):
        if tb - ta > 3600:
            return None
        s += (b - a) if b >= a else b
    return s


def stats(pairs):
    if not pairs:
        return None
    n = len(pairs)
    e = [p[0] - p[2] for p in pairs]; c = [p[1] - p[2] for p in pairs]
    return {'n': n, 'ecmwf010': {'mae': round(sum(abs(x) for x in e) / n, 3), 'bias': round(sum(e) / n, 3)},
            'served': {'mae': round(sum(abs(x) for x in c) / n, 3), 'bias': round(sum(c) / n, 3)}}


def qc_obs(O, app):
    """v91.17.283.14 (owner decision 24 Oct 2026: a wrong value is dropped, never a station): every station's readings through NIGRAAN's one
    value-level quality control (server/api/obsqc.mjs via scripts/lib/obsqc_truth.py); the series becomes the hourly values with each
    failing variable set to None. No station is left out."""
    import pandas as pd
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib')); import obsqc_truth as QT
    reg = json.load(open(os.path.join(app, 'data', 'mach-fleet-stations.json'), encoding='utf-8'))['stations']
    st = pd.DataFrame([{'pid': 'mach:' + s['key'], 'lat': s.get('lat'), 'lon': s.get('lon'), 'elev': None, 'zone': None} for s in reg if s.get('lat') is not None])
    rows = [('mach:' + k, t, *v) for k, (ts, vals) in O.items() for t, v in zip(ts, vals)]
    if not rows:
        return O, {}
    df = pd.DataFrame(rows, columns=['pid', 't', 'T', 'Td', 'W', 'P']); df['time'] = pd.to_datetime(df.t, unit='s', utc=True)
    F = QT.qc_frame(df, st, app, nearest_min=30)
    out = {}
    for pid, g in F.groupby('pid'):
        by = {}
        for r in g.itertuples():
            t = int(pd.Timestamp(r.time_utc).timestamp()); a = by.setdefault(t, {})
            a[r.var] = r.value if r._5 == 1 else None
        ts = sorted(by); out[pid[5:]] = (ts, [(by[t].get('T'), by[t].get('Td'), by[t].get('W'), by[t].get('P')) for t in ts])
    return out, F.attrs.get('counts', {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app', default=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
    ap.add_argument('--shadow', default=None)
    ap.add_argument('--obs', action='append', default=[])
    ap.add_argument('--out', default=None)
    ap.add_argument('--min-pairs', type=int, default=100)
    ap.add_argument('--min-days', type=int, default=3)
    ap.add_argument('--min-runs', type=int, default=3)
    ap.add_argument('--min-stratum', type=int, default=50)
    a = ap.parse_args()
    shadow = a.shadow or os.path.join(a.app, 'data', 'ecmwf010-shadow')
    out = a.out or os.path.join(a.app, 'data', 'ecmwf010-score.json')
    rows = []
    for f in sorted(glob.glob(os.path.join(shadow, '*', '*.csv'))):
        with open(f, 'r', encoding='utf-8', newline='') as h:
            rows.extend(csv.DictReader(h))
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    rows = [r for r in rows if (ms(r['valid_utc']) or 1e18) <= now - 1800]   # v91.17.283.14: no station left out; the observations are judged value by value below
    res = {'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'script': 'scripts/ecmwf/score_shadow.py',
           'rule': ('25 Oct 2026 rule (v91.17.283.8, full served chain): serve ecmwf010 for a variable only if the served chain WITH the 9 km values substituted '
                    'has paired MAE at MACH stations <= the served chain, overall and in every zone and every lead bucket that holds pairs (no zone or lead worse, '
                    '>= %d pairs in each), over >= %d valid days and >= %d ECMWF runs (and >= %d pairs); rain never passes (no full-chain column)') % (a.min_stratum, a.min_days, a.min_runs, a.min_pairs),
           'shadowRows': len(rows), 'obsFolders': a.obs, 'metrics': {}, 'decision': {}}
    if not rows:
        res['decision'] = {v: {'pass': False, 'why': 'no verifiable shadow rows yet'} for v in VARS}
    else:
        t_from = min(ms(r['valid_utc']) for r in rows) - 7200; t_to = max(ms(r['valid_utc']) for r in rows) + 600
        O, res['obsQc'] = qc_obs(load_obs(a.obs, t_from, t_to), a.app)
        res['obsStations'] = len(O)
        P = {v: [] for v in list(VARS) + list(EXTRA)}
        for r in rows:
            ser = O.get(r['key'])
            if not ser:
                continue
            t = ms(r['valid_utc']); lead = int(float(r['lead_h'])); iv = int(float(r['interval_h'] or 0))
            meta = (r['run_utc'], r['valid_utc'][:10], r.get('zone') or 'unzoned', lead, r['key'])
            for v, (ec, cc, of, _) in list(VARS.items()) + [(k, (*x, None)) for k, x in EXTRA.items()]:
                if v in FULL_CHAIN and r.get('c_e_substituted') not in ('1', None) and r.get('c_e_substituted') != '':
                    continue
                e, c = num(r.get(ec)), num(r.get(cc))
                if e is None or c is None:
                    continue
                if of == 'R':
                    o = rain(ser, t - iv * 3600, t) if iv > 0 else None
                else:
                    o = nearest(ser, t, {'T': 0, 'Td': 1, 'W': 2}[of], 600)
                if o is None:
                    continue
                P[v].append((e, c, o) + meta)
        for v, pairs in P.items():
            m = {'all': stats(pairs), 'byZone': {}, 'byLead': {}, 'days': sorted({p[4] for p in pairs}), 'runs': sorted({p[3] for p in pairs}), 'stations': len({p[7] for p in pairs}),
                 'basis': 'candidate = ' + (VARS.get(v) or EXTRA.get(v))[0] + ', reference = ' + (VARS.get(v) or EXTRA.get(v))[1]}
            for z in sorted({p[5] for p in pairs}):
                m['byZone'][z] = stats([p for p in pairs if p[5] == z])
            for lo, hi in LEADS:
                s = stats([p for p in pairs if lo < p[6] <= hi])
                if s:
                    m['byLead']['%d-%d h' % (lo, hi)] = s
            res['metrics'][v] = m
        for v, (_, _, _, ref) in VARS.items():
            m = res['metrics'][v]; s = m['all']
            d = {'reference': ref, 'pairs': s['n'] if s else 0, 'days': len(m['days']), 'runs': len(m['runs']), 'stations': m['stations']}
            strata = [('zone ' + z, x) for z, x in m['byZone'].items()] + [('lead ' + k, x) for k, x in m['byLead'].items()]
            d['strata'] = {k: ({'n': x['n'], 'candidate': x['ecmwf010']['mae'], 'served': x['served']['mae']} if x else None) for k, x in strata}
            thin = [k for k, x in strata if x and x['n'] < a.min_stratum]
            worse = [k for k, x in strata if x and x['n'] >= a.min_stratum and x['ecmwf010']['mae'] > x['served']['mae']]
            if v not in FULL_CHAIN:
                d.update(pass_=False, why='no full-chain column for this variable: it is reported, never switched on')
            elif not s or s['n'] < a.min_pairs:
                d.update(pass_=False, why='too few pairs (%d < %d)' % (d['pairs'], a.min_pairs))
            elif d['days'] < a.min_days or d['runs'] < a.min_runs:
                d.update(pass_=False, why='needs >= %d days and >= %d runs (has %d days, %d runs)' % (a.min_days, a.min_runs, d['days'], d['runs']))
            elif s['ecmwf010']['mae'] > s['served']['mae']:
                d.update(pass_=False, why='full chain with ecmwf010 MAE %.3f > served MAE %.3f' % (s['ecmwf010']['mae'], s['served']['mae']))
            elif worse:
                d.update(pass_=False, why='worse in ' + ', '.join(worse) + ' (no zone or lead may be worse)')
            elif thin:
                d.update(pass_=False, why='too few pairs to show it is not worse in ' + ', '.join(thin) + ' (< %d each)' % a.min_stratum)
            else:
                d.update(pass_=True, why='full chain with ecmwf010 MAE %.3f <= served MAE %.3f, and not worse in any zone or lead' % (s['ecmwf010']['mae'], s['served']['mae']))
            d['pass'] = d.pop('pass_')
            res['decision'][v] = d
    tmp = out + '.tmp'
    with open(tmp, 'w', encoding='ascii') as o:
        json.dump(res, o, indent=1)
    os.replace(tmp, out)
    print('ecmwf010 score: %d shadow rows; ' % res['shadowRows'] + '; '.join('%s %s (%s)' % (v, 'PASS' if d['pass'] else 'no', d['why']) for v, d in res['decision'].items()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
