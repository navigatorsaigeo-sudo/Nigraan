import pandas as pd, json, re, glob, unicodedata
P='/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/Critical PBS Variables/PBS Raw Data/'
LV=('SUB-TEHSIL','SUB-DIVISION','DISTRICT','TEHSIL','TALUKA')
def lvl(n):
    n=str(n).strip()
    if not n.isupper(): return None
    for l in LV:
        if n.endswith(' '+l): return l
    return None
def num(v):
    try: return float(str(v).replace(',','').strip())
    except: return None
def walk(t,pv):
    f=glob.glob(P+f'table_{t}_{pv}_district*.xlsx')[0]; x=pd.read_excel(f,header=None); out=[]; cur=None; dist=None
    for r in x.itertuples(index=False):
        n=r[0]; l=lvl(n) if isinstance(n,str) else None
        if l:
            nm=re.sub(r'\s+',' ',n.strip()[:-len(l)].strip())
            if l=='DISTRICT': dist=nm
            cur={'name':nm,'level':l,'district':dist,'row':list(r),'sub':{}}; out.append(cur); continue
        if cur is not None and isinstance(n,str): cur['sub'].setdefault(re.sub(r'\s+',' ',n.strip().upper()),list(r))
    return out
U={}
def key(pv,d,n,l): return (pv,d,n,l)
for pv in ('punjab','sindh','kp','balochistan'):
    for u in walk('1',pv): U.setdefault(key(pv,u['district'],u['name'],u['level']),{})['areaKm2']=num(u['row'][1]); U[key(pv,u['district'],u['name'],u['level'])]['pop2023']=num(u['row'][2])
    for u in walk('5',pv):
        s=u['sub']; a=s.get('ALL AGES'); u5=s.get('UNDER 5'); o=s.get('65 & ABOVE')
        k=key(pv,u['district'],u['name'],u['level']); U.setdefault(k,{})
        if a and num(a[1]): U[k]['popAge']=num(a[1]); U[k]['under5']=num(u5[1]) if u5 else None; U[k]['age65plus']=num(o[1]) if o else None
    for u in walk('20',pv):
        a=u['sub'].get('ALL LOCALITIES'); k=key(pv,u['district'],u['name'],u['level']); U.setdefault(k,{})
        if a: U[k].update({'households':num(a[1]),'pakka':num(a[2]),'semiPakka':num(a[3]),'kacha':num(a[4])})
    for u in walk('22',pv):
        a=u['sub'].get('ALL LOCALITIES'); k=key(pv,u['district'],u['name'],u['level']); U.setdefault(k,{})
        if a: U[k].update({'hhLighting':num(a[1]),'lightElectricity':num(a[2]),'lightSolar':num(a[3]),'lightOther':num(a[4])})
    for u in walk('16',pv):
        s=u['sub']; p=s.get('POPULATION'); d=s.get('DISABILITY'); k=key(pv,u['district'],u['name'],u['level']); U.setdefault(k,{})
        if p and d: U[k].update({'popDis':num(p[1]),'disability':num(d[1])})
rows=[{'pv':k[0],'district':k[1],'name':k[2],'level':k[3],**v} for k,v in U.items()]
pd.DataFrame(rows).to_csv('/home/claude/nig/census/pbs_units.csv',index=False); print(len(rows)); print(pd.DataFrame(rows).groupby(['pv','level']).size())
