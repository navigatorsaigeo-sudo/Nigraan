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
ap.add_argument('--out', default=os.path.join(C.APP, 'data', 'score-monthly.json')); a = ap.parse_known_args()[0]   # --root/--lamha/--nigraan/--datalake are read by common.py
UP = C.UP; LAKE = C.LAKE_ARCHIVE
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
for f in sorted(glob.glob(os.path.join(ARCH, 'fc_*.jsonl.gz'))):
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
for f in sorted(glob.glob(os.path.join(C.LAKE_FLEET, 'fleet_pairs_20*.csv'))):   # every month held
    p = pd.read_csv(f, usecols=['key', 'model_elev_m']).dropna().drop_duplicates('key'); pe.update(dict(zip(p.key, p.model_elev_m)))
for k, s in hr.groupby('key'):
    if k in pe: ST[('mach', k)] = (float(s.lat.iloc[0]), float(s.lon.iloc[0]), float(pe[k]))
obs = []   # net, key, hour(ms), T, Td, W(km/h)
obs.append(pd.DataFrame({'net': 'mach', 'key': hr.key.values, 'h': (hr.hr * H).values, 'T': hr['T'].values, 'Td': hr.Td.where(hr.Td.notna(), dew(hr['T'], hr.RH)).values, 'W': hr.W.values}))
# synop
smeta = json.load(open(os.path.join(C.DATALAKE, 'synop', 'stations.json')))
sy = [pd.read_parquet(os.path.join(LAKE, 'synop_ogimet', 'synop_ogimet_all.parquet'))]
rows = [json.loads(l) for f in sorted(glob.glob(os.path.join(LAKE, 'synop', 'synop_20*.jsonl'))) for l in open(f)]   # every month held
j = pd.DataFrame(rows); j['t'] = pd.to_datetime(j.t, utc=True); sy.append(j)
sy = pd.concat(sy, ignore_index=True); sy['sid'] = sy.sid.astype(str); sy = sy[sy.sid.isin(smeta)]
sy = sy.sort_values('t').drop_duplicates(['sid', 't'], keep='last')
sy['h'] = (sy.t - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds().astype('int64') * 1000
sy = sy[(sy.h % H) == 0]
for sid in sy.sid.unique(): ST[('synop', sid)] = (smeta[sid]['lat'], smeta[sid]['lon'], smeta[sid].get('elevM'))
obs.append(pd.DataFrame({'net': 'synop', 'key': sy.sid.values, 'h': sy.h.values, 'T': sy.t_c.values, 'Td': sy.td_c.values, 'W': (sy.wspd * 3.6).values}))
# METAR (airports)
ap_ = pd.read_csv(os.path.join(C.LAMHA_METAR, 'airports.csv'))
for r in ap_.itertuples(): ST[('metar', r.icao)] = (r.lat, r.lon, r.elev_m)
m1 = pd.read_parquet(os.path.join(LAKE, 'metar', 'metar_hourly.parquet'))
m1['ts'] = pd.to_datetime(m1.timestamp_utc, utc=True)
m1 = pd.DataFrame({'key': m1.station, 'ts': m1.ts, 'T': m1.t_c, 'Td': m1.td_c, 'W': m1.wspd_ms * 3.6})
w, _ = C.metar_wind()
m2 = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(os.path.join(C.LAMHA_METAR, 'metar_20*.csv')))], ignore_index=True); m2['ts'] = pd.to_datetime(m2.time_utc, utc=True)
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
            P.append((net, k, z, r['d'], vd, L, None if T is None else T / 10, RH, W, o[0], o[1], o[2]))
P = pd.DataFrame(P, columns=['net', 'key', 'zone', 'issue', 'vday', 'lead', 'fT', 'fRH', 'fW', 'oT', 'oTd', 'oW'])
P['fTd'] = dew(P.fT, P.fRH.astype(float))
P = P[(P.vday >= a.frm) & (P.vday <= a.to)]
print('pairs', len(P), P.groupby(['zone', 'lead']).size().unstack(fill_value=0).to_dict())


