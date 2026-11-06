import pandas as pd,glob
fs=sorted(glob.glob('/mnt/user-data/uploads/LAMHA/data/mach/db/obs_2026*.csv'))
d=pd.concat([pd.read_csv(f) for f in fs])
d['t']=pd.to_datetime(d.time,format='mixed',utc=True)
for k in ['khaplu','gilgit']+[s for s in d.stationKey.unique() if 'gilg' in s.lower() or 'tolt' in s.lower() or 'skard' in s.lower()]:
  m=d[d.stationKey==k].copy()
  if not len(m):continue
  m['pkt']=(m.t.dt.hour+5)%24
  print('==',k,len(m),m.t.min(),m.t.max(),'sources',m.source.unique())
  print(m[['temperatureC','dewPointC','humidityPct','windSpeedKmh','pressureHpa','solarWm2','uvIndex']].describe().round(2).to_string())
  g=m.groupby(m.t.dt.tz_convert('Asia/Karachi').dt.date).agg(tmin=('temperatureC','min'),tmax=('temperatureC','max'),sol=('solarWm2','max'),p=('pressureHpa','mean'),pr=('pressureHpa',lambda x:x.max()-x.min()),w=('windSpeedKmh','max'),n=('temperatureC','size'))
  print(g.round(2).to_string())
  print(m.groupby('pkt').agg(T=('temperatureC','mean'),sol=('solarWm2','mean'),rh=('humidityPct','mean')).round(1).T.to_string())
