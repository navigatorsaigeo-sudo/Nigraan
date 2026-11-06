import re,urllib.request,urllib.parse,json,numpy as np,netCDF4 as nc,os,datetime as dt,time
t=open('/home/claude/nig/nigraan-local/earthdata.key').read(); tok=max(re.findall(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',t),key=len)
r0,r1,c0,c1=np.load('rc.npy')
d=dt.date(2025,6,1); out={}
if os.path.exists('sm.npz'): z=np.load('sm.npz',allow_pickle=True); out=z['out'].item()
while d<=dt.date(2025,9,30):
    k=d.isoformat()
    if k in out: d+=dt.timedelta(1); continue
    q=json.load(urllib.request.urlopen(f"https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SPL3SMP_E&version=006&temporal={k}T00:00:00Z,{k}T23:59:59Z&page_size=5"))
    ts=[e['title'] for e in q['feed']['entry'] if e['title'].endswith('.h5')]
    if not ts: print('none',k); d+=dt.timedelta(1); continue
    base='https://opendap.earthdata.nasa.gov/collections/C2938664763-NSIDC_CPRD/granules/'+ts[0]
    ce=f'/Soil_Moisture_Retrieval_Data_AM/soil_moisture[{r0}:1:{r1}][{c0}:1:{c1}];/Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm[{r0}:1:{r1}][{c0}:1:{c1}]'
    for tr in range(3):
        try:
            b=urllib.request.urlopen(urllib.request.Request(base+'.dap.nc4?dap4.ce='+urllib.parse.quote(ce,safe=''),headers={'Authorization':'Bearer '+tok}),timeout=300).read(); break
        except Exception as e: print('retry',k,e); time.sleep(5)
    else: d+=dt.timedelta(1); continue
    open('tmp.nc4','wb').write(b); D=nc.Dataset('tmp.nc4')
    def get(g,n):
        for kk,v in g.variables.items():
            if kk.endswith(n): return np.ma.filled(v[:].astype(float),np.nan)
        for gg in g.groups.values():
            r=get(gg,n)
            if r is not None: return r
    am=get(D,'soil_moisture'); pm=get(D,'soil_moisture_pm'); am[am<0]=np.nan; pm[pm<0]=np.nan
    out[k]=np.nanmean(np.stack([am,pm]),0).astype('float32'); D.close()
    np.savez_compressed('sm.npz',out=np.array(out,dtype=object)); print(k,flush=True); d+=dt.timedelta(1)