def cont(err, days, nboot=1000):
    err = np.asarray(err, float); ok = np.isfinite(err); err = err[ok]; days = np.asarray(days)[ok]
    if len(err) < 10: return None
    ud = np.unique(days); idx = {d: np.where(days == d)[0] for d in ud}
    bs = []
    for _ in range(nboot):
        pick = rng.choice(ud, len(ud)); ii = np.concatenate([idx[d] for d in pick]); bs.append(np.abs(err[ii]).mean())
    return {'n': int(len(err)), 'days': int(len(ud)), 'mae': round(float(np.abs(err).mean()), 2), 'bias': round(float(err.mean()), 2), 'mae90': [round(float(np.quantile(bs, .05)), 2), round(float(np.quantile(bs, .95)), 2)]}


def score(D, f, o, nets):
    D = D[D.net.isin(nets)]; e = (D[f] - D[o]).values
    r = cont(e, D.vday.values)
    if not r: return None
    r['stations'] = int(D[np.isfinite(e)].key.nunique())
    r['byNetwork'] = {n: {'n': int(np.isfinite(e[(D.net == n).values]).sum()), 'mae': round(float(np.nanmean(np.abs(e[(D.net == n).values]))), 2), 'bias': round(float(np.nanmean(e[(D.net == n).values])), 2)} for n in nets if np.isfinite(e[(D.net == n).values]).sum() >= 10}
    return r


