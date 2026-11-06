#!/usr/bin/env python3
"""aq40 step 1 - the station-day table for the PM2.5 model (rules: data/evidence/aq40/AQ_RULES_20261031.json).
Truth (AQ04 daily QC, tiers A+B, AirGradient/Hawanama calibrated to reference by the locked leave-one-network-out choice),
CAMS + weather daily features at the station's 0.1 deg cell, static surface + kiln features, region and held-out flag.
usage: python -I aq40_build.py --qc <training_qc dir> --cells <aq_openaq dir> --kilns <kilns csv> --tree <nigraan tree> --out <dir>"""
import os, sys, json, hashlib, argparse, numpy as np, pandas as pd

AG = ('AirGradient', 'Hawanama')


def km(la1, lo1, la2, lo2):
    return 6371 * np.hypot(np.radians(la2 - la1), np.radians(lo2 - lo1) * np.cos(np.radians(la1)))


def held_out(sid):
    return int(hashlib.sha1(str(sid).encode()).hexdigest()[:8], 16) % 1000 < 300


def region_of(prov, dist, div=None):
    d = str(dist or '')
    if str(div or '') == 'Karachi Division': return 'Karachi'   # amendment 1 (31 Oct 11:25 PKT): the locked rule text says Karachi Division
    if d == 'Lahore': return 'Lahore'
    if d in ('Islamabad', 'Rawalpindi'): return 'Islamabad-Rawalpindi'
    if d.startswith('Karachi') or d in ('Korangi', 'Malir', 'Keamari', 'Kemari'): return 'Karachi'
    if d in ('Peshawar', 'Faisalabad', 'Multan', 'Gujranwala'): return d
    p = str(prov or '')
    return {'Punjab': 'Punjab-other', 'Sindh': 'Sindh-other', 'Khyber Pakhtunkhwa': 'KP-other', 'Balochistan': 'Balochistan',
            'Gilgit-Baltistan': 'Gilgit-Baltistan', 'Gilgit Baltistan': 'Gilgit-Baltistan', 'Azad Kashmir': 'Azad Kashmir',
            'Federal Capital': 'Islamabad-Rawalpindi', 'Islamabad Capital Territory': 'Islamabad-Rawalpindi'}.get(p, 'other:' + p)


class Tehsils:
    def __init__(self, tree):
        from shapely.geometry import shape, Point
        from shapely.strtree import STRtree
        J = json.load(open(os.path.join(tree, 'data', 'pk-tehsils.json')))
        self.P = [f['properties'] for f in J['features']]; self.G = [shape(f['geometry']) for f in J['features']]
        self.T = STRtree(self.G); self.Point = Point

    def at(self, lat, lon):
        p = self.Point(lon, lat)
        for i in self.T.query(p):
            if self.G[i].contains(p): return self.P[i]
        i = self.T.nearest(p); return self.P[i]


def fit_form(P, form):
    s, r, h = P.s.values, P.ref.values, P.h.values
    if form == 'C0': return dict(form='C0')
    if form == 'C1': return dict(form='C1', k=float(np.median(r / s)))
    X = np.column_stack([np.ones(len(P)), np.log(s)] + ([h] if form == 'C3' else []))
    b, *_ = np.linalg.lstsq(X, np.log(r), rcond=None)
    return dict(form=form, b=[float(x) for x in b], smear=float(np.mean(np.exp(np.log(r) - X @ b))))


def apply_form(C, s, h):
    s = np.asarray(s, float); h = np.asarray(h, float)
    if C['form'] == 'C0': return s
    if C['form'] == 'C1': return C['k'] * s
    b = C['b']; z = b[0] + b[1] * np.log(s) + (b[2] * h if C['form'] == 'C3' else 0)
    return np.exp(z) * C['smear']


def calibrate(qc):
    P = pd.read_parquet(os.path.join(qc, 'aq_colocation_pairs.parquet'))
    P = P[P.provider.isin(AG) & (P.sensor_pm25 > 0) & (P.ref_pm25 > 0)].copy()
    P['net'] = np.where(P.ref_station.str.startswith('pb'), 'PunjabEPA', 'IslamabadEmbassy')
    P = P.rename(columns={'sensor_pm25': 's', 'ref_pm25': 'ref', 'humid_share': 'h'}); P['h'] = P.h.fillna(0)
    out = {}
    for pv, g in P.groupby('provider'):
        tab = {}
        for f in ('C0', 'C1', 'C2', 'C3'):
            m = []
            for net in sorted(g.net.unique()):
                tr, te = g[g.net != net], g[g.net == net]
                if len(tr) < 30: continue
                C = fit_form(tr, f); m.append(float(np.mean(np.abs(apply_form(C, te.s, te.h) - te.ref))))
            tab[f] = dict(heldOutMae=float(np.mean(m)) if m else None, byNet=m)
        ok = {f: v for f, v in tab.items() if v['heldOutMae'] is not None}
        best = min(ok, key=lambda f: ok[f]['heldOutMae'])
        out[pv] = dict(forms=tab, chosen=best, final=fit_form(g, best), pairs=int(len(g)), nets=g.groupby('net').size().to_dict())
    return out


