import pandas as pd,numpy as np
F='/mnt/user-data/uploads/NIGRAAN/nig/station-lake/archive/fleet/'
p=pd.concat([pd.read_csv(F+'fleet_pairs_2026-09.csv'),pd.read_csv(F+'fleet_pairs_2026-10.csv')]).drop_duplicates(['key','hour_utc'],keep='last')
p['h']=pd.to_datetime(p.hour_utc);p['day']=(p.h+pd.Timedelta(hours=5)).dt.date
g=p.groupby(['key','day']).agg(n=('temp_c','size'),orng=('temp_c',lambda x:x.max()-x.min()),frng=('fc_raw_c',lambda x:x.max()-x.min()))
g=g[(g.n>=20)&(g.frng>0)];g['r']=np.maximum(g.orng,0.1)/g.frng
lr=np.log(g.r);q1,q3=lr.quantile(.25),lr.quantile(.75);fence=np.exp(q1-3*(q3-q1))
print('station-days',len(g),'fence',round(fence,3),'median ratio',round(g.r.median(),2))
for k in ['khaplu','gilgit','danyore','al_jazari','mach1']:
  if k in g.index.get_level_values(0): print(k, g.loc[k].r.round(2).tolist())
print('days below fence by station'); print(g[g.r<fence].groupby(level=0).size().sort_values(ascending=False).head(10).to_string())
