"""DEW v275 - provider members' own 2 m dew point vs stations, Sep 2026 (LAMHA NWP point archive: GFS and ECMWF IFS as issued,
bilinear at the station; steps 3-24 h). Truth: SYNOP (ogimet copy) and MACH (screened). Zone by the served zone rule."""
import sys, os, json, numpy as np, pandas as pd
sys.dont_write_bytecode = True
sys.path.insert(0, '/tmp/claude-0/v275/srv_arch/scripts/arch275'); import common as C
UP = '/mnt/user-data/uploads'; NWP = UP + '/LAMHA/data/nwp/points'
pts = pd.read_csv(NWP + '/points.csv')
smeta = json.load(open(UP + '/DATA LAKE/synop/stations.json')); reg = C.registry()
sy = pd.read_parquet(UP + '/NIGRAAN/nig/station-lake/archive/synop_ogimet/synop_ogimet_all.parquet'); sy['sid'] = sy.sid.astype(str)
sy['t'] = pd.to_datetime(sy.t, utc=True); sy = sy[sy.t.dt.minute == 0].dropna(subset=['td_c'])
mo = C.mach_obs(); hh = C.hourly(mo); hh = hh[hh.Td.notna() | hh.RH.notna()]
def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)
hh['Tdx'] = hh.Td.where(hh.Td.notna(), dew(hh['T'], hh.RH))
OB = {}
for r in pts.itertuples():
    if r.src == 'synop' and str(r.sid) in smeta:
        s = sy[sy.sid == str(r.sid)]; el = smeta[str(r.sid)].get('elevM')
        OB[r.pid] = ('synop', C.zone(r.lat, r.lon, el), pd.Series(s.td_c.values, index=s.t.values))
    elif r.src == 'mach' and r.sid in reg:
        s = hh[hh.key == r.sid]; el = reg[r.sid].get('elevM', reg[r.sid].get('elev'))
        if len(s): OB[r.pid] = ('mach', C.zone(r.lat, r.lon, el), pd.Series(s.Tdx.values, index=pd.to_datetime(s.hr * 3600, unit='s', utc=True).values))
rows = []
for m in ['gfs', 'ifs']:
    d = pd.read_parquet(f'{NWP}/{m}/{m}_points_202609.parquet', columns=['init_utc', 'step_h', 'pid', 'd2m', 't2m'])
    d = d[(d.step_h >= 3) & (d.step_h <= 24) & d.pid.isin(OB)]
    d['vt'] = pd.to_datetime(d.init_utc, utc=True) + pd.to_timedelta(d.step_h, unit='h')
    K = lambda x: x - 273.15 if np.nanmedian(x) > 150 else x
    d['d2m'] = K(d.d2m.values)
    for pid, g in d.groupby('pid'):
        net, z, s = OB[pid]; o = s[~s.index.duplicated()]
        v = o.reindex(g.vt.values).values
        rows.append(pd.DataFrame({'model': m, 'pid': pid, 'net': net, 'zone': z, 'vt': g.vt.values, 'f': g.d2m.values, 'o': v}))
R = pd.concat(rows).dropna(); R['e'] = R.f - R.o
out = R.groupby(['zone', 'net', 'model']).agg(n=('e', 'size'), st=('pid', 'nunique'), bias=('e', 'mean'), mae=('e', lambda x: x.abs().mean())).round(2)
print(out.to_string()); R.to_parquet(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'members_sep.parquet'))
