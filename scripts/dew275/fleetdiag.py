"""DEW v275 - fleet pairs: start (provider/zone-merge/blend) dew vs served (chain up to synop) dew vs MACH observed (screened)."""
import sys, os, numpy as np, pandas as pd
sys.dont_write_bytecode = True
sys.path.insert(0, '/tmp/claude-0/v275/srv_arch/scripts/arch275'); import common as C
def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)
L = C.LAKE_FLEET
p = pd.concat([pd.read_csv(L + '/fleet_pairs_2026-09.csv'), pd.read_csv(L + '/fleet_pairs_2026-10.csv')], ignore_index=True)
for f in ['/mnt/user-data/uploads/LAMHA/data/mach/live/fleet_pairs_2026-10.csv']:
    if os.path.exists(f): p = pd.concat([p, pd.read_csv(f)], ignore_index=True)
p = p.drop_duplicates(['key', 'hour_utc'])
p = p[(p.lead_h.abs() <= 1)]
mo = C.mach_obs()
# a pair is kept only if its station-hour passed the stuck screen (screened reading within 20 min of the hour)
hh = C.hourly(mo); okset = set(zip(hh.key, hh.hr))
p['hr'] = ((pd.to_datetime(p.hour_utc, utc=True) - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() // 3600).astype('int64')
p = p[[ (k, h) in okset for k, h in zip(p.key, p.hr)]]
reg = C.registry(); ex = C.excluded(); p = p[~p.key.isin(ex)]
zc = {}
for k, s in p.groupby('key'): zc[k] = C.zone(float(s.lat.iloc[0]), float(s.lon.iloc[0]), float(s.model_elev_m.iloc[0]))
p['zone'] = p.key.map(zc)
p['oTd'] = p.dew_c.where(p.dew_c.notna(), dew(p.temp_c, p.rh_pct))
p['rTd'] = dew(p.fc_raw_c, p.fc_rh_pct); p['sTd'] = dew(p.fc_served_c, p.fc_served_rh_pct)
p['day'] = p.hour_utc.str[:10]; p['per'] = np.where(p.day >= '2026-10-15', 'b:15Oct+', 'a:to14Oct')
p = p.dropna(subset=['oTd', 'rTd', 'sTd'])
p['er'] = p.rTd - p.oTd; p['es'] = p.sTd - p.oTd; p['eT'] = p.fc_served_c - p.temp_c; p['eRH'] = p.fc_served_rh_pct - p.rh_pct
g = p.groupby(['zone', 'per']).agg(n=('er', 'size'), st=('key', 'nunique'), raw_bias=('er', 'mean'), raw_mae=('er', lambda x: x.abs().mean()), srv_bias=('es', 'mean'), srv_mae=('es', lambda x: x.abs().mean()), T_bias=('eT', 'mean'), RH_bias=('eRH', 'mean')).round(2)
print(g.to_string())
p.to_parquet(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'fleet_pairs_dew.parquet'))
