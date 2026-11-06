import json, urllib.request, urllib.parse, numpy as np, os, gzip
from pyproj import Transformer
U=[u for u in json.load(open('/home/claude/nig/nigraan-local/server/contract/units.json')) if u.get('lat') is not None and not u.get('disputed')]
KEY=open('/home/claude/nig/nigraan-local/mach.key').read().strip()
if not os.path.exists('model.json.gz'):
    M={}
    for i in range(0,len(U),40):
        b=U[i:i+40]; q={'latitude':','.join(str(u['lat']) for u in b),'longitude':','.join(str(u['lon']) for u in b),'start_date':'2025-06-01','end_date':'2025-09-30','hourly':'soil_moisture_0_to_7cm','timezone':'Asia/Karachi','apikey':KEY}
        r=json.load(urllib.request.urlopen('https://customer-archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(q),timeout=300)); r=r if isinstance(r,list) else [r]
        for u,x in zip(b,r):
            v=np.array([np.nan if y is None else y for y in x['hourly']['soil_moisture_0_to_7cm']]).reshape(-1,24); M[u['unitId']]=np.nanmean(v[:,5:8],1).round(4).tolist()
        print(i,flush=True)
    json.dump(M,gzip.open('model.json.gz','wt'))
M=json.load(gzip.open('model.json.gz','rt'))
z=np.load('sm.npz',allow_pickle=True)['out'].item(); days=sorted(z); r0,r1,c0,c1=np.load('rc.npy')
tr=Transformer.from_crs(4326,6933,always_xy=True); cell=9008.055210146; x0=-17367530.44516138; y0=7314540.83063815
import datetime as dt
alld=[(dt.date(2025,6,1)+dt.timedelta(i)).isoformat() for i in range(122)]
res=[]; per={}
for u in U:
    x,y=tr.transform(u['lon'],u['lat']); c=int((x-x0)//cell)-c0; r=int((y0-y)//cell)-r0
    s=np.array([np.nanmean(z[d][max(0,r-1):r+2,max(0,c-1):c+2]) if d in z else np.nan for d in alld])
    m=np.array(M[u['unitId']]); ok=~np.isnan(s)&~np.isnan(m)
    if ok.sum()<30: continue
    rr=np.corrcoef(s[ok],m[ok])[0,1]
    # anomaly correlation: remove 15-day running mean (seasonal cycle)
    def anom(a):
        k=np.ones(15)/15; f=np.convolve(np.nan_to_num(a,nan=np.nanmean(a)),k,'same'); return a-f
    sa,ma=anom(np.where(ok,s,np.nan)),anom(np.where(ok,m,np.nan)); ok2=~np.isnan(sa)&~np.isnan(ma)
    ra=np.corrcoef(sa[ok2],ma[ok2])[0,1]
    per[u['unitId']]={'r':round(float(rr),3),'rAnom':round(float(ra),3),'n':int(ok.sum()),'biasSmapMinusModel':round(float(np.nanmean(s[ok]-m[ok])),3)}
R=np.array([v['r'] for v in per.values()]); RA=np.array([v['rAnom'] for v in per.values()]); B=np.array([v['biasSmapMinusModel'] for v in per.values()])
prov={}
for k,v in per.items(): prov.setdefault(k.split('|')[0],[]).append(v['r'])
out={'period':'2025-06-01..2025-09-30','smap':'SPL3SMP_E v006 9 km, AM+PM mean, 3x3 pixels at the tehsil point','model':'ERA5 0-7 cm daily mean (archive)','tehsils':len(per),
 'rMedian':round(float(np.nanmedian(R)),3),'rAnomMedian':round(float(np.nanmedian(RA)),3),'shareRAbove0_6':round(float(np.mean(R>0.6)),3),'biasMedian':round(float(np.nanmedian(B)),3),
 'rByProvince':{k:round(float(np.nanmedian(v)),3) for k,v in prov.items()}}
json.dump({'summary':out,'units':per},open('result.json','w'),indent=1); print(json.dumps(out,indent=1))
