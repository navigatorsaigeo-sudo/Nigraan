import json,pandas as pd
d=pd.read_pickle('/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/mtn/acc.pkl')
S=json.load(open('/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data/cache/synop-recent.json'))
for sid in ['41517','41519','41518','41516']:
  c=pd.DataFrame([(pd.Timestamp(t),v['o'],v['s']) for t,v in S[sid].items()],columns=['t','o2','s0']).set_index('t')
  a=d[d.id=='s:'+sid].set_index('t')
  j=a.join(c,how='left')
  j['day']=(j.index+pd.Timedelta(hours=5)).date
  j['e0']=j.s0-j.o; j['term']=j.s-j.s0
  g=j.groupby('day').agg(n=('e','size'),obs=('o','mean'),bias=('e','mean'),mae=('e',lambda x:x.abs().mean()),bias_nolive=('e0','mean'),synop_live_terms=('term','mean'))
  print('== s:'+sid);print(g.round(2).to_string())
