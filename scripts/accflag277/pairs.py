import json,gzip,math,sys,collections
import pandas as pd
APP='/tmp/claude-0/v277/srv_acc'; ACC='/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data/accmon'
C=[];seen=set()
for line in gzip.open(APP+'/data/pk-places.tsv.gz','rt',encoding='utf8'):
  c=line.rstrip('\n').split('\t')
  if len(c)<7 or c[5] not in('PPLC','PPLA','PPLA2'): continue
  try: lat=float(c[3]);lon=float(c[4])
  except: continue
  n=c[1] or c[0]
  if n in seen: continue
  seen.add(n);C.append((n,lat,lon))
def km(a,b,c,d):
  p=math.pi/180;x=math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2;return 12742*math.asin(math.sqrt(x))
meta={};rows=[]
for f in ['2026-09.jsonl','2026-10.jsonl']:
  for l in open(ACC+'/'+f):
    j=json.loads(l)
    if j['ty']=='m': meta[j['id']]=j
    elif j['ty']=='h':
      for id_,o,s in j['p']: rows.append((j['t'],j['src'],id_,o/10,s/10))
df=pd.DataFrame(rows,columns=['t','src','id','o','s']);df['t']=pd.to_datetime(df['t']);df['e']=df.s-df.o
M=pd.DataFrame(meta.values()).set_index('id')
M['cities']=[ [n for n,la,lo in C if km(r.lat,r.lon,la,lo)<=40] for r in M.itertuples()]
df=df.join(M[['name','lat','lon','kind','zone','cities']],on='id')
df.to_pickle('/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/acc277/pairs.pkl')
print(len(df), df.t.min(), df.t.max(), df.id.nunique())
for city in ['Bahawalpur','Umarkot','Chakwal','Hyderabad','Mirpur Khas']:
  m=df[df.cities.apply(lambda x: city in x)]
  print('\n==',city); print(m.groupby(['id','name','kind']).agg(n=('e','size'),bias=('e','mean'),mae=('e',lambda x:x.abs().mean()),first=('t','min'),last=('t','max')).round(2).to_string())
