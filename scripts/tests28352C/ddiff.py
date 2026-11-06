import json,sys,os,collections
A,B=sys.argv[1],sys.argv[2]
VOL={'assembledAt','completedAt','madeAt','made','shown','version','answerId','stamp','chainId','digest','snapshot','ms','at','self'}
def walk(x,y,p,out):
  if isinstance(x,dict) and isinstance(y,dict):
    for k in set(x)|set(y):
      if k in VOL: continue
      if k not in x or k not in y: out.append(p+'/'+k+(' (only A)' if k in x else ' (only B)')); continue
      walk(x[k],y[k],p+'/'+k,out)
  elif isinstance(x,list) and isinstance(y,list):
    if len(x)!=len(y): out.append(p+' len %d vs %d'%(len(x),len(y))); return
    for i,(a,b) in enumerate(zip(x,y)): walk(a,b,p+'[]',out)
  elif x!=y: out.append(p+' = %s | %s'%(json.dumps(x)[:70],json.dumps(y)[:70]))
c=collections.Counter(); ex={}
for f in sorted(os.listdir(A)):
  if not os.path.exists(os.path.join(B,f)) or f.endswith('.px.json'): continue
  x=json.load(open(os.path.join(A,f))); y=json.load(open(os.path.join(B,f))); out=[]; walk(x,y,'',out)
  for o in out:
    key=o.split(' ')[0]; c[key]+=1; ex.setdefault(key,(f,o))
for k,v in c.most_common(40): print(v, ex[k][0], ex[k][1][:230])
