# DEW v275: the ARCH v275 pairing (score_monthly.py, unchanged) saved as a pairs table for the dew diagnosis
"""v91.17.275 ARCH (V-01) - the first monthly forecast score: what NIGRAAN SERVED (the tehsil forecast of data/archive/forecast, the run
whose first hour is 00:00 PKT, after every correction) against what stations measured, by lead day and zone. Operator only.

Forecast   data/archive/forecast/fc_*.jsonl.gz: one row per tehsil per issue, 73 hourly values from 00:00 PKT (lead day 0 = the issue's
           Pakistan day, 1, 2; hour 72 is the first hour of day 3, so lead day 3 is NOT held by this archive - said in the output).
Truth      MACH fleet (screened: the server's five-rule stuck screen on every series, registry exclusions out), the synoptic network
           (WMO SYNOP copies: station-lake synop_ogimet_all.parquet + synop_2026-10.jsonl), airports (METAR: station-lake
           metar_hourly.parquet + LAMHA metar_live/metar_202610.csv). Nothing fetched.
Pairing    station -> nearest tehsil centre <= 25 km in the SAME zone (data/model-zone.json rule) whose served height is within 300 m of
           the station; the tehsil value at that hour (no height or distance adjustment: the score is what a customer at the station
           would have read). A station hour pairs once per issue.
Variables  temperature (C), dew point (C, Magnus over the served T and RH), 10 m wind (km/h; synop + METAR only - MACH anemometers are
           not 10 m exposures, reported apart), rain day (>= 1.0 mm in the window: synop 00->00 UTC from the 12 UTC and 00 UTC 12-hour
           reports, forecast summed over the same hours; MACH Pakistan-day totals from the database's daily accumulation).
Scores     MAE, bias (forecast - observed), n pairs, n stations, 90 % interval of the MAE by resampling whole valid days (1,000 draws);
           rain day: hits, misses, false alarms, correct negatives, hit rate, false-alarm ratio, frequency bias.
Out        data/score-monthly.json (served at /api/score/monthly, operator only).
Run        python -I scripts/arch275/score_monthly.py [--from 2026-09-26 --to 2026-10-16]"""
import os, sys, json, gzip, glob, math, argparse
from datetime import datetime, timezone, timedelta
import numpy as np, pandas as pd
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument('--from', dest='frm', default='2026-09-26'); ap.add_argument('--to', default='2026-10-16')
ap.add_argument('--out', default=''); a = ap.parse_args()
UP = C.UP; LAKE = UP + '/NIGRAAN/nig/station-lake/archive'
ARCH = os.path.join(C.APP, 'data', 'archive', 'forecast')
H = 3600_000; PKT = 5 * H
rng = np.random.default_rng(275)
ZONES = ['plains', 'hills', 'mountain', 'coast']; LEADS = ['0', '1', '2', '3']
MAXKM, MAXDZ = 25.0, 300.0


def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)


def km(la1, lo1, la2, lo2):
    return 6371 * 2 * np.arcsin(np.sqrt(np.sin(np.radians(la2 - la1) / 2) ** 2 + np.cos(np.radians(la1)) * np.cos(np.radians(la2)) * np.sin(np.radians(lo2 - lo1) / 2) ** 2))


def pktday(ms): return datetime.fromtimestamp((ms + PKT) / 1000, timezone.utc).strftime('%Y-%m-%d')


# ── forecast archive ──
FC = []
for f in sorted(glob.glob(ARCH + '/fc_*.jsonl.gz')):
    for l in gzip.open(f, 'rt'):
        r = json.loads(l)
        if a.frm <= r['d'] <= a.to: FC.append(r)
issues = sorted({r['d'] for r in FC})
cen = {}
for r in FC: cen.setdefault(r['u'], (r['lat'], r['lon'], r.get('z'), r.get('sel') if r.get('sel') is not None else r.get('el')))
UK = list(cen); ULA = np.array([cen[u][0] for u in UK]); ULO = np.array([cen[u][1] for u in UK]); UZ = np.array([cen[u][2] for u in UK]); UEL = np.array([np.nan if cen[u][3] is None else cen[u][3] for u in UK], float)
print('forecast issues', len(issues), issues, 'tehsils', len(UK))

# ── stations ──
ST = {}   # key -> (net, lat, lon, elev, zone)
mo = C.mach_obs(); hr = C.hourly(mo)
pe = {}
for f in [C.LAKE_FLEET + '/fleet_pairs_2026-09.csv', C.LAKE_FLEET + '/fleet_pairs_2026-10.csv']:
    p = pd.read_csv(f, usecols=['key', 'model_elev_m']).dropna().drop_duplicates('key'); pe.update(dict(zip(p.key, p.model_elev_m)))
for k, s in hr.groupby('key'):
    if k in pe: ST[('mach', k)] = (float(s.lat.iloc[0]), float(s.lon.iloc[0]), float(pe[k]))
