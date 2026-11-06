import json,os,sys
A,B=sys.argv[1],sys.argv[2]; same=diff=0; pxs=pxd=0; dl=[]
VOL={'assembledAt','completedAt','madeAt','made','shown','version','answerId','stamp','chainId','digest','snapshot','ms','at','self'}
def strip(x):
  if isinstance(x,list): return [strip(v) for v in x]
  if isinstance(x,dict): return {k:strip(v) for k,v in x.items() if k not in VOL}
  return x
for f in sorted(os.listdir(A)):
  if f.endswith('.px.json'):
    if open(os.path.join(A,f),'rb').read()==open(os.path.join(B,f),'rb').read(): pxs+=1
    else: pxd+=1
  elif '.point.' in f:
    a=json.load(open(os.path.join(A,f))); b=json.load(open(os.path.join(B,f)))
    for k in ('now','hours','days','heat','source','point','area','confidence','station','urban','build','place'):
      if json.dumps(strip(a.get(k)),sort_keys=True)==json.dumps(strip(b.get(k)),sort_keys=True): same+=1
      else: diff+=1; dl.append(f+':'+k)
print('px (served forecast) bytes identical', pxs, 'different', pxd); print('record blocks identical', same, 'different', diff, dl[:10])
