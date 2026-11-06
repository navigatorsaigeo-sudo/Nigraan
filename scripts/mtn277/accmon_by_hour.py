import json,pandas as pd
A='/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data/accmon/'
rows=[]
for f in ['2026-09.jsonl','2026-10.jsonl']:
  for l in open(A+f):
    j=json.loads(l)
    if j['ty']=='h':
      for i,o,s in j['p']: rows.append((j['t'],i,o/10,s/10))
d=pd.DataFrame(rows,columns=['t','id','o','s']);d['t']=pd.to_datetime(d.t);d=d.drop_duplicates(['t','id'],keep='last')
d['e']=d.s-d.o;d['pkt']=(d.t.dt.hour+5)%24
d.to_pickle('/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/mtn/acc.pkl')
ids=['m:khaplu','s:41517','m:gilgit','m:danyore','s:41516','s:41518','s:41519','s:41506','s:41515']
for i in ids:
  m=d[d.id==i]
  print('==',i,len(m),m.t.min(),m.t.max(),'bias',round(m.e.mean(),2),'mae',round(m.e.abs().mean(),2))
  print(m.groupby(m.pkt//3*3).agg(n=('e','size'),o=('o','mean'),s=('s','mean'),e=('e','mean')).round(1).T.to_string())
# Khaplu vs Skardu obs same hour
k=d[d.id=='m:khaplu'].set_index('t');s=d[d.id=='s:41517'].set_index('t')
j=k.join(s,rsuffix='_sk',how='inner')
print('khaplu-skardu same hours',len(j));print(j.groupby('pkt').agg(kh=('o','mean'),sk=('o','mean'),khs=('s','mean'),sks=('s_sk','mean')).round(1).T.to_string())
