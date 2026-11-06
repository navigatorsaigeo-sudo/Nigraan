import json,sys,re,time,urllib.request
sys.path.insert(0,'.'); from rtxt import text
B='http://127.0.0.1:8921'
def post(q,view='customer'):
    r=urllib.request.Request(B+'/api/report/generate',data=json.dumps(q).encode(),headers={'content-type':'application/json','x-agn-view':view})
    try: return json.load(urllib.request.urlopen(r,timeout=300))
    except urllib.error.HTTPError as e: return json.load(e)
def get(p,h={}):
    r=urllib.request.Request(B+p,headers=h)
    try: x=urllib.request.urlopen(r,timeout=120); return x.status,x.read().decode('utf8','replace')
    except urllib.error.HTTPError as e: return e.code,e.read().decode()
P=json.load(open('places30.json')); only=sys.argv[1:] 
res=[];fails=0
for p in P:
    if only and p['id'] not in only: continue
    t0=time.time(); j=post({'lat':p['lat'],'lon':p['lon'],'kind':'site_assessment','section':'test'})
    if not j.get('ok'): print('FAIL gen',p['id'],str(j)[:200]); fails+=1; continue
    st,h=get(j['html'],{'x-agn-view':'customer'}); T=text(h); open('txt_%s.txt'%p['id'],'w').write(T)
    iss=re.search(r'Issued (\d+) Nov 2026, (\d\d):(\d\d) PKT',T); now=time.gmtime(time.time()+5*3600)
    dmin=abs((int(iss.group(2))*60+int(iss.group(3)))-(now.tm_hour*60+now.tm_min)) if iss else 999
    chk={'lint':j['lint']['ok'],'issued_now':dmin<=2,'noLowGuid':not re.search(r'Why: \w[\w ]* Low\b',T.replace('\n',' ')) or 'Standing' in T}
    res.append((p['id'],p['name'],round(time.time()-t0,1),chk))
    print(p['id'],p['name'][:22],round(time.time()-t0,1),'s',chk, flush=True)
