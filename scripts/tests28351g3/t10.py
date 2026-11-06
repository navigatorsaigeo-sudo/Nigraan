# v283.51g3 · 10 places (incl. Clifton, Mithi, Gilgit) against a test server (NIG_BASE, default http://127.0.0.1:8931):
# report linter, no action time in the past, Mithi landslide wording from applicability, no table header without 2 rows at a page foot,
# the station-check sentence where the site row carries one, /api/report/past30 answers. usage: python3 t10.py
import json,sys,re,time,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from t30lib import post,get
from rtxt import text
IDS=['S0','S1','S2','S3','S4','M1','C1','R42','R45','R00']
P={p['id']:p for p in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'places30.json')))}
MON={m:i+1 for i,m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
def orphans(h):
    bad=[]; pages=re.findall(r'<section class="pg"[^>]*data-page="(\d+)"[^>]*>(.*?)</section>',h,re.S)
    for k,(n,b) in enumerate(pages):
        heads=[float(y) for y in re.findall(r'<rect x="34" y="([\d.]+)" width="527.28" height="15" fill="#DCEBEC"/>',b)]
        seps=[float(y) for y,y2 in re.findall(r'<path d="M34 ([\d.]+)L561.28 ([\d.]+)" fill="none" stroke="#D5DCD6"',b)]
        nxt=pages[k+1][1] if k+1<len(pages) else ''
        nxt_head=[float(y) for y in re.findall(r'<rect x="34" y="([\d.]+)" width="527.28" height="15" fill="#DCEBEC"/>',nxt)]
        cont=bool(nxt_head) and min(nxt_head)<90
        for i,y in enumerate(heads):
            end=heads[i+1] if i+1<len(heads) else 1e9; rows=len([s for s in seps if y<s<end])
            if rows==0 or (rows<2 and i==len(heads)-1 and cont): bad.append('page %s header at y=%.0f with %d row(s)'%(n,y,rows))
    return bad
now=time.time()+5*3600; tg=time.gmtime(now); fails=0
for i in IDS:
    p=P[i]; t0=time.time(); j=post({'lat':p['lat'],'lon':p['lon'],'kind':'site_assessment','section':'test'})
    if not j.get('ok'): print('FAIL gen',i,str(j)[:200]); fails+=1; continue
    st,h=get(j['html'],{'x-agn-view':'customer'}); T=text(h); flat=T.replace('\n',' ')
    past=[]
    for m in re.finditer(r'Ready by \w{3} (\d+) (\w{3})(?:, (\d\d):(\d\d))?',flat):
        d=(MON[m.group(2)],int(m.group(1))); today=(tg.tm_mon,tg.tm_mday)
        if d<today or (d==today and m.group(3) and int(m.group(3))*60+int(m.group(4))<tg.tm_hour*60+tg.tm_min): past.append(m.group(0))
    pa=json.loads(get('/api/point?lat=%s&lon=%s&complete=1&with=siteRisk'%(p['lat'],p['lon']),{'x-agn-view':'operator'})[1])
    s=json.dumps(pa); sc=re.search(r'"stationCheck": (\{[^}]*\})',s); sc=json.loads(sc.group(1)) if sc else None
    heatline=('station-check offset' in flat) if sc and sc.get('offsetC') else ('coastal group of the station check' in flat) if sc and sc.get('group')=='coast' else ('station-check' not in flat)
    ls_ok=True
    if i=='M1': ls_ok=bool(re.search(r'Landslide \(no local steep ground; debris from nearby slopes\s+possible\)',flat)) and 'Landslide (no level issued' not in flat
    st30,b30=get('/api/report/past30?lat=%s&lon=%s'%(p['lat'],p['lon']),{'x-agn-view':'customer'}); j30=json.loads(b30)
    chk={'lint':j['lint']['ok'],'noPastActionTime':not past,'noOrphanHeader':not orphans(h),'stationCheckLine':heatline,'landslideWording':ls_ok,'past30':st30==200 and ('ok' in j30)}
    ok=all(chk.values()); fails+=0 if ok else 1
    print(('PASS ' if ok else 'FAIL ')+i,p['name'][:24],round(time.time()-t0,1),'s',j['pages'],'pages',chk,('past: %s'%past if past else ''),('orphans: %s'%orphans(h) if orphans(h) else ''),('stationCheck %s'%sc if sc else ''),flush=True)
print('\n%s t10: %d of %d places pass'%('FAIL' if fails else 'PASS',len(IDS)-fails,len(IDS))); sys.exit(1 if fails else 0)