# ── rain day ──
RAIN = []
sr = sy[sy.rain_h.notna() & sy.rain_mm.notna()].copy() if 'rain_h' in sy else sy.iloc[0:0]
sr['hh'] = sr.t.dt.hour
r12 = sr[(sr.rain_h == 12) & sr.hh.isin([0, 12])]
rr = {(s, int(h)): float(v) for s, h, v in zip(r12.sid, r12.h, r12.rain_mm)}
for (net, k), (u, z, dkm, dz) in match.items():
    if net != 'synop': continue
    for r in fcu.get(u, []):
        b = int(pd.Timestamp(r['base']).value // 1_000_000)
        if not r.get('P'): continue
        for x0 in range(b, b + r['n'] * H, H):
            if (x0 // H) % 24: continue   # windows start at 00 UTC
            i0 = (x0 - b) // H + 1; i1 = i0 + 24
            if i1 > r['n']: continue
            fc = [r['P'][i] for i in range(i0, i1)]
            if any(v is None for v in fc): continue
            o1, o2 = rr.get((k, x0 + 12 * H)), rr.get((k, x0 + 24 * H))
            if o1 is None or o2 is None: continue
            mid = x0 + 12 * H; vd = pktday(mid); L = (datetime.fromisoformat(vd) - datetime.fromisoformat(r['d'])).days
            RAIN.append(('synop', k, z, r['d'], vd, L, sum(fc) / 10, o1 + o2))
# MACH Pakistan-day totals from the database's daily accumulation (precipTotalMm resets at local midnight)
dbf = sorted(glob.glob(os.path.join(C.LAMHA_DB, 'obs_2*.csv')))
if dbf:
    db = pd.concat([pd.read_csv(f, usecols=['stationKey', 'time', 'source', 'precipTotalMm']) for f in dbf], ignore_index=True)
    db = db[db.source != 'asos']; db['ts'] = pd.to_datetime(db.time, format='ISO8601', utc=True)
    db['pday'] = (db.ts + pd.Timedelta(hours=5)).dt.strftime('%Y-%m-%d'); db['ph'] = (db.ts + pd.Timedelta(hours=5)).dt.hour
    g = db.groupby(['stationKey', 'pday']).agg(tot=('precipTotalMm', 'max'), hrs=('ph', 'nunique')).reset_index()
    g = g[g.hrs >= 20]
    mtot = {(k, d): t for k, d, t in zip(g.stationKey, g.pday, g.tot)}
    for (net, k), (u, z, dkm, dz) in match.items():
        if net != 'mach': continue
        for r in fcu.get(u, []):
            for dd in r.get('D') or []:
                t = mtot.get((k, dd[0]))
                if t is None or dd[3] is None or not np.isfinite(t): continue
                L = (datetime.fromisoformat(dd[0]) - datetime.fromisoformat(r['d'])).days
                RAIN.append(('mach', k, z, r['d'], dd[0], L, dd[3] / 10, float(t)))
RAIN = pd.DataFrame(RAIN, columns=['net', 'key', 'zone', 'issue', 'vday', 'lead', 'f', 'o'])
RAIN = RAIN[(RAIN.vday >= a.frm) & (RAIN.vday <= a.to)]


def rainscore(D):
    if len(D) < 5: return None
    f, o = D.f >= 1.0, D.o >= 1.0
    h, m, fa, cn = int((f & o).sum()), int((~f & o).sum()), int((f & ~o).sum()), int((~f & ~o).sum())
    return {'n': int(len(D)), 'stations': int(D.key.nunique()), 'days': int(D.vday.nunique()), 'hits': h, 'misses': m, 'falseAlarms': fa, 'correctNegatives': cn,
            'hitRate': round(h / (h + m), 2) if h + m else None, 'falseAlarmRatio': round(fa / (h + fa), 2) if h + fa else None,
            'frequencyBias': round((h + fa) / (h + m), 2) if h + m else None, 'observedRainDays': h + m,
            'byNetwork': {n: int((D.net == n).sum()) for n in ['synop', 'mach'] if (D.net == n).sum()}}


NOT3 = 'not held: the forecast archive keeps the first 73 hours of the 00:00 PKT issue (lead days 0-2); lead day 3 needs the archive to keep 97 hours'
VARS = {'temperature': ('fT', 'oT', ['mach', 'synop', 'metar']), 'dewPoint': ('fTd', 'oTd', ['mach', 'synop', 'metar']), 'wind': ('fW', 'oW', ['synop', 'metar'])}
out = {'zones': {}, 'national': {}}
for z in ZONES + ['national']:
    dz_ = P if z == 'national' else P[P.zone == z]; rz = RAIN if z == 'national' else RAIN[RAIN.zone == z]
    zz = {}
    for v, (f, o, nets) in VARS.items():
        zz[v] = {}
        for L in LEADS:
            if L == '3': zz[v][L] = {'missing': NOT3}; continue
            s = score(dz_[dz_.lead == int(L)], f, o, nets)
            zz[v][L] = s if s else {'missing': 'fewer than 10 station hours paired in this zone and lead'}
        if v == 'wind':
            m_ = score(dz_[dz_.lead == 0], f, o, ['mach'])
            if m_: zz[v]['machLead0'] = {**m_, 'note': 'MACH anemometers are not 10 m exposures (rooftops, walls): shown apart, not in the score'}
    zz['rainDay'] = {}
    for L in LEADS:
        if L == '3': zz['rainDay'][L] = {'missing': NOT3}; continue
        s = rainscore(rz[rz.lead == int(L)])
        zz['rainDay'][L] = s if s else {'missing': 'fewer than 5 station days paired in this zone and lead'}
    if z == 'national': out['national'] = zz
    else: out['zones'][z] = zz

# plain summary
nat = out['national']
def g(v, L, k='mae'): x = nat[v][L]; return x.get(k) if isinstance(x, dict) else None
tz = {z: out['zones'][z]['temperature']['0'].get('mae') for z in ZONES}
summary = ('First monthly check of what NIGRAAN served against what stations measured ({} forecast issues, {} to {}; {} stations paired). '
           'Temperature: off by {} C on average on the day of issue, {} C the next day and {} C the day after. Dew point: {} / {} / {} C '
           '(on the day of issue: synoptic stations {} C, airports {} C, MACH {} C; average served minus measured {} / {} / {} C). '
           'Wind (synoptic stations and airports): {} / {} / {} km/h. Rain days: {} of {} observed rain days were forecast on the day of issue; '
           '{} of the forecast rain days stayed dry. By zone on the day of issue the temperature error was {}. '
           'Lead day 3 is not in the archive yet (it keeps three days); the archive window ends 14 Oct (the last held issue is 12 Oct). Operator only.').format(
    len(issues), issues[0] if issues else '-', issues[-1] if issues else '-', P.key.nunique(),
    g('temperature', '0'), g('temperature', '1'), g('temperature', '2'), g('dewPoint', '0'), g('dewPoint', '1'), g('dewPoint', '2'),
    *[(nat['dewPoint']['0'].get('byNetwork') or {}).get(n, {}).get('mae') for n in ['synop', 'metar', 'mach']],
    *[(nat['dewPoint']['0'].get('byNetwork') or {}).get(n, {}).get('bias') for n in ['synop', 'metar', 'mach']],
    g('wind', '0'), g('wind', '1'), g('wind', '2'),
    (nat['rainDay']['0'] or {}).get('hits'), (nat['rainDay']['0'] or {}).get('observedRainDays'),
    (lambda x: '{} of {}'.format(x.get('falseAlarms'), x.get('hits', 0) + x.get('falseAlarms', 0)) if 'hits' in x else '-')(nat['rainDay']['0']),
    ', '.join('{} {} C'.format(z, tz[z]) for z in ZONES if tz[z] is not None))
res = {'version': 'score-monthly-91.17.275', 'built': (datetime.now(timezone.utc) + timedelta(hours=5)).strftime('%Y-%m-%d %H:%M PKT'), 'audience': 'operator',
       'window': {'from': a.frm, 'to': a.to, 'issues': issues, 'validFrom': P[P.lead <= 2].vday.min() if len(P) else None, 'validTo': P[P.lead <= 2].vday.max() if len(P) else None,
                  'note': 'issues held in data/archive/forecast inside the window; days with no archived issue (1-2, 4-6, 10-11 Oct, 13 Oct on) are not scored'},
       'variables': ['temperature', 'dewPoint', 'wind', 'rainDay'], 'leads': LEADS,
       'method': {'forecast': 'served tehsil forecast (data/archive/forecast: the 00:00 PKT national run after every correction), 73 hourly values',
                  'truth': 'MACH fleet (stuck-screened, registry exclusions out), WMO synoptic stations, airports (METAR)',
                  'pairing': 'nearest tehsil centre <= %d km in the same zone with served height within %d m of the station; no adjustment' % (MAXKM, MAXDZ),
                  'lead': 'lead day = Pakistan date of the valid hour - the issue date (0 = the issue day)',
                  'scores': 'MAE and bias (forecast - observed); 90 % interval of the MAE by resampling whole valid days (1,000 draws)',
                  'wind': '10 m wind at synoptic stations and airports; MACH wind apart (non-standard exposure)',
                  'rainDay': '>= 1.0 mm: synop 00->00 UTC from the two 12-hour reports with the forecast summed over the same hours; MACH Pakistan-day totals (database daily accumulation, >= 20 hours held)',
                  'zones': 'data/model-zone.json rule (mountain outline or >= 2000 m, coast <= 60 km, hills >= 1000 m, else plains)'},
       'stations': {'held': len(ST), 'paired': len(match), 'byNetwork': {n: int(sum(1 for (nn, _) in match if nn == n)) for n in ['mach', 'synop', 'metar']},
                    'byZone': {z: int(sum(1 for v in match.values() if v[1] == z)) for z in ZONES}, 'unpaired': excl['noTehsil'],
                    'medianDistanceKm': round(float(np.median([v[2] for v in match.values()])), 1) if match else None,
                    'medianHeightDiffM': round(float(np.median([v[3] for v in match.values() if v[3] is not None])), 0) if match else None},
       'zones': out['zones'], 'national': out['national'], 'ownerSummary': summary,
       'limits': ['one month, ten issues: intervals are wide; a zone with few stations (hills, coast, mountain) moves with one station',
                  'the tehsil value is compared at the station without height or distance adjustment (up to 25 km, 300 m): part of the error is the place, not the forecast',
                  'MACH rain totals are household gauges (no screen for rain); synop rain windows are 00->00 UTC, not Pakistan days',
                  'lead day 3: not archived (73 hours kept)']}
json.dump(res, open(a.out, 'w'), indent=1)
print(json.dumps({z: {v: {L: (res['zones'][z][v][L].get('mae') if 'mae' in res['zones'][z][v][L] else res['zones'][z][v][L].get('hitRate', res['zones'][z][v][L].get('missing', '')[:20])) for L in LEADS} for v in res['variables']} for z in ZONES}, indent=0))
print(summary)
if os.environ.get('ARCH_DEBUG'):
    P['eTd'] = P.fTd - P.oTd; P['eT'] = P.fT - P.oT
    print(P[P.lead <= 2].groupby(['issue']).agg(n=('eTd', 'size'), td_bias=('eTd', 'mean'), td_mae=('eTd', lambda x: x.abs().mean()), t_mae=('eT', lambda x: x.abs().mean())).round(2))
    print(P[P.lead <= 2].groupby(['zone', 'net']).agg(n=('eTd', 'size'), td_bias=('eTd', 'mean'), td_mae=('eTd', lambda x: x.abs().mean())).round(2))
