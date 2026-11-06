import pandas as pd
d=pd.read_pickle('/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/mtn/acc.pkl')
def pair(a,b):
  A=d[d.id==a].set_index('t')[['o','s','pkt']];B=d[d.id==b].set_index('t')[['o','s']]
  j=A.join(B,rsuffix='_b',how='inner');j['do']=j.o-j.o_b;j['ds']=j.s-j.s_b
  print('==',a,'minus',b,len(j),'obs diff',round(j['do'].mean(),2),'served diff',round(j.ds.mean(),2))
  print(j.groupby(j.pkt//3*3).agg(n=('do','size'),oa=('o','mean'),ob=('o_b','mean'),do=('do','mean'),sa=('s','mean'),sb=('s_b','mean'),ds=('ds','mean')).round(1).T.to_string())
pair('m:gilgit','s:41516');pair('m:danyore','s:41516');pair('m:gilgit','m:danyore');pair('m:khaplu','s:41517')
F='/mnt/user-data/uploads/NIGRAAN/nig/station-lake/archive/fleet/'
p=pd.concat([pd.read_csv(F+'fleet_pairs_2026-09.csv'),pd.read_csv(F+'fleet_pairs_2026-10.csv')])
for k in ['danyore','gilgit','khaplu','Talg']:
  m=p[p.key==k]; print(k,len(m),m.groupby('model_elev_m').hour_utc.agg(['min','max','size']).to_string())
