#!/usr/bin/env python3
"""Sanity check of an ingested ECMWF 0.1 deg run against Open-Meteo (free API, no key) at 5 Pakistani points (v91.17.283.2).

For each point and each forecast step of the run up to --max-lead hours: ecmwf010 (bilinear from the stored Pakistan grid) against
Open-Meteo models=ecmwf_ifs025 (ECMWF IFS at 0.25 deg as Open-Meteo serves it) and models=best_match (what NIGRAAN's main sweeps
fetch). Temperature is compared raw and also moved from the model orography to Open-Meteo's point elevation with the standard
atmosphere lapse rate (6.5 K/km), the same height adjustment Open-Meteo applies to its own output. Rain is compared over the
same step intervals (Open-Meteo hourly sums). Reports mean difference (bias) and mean absolute difference per variable.
Note: Open-Meteo may already serve a newer run than the ingested one; the run it used is not reported by the API.
Usage: python scripts/ecmwf/sanity_vs_openmeteo.py --run-dir <data/ecmwf010/YYYYMMDDHH> [--max-lead 72] [--json out.json]
"""
import argparse, datetime as dt, gzip, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np

POINTS = [('Lahore', 31.5204, 74.3587), ('Karachi', 24.8607, 67.0011), ('Gilgit', 35.9208, 74.3080),
          ('Quetta', 30.1798, 66.9750), ('Murree', 33.9070, 73.3943)]
LAPSE = 0.0065


def load_run(d):
    with open(os.path.join(d, 'meta.json'), 'r', encoding='ascii') as h:
        m = json.load(h)
    g = m['grid']; out = {}
    for name, v in m['vars'].items():
        with gzip.open(os.path.join(d, name + '.i16.gz'), 'rb') as h:
            a = np.frombuffer(h.read(), dtype='<i2')
        shape = (g['ny'], g['nx']) if v['kind'] == 'static' else (len(m['steps']), g['ny'], g['nx'])
        a = a.reshape(shape).astype(np.float64)
        a = np.where(a == -32768, np.nan, a * v['scale'] + v['offset'])
        out[name] = a
    return m, out


def bil(g, f, lat, lon):
    fy = (lat - g['lat0']) / g['dlat']; fx = (lon - g['lon0']) / g['dlon']
    j = min(int(math.floor(fy)), g['ny'] - 2); i = min(int(math.floor(fx)), g['nx'] - 2); wy, wx = fy - j, fx - i
    return (1 - wy) * ((1 - wx) * f[..., j, i] + wx * f[..., j, i + 1]) + wy * ((1 - wx) * f[..., j + 1, i] + wx * f[..., j + 1, i + 1])


def om(lat, lon, model, start, end):
    q = {'latitude': lat, 'longitude': lon, 'hourly': 'temperature_2m,dew_point_2m,precipitation,wind_speed_10m,wind_gusts_10m,pressure_msl,cloud_cover,shortwave_radiation',
         'models': model, 'timezone': 'UTC', 'wind_speed_unit': 'ms', 'start_hour': start, 'end_hour': end}
    url = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(q)
    err = None
    for k in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'AI-GEO-NIGRAAN-local/91.17 ecmwf010-sanity'}), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            err = e; time.sleep(3 * (k + 1))
    raise RuntimeError('Open-Meteo request failed: %s' % err)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--run-dir', required=True); ap.add_argument('--max-lead', type=int, default=72); ap.add_argument('--json')
    a = ap.parse_args()
    m, F = load_run(a.run_dir); g = m['grid']
    t0 = dt.datetime.strptime(m['run'], '%Y%m%d%H')
    steps = [s for s in m['steps'] if s <= a.max_lead]
    start = t0.strftime('%Y-%m-%dT%H:00'); end = (t0 + dt.timedelta(hours=steps[-1])).strftime('%Y-%m-%dT%H:00')
    res = {'run': m['run'], 'maxLead': steps[-1], 'points': {}}
    for name, lat, lon in POINTS:
        E = {k: bil(g, F[k], lat, lon) for k in F}
        z = float(E['orog']) if 'orog' in E else None
        P = {'lat': lat, 'lon': lon, 'modelOrogM': round(z, 0) if z is not None else None, 'vs': {}}
        for model in ('ecmwf_ifs025', 'best_match'):
            j = om(lat, lon, model, start, end); H = j['hourly']; idx = {t: i for i, t in enumerate(H['time'])}
            P['omElevM'] = j.get('elevation')
            dz = (j.get('elevation') - z) if (z is not None and j.get('elevation') is not None) else 0.0
            diffs = {k: [] for k in ('t2m_raw', 't2m_height', 'd2m', 'wind10', 'gust', 'msl', 'tcc', 'tp_interval', 'ssrd')}
            prev = 0
            for k, s in enumerate(steps):
                t = (t0 + dt.timedelta(hours=s)).strftime('%Y-%m-%dT%H:00'); i = idx.get(t)
                if i is None:
                    prev = s; continue
                def d(key, ev, ov):
                    if ev is None or ov is None or not np.isfinite(ev):
                        return
                    diffs[key].append(float(ev) - float(ov))
                d('t2m_raw', E['t2m'][k], H['temperature_2m'][i]); d('t2m_height', E['t2m'][k] - LAPSE * dz, H['temperature_2m'][i])
                d('d2m', E['d2m'][k] - LAPSE * dz, H['dew_point_2m'][i])
                d('wind10', math.hypot(E['u10'][k], E['v10'][k]), H['wind_speed_10m'][i]); ('msl' in E and d('msl', E['msl'][k], H['pressure_msl'][i]))
                'tcc' in E and d('tcc', E['tcc'][k], H['cloud_cover'][i])   # v283.15: runs no longer carry msl, tcc, ssrd
                if s > 0:
                    d('gust', E['gust'][k], H['wind_gusts_10m'][i])
                    hrs = [idx.get((t0 + dt.timedelta(hours=h)).strftime('%Y-%m-%dT%H:00')) for h in range(prev + 1, s + 1)]
                    if all(x is not None for x in hrs):
                        pr = [H['precipitation'][x] for x in hrs]; sw = [H['shortwave_radiation'][x] for x in hrs]
                        if all(v is not None for v in pr):
                            d('tp_interval', E['tp'][k], sum(pr))
                        if 'ssrd' in E and all(v is not None for v in sw):
                            d('ssrd', E['ssrd'][k], sum(sw) / len(sw))
                prev = s
            P['vs'][model] = {key: ({'n': len(v), 'bias': round(sum(v) / len(v), 2), 'mae': round(sum(abs(x) for x in v) / len(v), 2)} if v else None) for key, v in diffs.items()}
        res['points'][name] = P
    print(json.dumps(res, indent=1))
    if a.json:
        with open(a.json, 'w', encoding='ascii') as o:
            json.dump(res, o, indent=1)


if __name__ == '__main__':
    sys.exit(main())
