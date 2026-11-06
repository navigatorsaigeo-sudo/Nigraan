import json,glob,pandas as pd,numpy as np
S=json.load(open('/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data/cache/synop-recent.json'))
d=pd.concat([pd.read_csv(f) for f in sorted(glob.glob('/mnt/user-data/uploads/LAMHA/data/mach/db/obs_2026*.csv'))])
d['t']=pd.to_datetime(d.time,format='mixed',utc=True)
def near(k):
  m=d[d.stationKey==k].set_index('t').sort_index()
  return m
def synop(sid): return pd.DataFrame([(pd.Timestamp(t),v['o'],v['td']) for t,v in S[sid].items()],columns=['t','T','Td']).set_index('t')
def cmp(k,sid):
  m=near(k);s=synop(sid);rows=[]
  for t,r in s.iterrows():
    w=m[(m.index>=t-pd.Timedelta(minutes=30))&(m.index<=t+pd.Timedelta(minutes=30))]
    if len(w): rows.append((t,r['T'],r['Td'],w.temperatureC.mean(),w.dewPointC.mean()))
  j=pd.DataFrame(rows,columns=['t','sT','sTd','mT','mTd']);j['day']=(j.t+pd.Timedelta(hours=5)).dt.date
  g=j.groupby('day').agg(n=('sT','size'),sMean=('sT','mean'),mMean=('mT','mean'),sRng=('sT',lambda x:x.max()-x.min()),mRng=('mT',lambda x:x.max()-x.min()),sTd=('sTd','mean'),mTd=('mTd','mean'))
  g=g[g.n>=6];g['ratio']=g.mRng/g.sRng
  print('==',k,'vs',sid);print(g.round(2).to_string())
  print('slope of daily mean over days: station %.2f, synop %.2f C/day'%(np.polyfit(range(len(g)),g.mMean,1)[0],np.polyfit(range(len(g)),g.sMean,1)[0]))
  return g
a=cmp('khaplu','41517');b=cmp('gilgit','41516');c=cmp('danyore','41516')
