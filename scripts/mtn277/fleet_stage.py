import pandas as pd
F='/mnt/user-data/uploads/NIGRAAN/nig/station-lake/archive/fleet/'
d=pd.concat([pd.read_csv(F+'fleet_pairs_2026-09.csv'),pd.read_csv(F+'fleet_pairs_2026-10.csv')])
d['h']=pd.to_datetime(d.hour_utc)
d=d.drop_duplicates(['key','hour_utc'],keep='last')
for k in ['khaplu','gilgit','talagang','mach1']:
  m=d[d.key==k].copy()
  if not len(m): print(k,'none');continue
  m['pkt']=(m.h.dt.hour+5)%24
  m['er']=m.fc_raw_c-m.temp_c; m['es']=m.fc_served_c-m.temp_c
  print('==',k,len(m),'lat',m.lat.iloc[0],m.lon.iloc[0],'model_elev',m.model_elev_m.unique()[:5],m.h.min(),m.h.max())
  print(m.groupby(m.pkt//3*3).agg(n=('es','size'),obs=('temp_c','mean'),raw=('fc_raw_c','mean'),srv=('fc_served_c','mean'),er=('er','mean'),es=('es','mean')).round(2).to_string())
  print(m.groupby(m.h.dt.date).agg(n=('es','size'),obs=('temp_c','mean'),er=('er','mean'),es=('es','mean'),wind=('wind_kmh','mean')).round(2).to_string())