def cell_daily(cells, key):
    fc, fw = os.path.join(cells, 'cams', key + '.parquet'), os.path.join(cells, 'wx', key + '.parquet')
    if not (os.path.exists(fc) and os.path.exists(fw)): return None
    c = pd.read_parquet(fc); w = pd.read_parquet(fw)
    for x in (c, w):
        lt = x.t + pd.Timedelta(hours=5); x['date'] = lt.dt.strftime('%Y-%m-%d'); x['hr'] = lt.dt.hour
    sp = ['pm2_5', 'pm10', 'dust', 'aerosol_optical_depth', 'nitrogen_dioxide', 'carbon_monoxide', 'sulphur_dioxide', 'ozone']
    g = c.groupby('date')
    C = g[sp].mean().add_prefix('cams_'); C['cams_n'] = g.pm2_5.count()
    w['vent'] = w.boundary_layer_height * w.wind_speed_10m / 3.6
    gw = w.groupby('date')
    W = pd.DataFrame({'t_mean': gw.temperature_2m.mean(), 'dtr': gw.temperature_2m.max() - gw.temperature_2m.min(), 'rh_mean': gw.relative_humidity_2m.mean(),
                      'wind_mean': gw.wind_speed_10m.mean(), 'blh_mean': gw.boundary_layer_height.mean(), 'blh_min': gw.boundary_layer_height.min(),
                      'cloud_mean': gw.cloud_cover.mean(), 'rain': gw.precipitation.sum(min_count=1), 'sun': gw.shortwave_radiation.sum(min_count=1),
                      'wx_n': gw.temperature_2m.count()})
    aft = w[(w.hr >= 12) & (w.hr <= 16)].groupby('date')
    W['vent_aft'] = aft.vent.mean(); W['blh_aft'] = aft.boundary_layer_height.mean(); W['wind_aft'] = aft.wind_speed_10m.mean()
    return C.join(W, how='inner')


def main():
    ap = argparse.ArgumentParser()
    for k in ('qc', 'cells', 'kilns', 'tree', 'out'): ap.add_argument('--' + k, required=True)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    sys.path.insert(0, os.path.join(a.tree, 'scripts')); import featgrid as fg
    D = pd.read_parquet(os.path.join(a.qc, 'aq_daily_qc.parquet'), columns=['station_id', 'parameter', 'date_pkt', 'daily_mean', 'humid_share', 'provider', 'tier', 'train_tier', 'lat', 'lon', 'cell_0p1'])
    D = D[(D.parameter == 'pm25') & D.train_tier.isin(['A_reference', 'B_low_cost'])].copy()
    D['provider'] = D.provider.astype(str); D['date'] = D.date_pkt.astype(str).str[:10]
    D = D[(D.train_tier == 'A_reference') | D.provider.isin(AG)]
    D = D[D.date >= '2022-08-01'].copy()
    CAL = calibrate(a.qc)
    D['truth'] = D.daily_mean.astype(float)
    for pv, C in CAL.items():
        m = (D.train_tier == 'B_low_cost') & (D.provider == pv)
        D.loc[m, 'truth'] = apply_form(C['final'], D.loc[m, 'daily_mean'], D.loc[m, 'humid_share'].fillna(0))
    D = D[D.truth > 0]
    # stations: position (median), region, held-out flag
    S = D.groupby('station_id').agg(lat=('lat', 'median'), lon=('lon', 'median'), provider=('provider', 'first'), tier=('train_tier', 'first')).reset_index()
    TH = Tehsils(a.tree); pr = [TH.at(r.lat, r.lon) for r in S.itertuples()]
    S['uid'] = [p['uid'] for p in pr]; S['province'] = [p['province'] for p in pr]; S['district'] = [p['district'] for p in pr]
    S['region'] = [region_of(p['province'], p['district'], p.get('division')) for p in pr]; S['heldOut'] = S.station_id.map(held_out)
    # static
    rc = [fg.cell_of(la, lo) for la, lo in zip(S.lat, S.lon)]
    N = json.load(open(os.path.join(a.tree, 'data', 'pm25-national.json')))
    for b in sorted(set(['s_built10', 'p_pop', 't_elev'] + N['staticBands'])):
        A = fg.read_band(os.path.join(a.tree, 'data'), b); S[b] = [float(A[r, c]) if 0 <= r < A.shape[0] and 0 <= c < A.shape[1] else np.nan for r, c in rc]; del A
    K = pd.read_csv(a.kilns, usecols=['lat', 'lon']).dropna()
    for R in (10, 30):
        S['kiln%d' % R] = [int((km(la, lo, K.lat.values, K.lon.values) <= R).sum()) for la, lo in zip(S.lat, S.lon)]
    # cell features (the station's own cell: CAMS + weather archive)
    S['cell'] = (S.lat / 0.1).round().astype(int).astype(str) + '_' + (S.lon / 0.1).round().astype(int).astype(str)
    D = D.merge(S[['station_id', 'cell']], on='station_id')
    parts = []
    for cell, g in D.groupby('cell'):
        X = cell_daily(a.cells, cell)
        if X is None: continue
        parts.append(g.merge(X, left_on='date', right_index=True, how='inner'))
    T = pd.concat(parts, ignore_index=True)
    T = T.merge(S.drop(columns=['cell', 'lat', 'lon', 'provider', 'tier']), on='station_id')
    T = T[T.cams_n >= 18].copy()
    T.to_parquet(os.path.join(a.out, 'aq40_table.parquet'), index=False); S.to_parquet(os.path.join(a.out, 'aq40_stations.parquet'), index=False)
    info = dict(calibration=CAL, rows=int(len(T)), stations=int(T.station_id.nunique()), cellsMissing=int(D.cell.nunique() - T.cell.nunique()),
                byRegion=T.groupby(['region', 'heldOut']).size().unstack(fill_value=0).to_dict())
    json.dump(info, open(os.path.join(a.out, 'aq40_build.json'), 'w'), indent=1, default=str)
    print(json.dumps({k: v for k, v in info.items() if k != 'byRegion'}, default=str)[:3000]); print(T.groupby(['region', 'heldOut']).size().unstack(fill_value=0))


if __name__ == '__main__':
    main()
