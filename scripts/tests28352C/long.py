import json,sys,collections
p=json.load(open(sys.argv[1])); TH=float(sys.argv[2]) if len(sys.argv)>2 else 300
nodes={n['id']:n for n in p['nodes']}; par={}
for n in p['nodes']:
  for c in n.get('children',[]): par[c]=n['id']
def fr(i):
  cf=nodes[i]['callFrame']; u=cf['url'].split('/')[-1]; return '%s %s:%d'%(cf['functionName'] or '(anon)',u,cf['lineNumber']+1)
def stack(i):
  out=[]
  while i in nodes:
    out.append(fr(i)); i=par.get(i)
    if i is None: break
  return out
S=p['samples']; D=p['timeDeltas']
runs=[]; cur=[]; dur=0
for s,d in zip(S,D):
  f=fr(s)
  if f.startswith('(idle)'):
    if dur>=TH*1000: runs.append((dur,cur))
    cur=[];dur=0
  else: cur.append(s); dur+=d
print('long tasks >=%dms:'%TH, len(runs), 'total', round(sum(r[0] for r in runs)/1000))
agg=collections.Counter()
for dur,ss in sorted(runs,key=lambda x:-x[0])[:25]:
  c=collections.Counter()
  for s in ss:
    st=[x for x in stack(s) if not any(k in x for k in ('mockprovider','(root)','(program)','node:','task_queues','async_hooks','timers','events','_http','processTicks','runMicrotasks','emit'))]
    for x in set(st[:40]): c[x]+=1
  top=[k for k,v in c.most_common(8)]
  print('%6.0f ms | %s'%(dur/1000,' <- '.join(top[:6])))