obs = []   # net, key, hour(ms), T, Td, W(km/h)
obs.append(pd.DataFrame({'net': 'mach', 'key': hr.key.values, 'h': (hr.hr * H).values, 'T': hr['T'].values, 'Td': hr.Td.where(hr.Td.notna(), dew(hr['T'], hr.RH)).values, 'W': hr.W.values}))
# synop
smeta = json.load(open(UP + '/DATA LAKE/synop/stations.json'))
sy = [pd.read_parquet(LAKE + '/synop_ogimet/synop_ogimet_all.parquet')]
rows = [json.loads(l) for l in open(LAKE + '/synop/synop_2026-10.jsonl')]
j = pd.DataFrame(rows); j['t'] = pd.to_datetime(j.t, utc=True); sy.append(j)
sy = pd.concat(sy, ignore_index=True); sy['sid'] = sy.sid.astype(str); sy = sy[sy.sid.isin(smeta)]
sy = sy.sort_values('t').drop_duplicates(['sid', 't'], keep='last')
sy['h'] = (sy.t - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds().astype('int64') * 1000
sy = sy[(sy.h % H) == 0]
for sid in sy.sid.unique(): ST[('synop', sid)] = (smeta[sid]['lat'], smeta[sid]['lon'], smeta[sid].get('elevM'))
obs.append(pd.DataFrame({'net': 'synop', 'key': sy.sid.values, 'h': sy.h.values, 'T': sy.t_c.values, 'Td': sy.td_c.values, 'W': (sy.wspd * 3.6).values}))
# METAR (airports)
ap_ = pd.read_csv(UP + '/LAMHA/data/obs_other/metar_live/airports.csv')
for r in ap_.itertuples(): ST[('metar', r.icao)] = (r.lat, r.lon, r.elev_m)
m1 = pd.read_parquet(LAKE + '/metar/metar_hourly.parquet')
m1['ts'] = pd.to_datetime(m1.timestamp_utc, utc=True)
m1 = pd.DataFrame({'key': m1.station, 'ts': m1.ts, 'T': m1.t_c, 'Td': m1.td_c, 'W': m1.wspd_ms * 3.6})
w, _ = C.metar_wind()
m2 = pd.read_csv(UP + '/LAMHA/data/obs_other/metar_live/metar_202610.csv'); m2['ts'] = pd.to_datetime(m2.time_utc, utc=True)
m2 = m2.sort_values('type').drop_duplicates(['station', 'ts'])
m2['hr'] = ((m2.ts - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() / 3600).round().astype('int64')
wm = w.set_index(['key', 'hr']).W.to_dict()
m2 = pd.DataFrame({'key': m2.station, 'ts': m2.ts, 'T': m2.t_c, 'Td': m2.td_c, 'W': [wm.get((k, h)) for k, h in zip(m2.station, m2.hr)]})
mt = pd.concat([m1, m2], ignore_index=True)
mt['hrf'] = (mt.ts - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() / 3600
mt['hr'] = mt.hrf.round().astype('int64'); mt['off'] = (mt.hrf - mt.hr).abs()
mt = mt[mt.off <= 20 / 60].sort_values('off').drop_duplicates(['key', 'hr'])
mt = mt[mt.key.isin(ap_.icao)]
obs.append(pd.DataFrame({'net': 'metar', 'key': mt.key.values, 'h': (mt.hr * H).values, 'T': mt['T'].values, 'Td': mt.Td.values, 'W': mt.W.values}))
OB = pd.concat(obs, ignore_index=True)
OB = OB[OB['T'].notna()]
print('observations', OB.groupby('net').size().to_dict())

# ── pairing station -> tehsil ──
match = {}; excl = {'noTehsil': 0}
for (net, k), (la, lo, el) in ST.items():
    z = C.zone(la, lo, el)
    d = km(la, lo, ULA, ULO); ok = (d <= MAXKM) & (UZ == z)
    if el is not None and np.isfinite(el): ok &= np.isfinite(UEL) & (np.abs(UEL - el) <= MAXDZ)
    if not ok.any(): excl['noTehsil'] += 1; continue
    i = int(np.argmin(np.where(ok, d, 1e9))); match[(net, k)] = (UK[i], z, float(d[i]), float(abs(UEL[i] - el)) if el is not None and np.isfinite(UEL[i]) else None)
print('stations', len(ST), 'paired', len(match))
fcu = {}
for r in FC: fcu.setdefault(r['u'], []).append(r)
OBi = {(n, k): g for (n, k), g in OB.groupby(['net', 'key'])}
P = []
for (net, k), (u, z, dkm, dz) in match.items():
    g = OBi.get((net, k))
    if g is None: continue
    om = dict(zip(g.h.values.astype('int64'), zip(g['T'].values, g.Td.values, g.W.values)))
    for r in fcu.get(u, []):
        b = int(pd.Timestamp(r['base']).value // 1_000_000)
        for i in range(r['n']):
            o = om.get(b + i * H)
            if o is None: continue
            T = r['T'][i]; RH = r['RH'][i] if r.get('RH') else None; W = r['W'][i] if r.get('W') else None
            vd = pktday(b + i * H); L = (datetime.fromisoformat(vd) - datetime.fromisoformat(r['d'])).days
            P.append((net, k, z, r['d'], vd, L, None if T is None else T / 10, RH, W, o[0], o[1], o[2], b + i * H, r['u']))
P = pd.DataFrame(P, columns=['net', 'key', 'zone', 'issue', 'vday', 'lead', 'fT', 'fRH', 'fW', 'oT', 'oTd', 'oW', 'vms', 'unit'])
P['fTd'] = dew(P.fT, P.fRH.astype(float))
P = P[(P.vday >= a.frm) & (P.vday <= a.to)]
print('pairs', len(P), P.groupby(['zone', 'lead']).size().unstack(fill_value=0).to_dict())


P.to_parquet(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'tehsil_pairs.parquet'))
print('saved', len(P))
