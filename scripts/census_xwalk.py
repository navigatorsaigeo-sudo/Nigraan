import pandas as pd, json, re, difflib
R=pd.read_csv('pbs_units.csv')
U=[u for u in json.load(open('/home/claude/nig/nigraan-local/server/contract/units.json')) if not u.get('disputed')]
PV={'Punjab':'punjab','Sindh':'sindh','Khyber Pakhtunkhwa':'kp','Balochistan':'balochistan','Islamabad Capital Territory':'punjab','Federal Capital':'punjab'}
norm=lambda s: re.sub(r'[^a-z]','',str(s).lower().replace('saddar','sadar').replace('city','').replace('tehsil',''))
# merge records with same (pv, district, normalized name): tables can spell the same unit differently
R['nk']=R.name.map(norm); R['dk']=R.district.map(norm)
agg=R.groupby(['pv','dk','nk','level'],as_index=False).first()
def best(cands,name):
    if not len(cands): return None,0
    sc=[(difflib.SequenceMatcher(None,norm(name),c).ratio(),i) for i,c in zip(cands.index,cands.nk)]; s,i=max(sc); return i,s
out={}; stats={'tehsil':0,'subdiv':0,'district':0,'none':0}
for u in U:
    pv=PV.get(u['province']); 
    if not pv: stats['none']+=1; continue
    D=agg[agg.pv==pv]; dk=norm(u['district'])
    dmatch=D[D.level=='DISTRICT']; di,ds=best(dmatch,u['district'])
    dkey=dmatch.loc[di,'dk'] if di is not None and ds>=0.8 else None
    C=D[(D.dk==dkey)&(D.level!='DISTRICT')] if dkey else D[D.level!='DISTRICT']
    i,s=best(C,u['tehsil'])
    if i is not None and s>=0.85:
        r=C.loc[i]; how='tehsil' if r.level in ('TEHSIL','TALUKA') else 'subdiv'
    elif dkey is not None and sum(1 for v in U if v['district']==u['district'])==1:
        r=dmatch.loc[di]; how='district'
    else:
        r=dmatch.loc[di] if dkey is not None else None; how='districtShareOnly' if r is not None else 'none'
    stats[how]=stats.get(how,0)+1
    if r is None: continue
    g=lambda k: (None if pd.isna(r.get(k)) else float(r.get(k)))
    sh=lambda a,b: (round(g(a)/g(b),4) if g(a) is not None and g(b) else None)
    rec={'match':how,'pbsName':r['name']+' '+r['level'].title(),'pbsDistrict':r['district'],
         'under5Share':sh('under5','popAge'),'age65Share':sh('age65plus','popAge'),'kachaShare':sh('kacha','households'),'semiPakkaShare':sh('semiPakka','households'),
         'noGridLightingShare':(round(1-g('lightElectricity')/g('hhLighting'),4) if g('lightElectricity') is not None and g('hhLighting') else None),'disabilityShare':sh('disability','popDis')}
    if how in ('tehsil','subdiv','district'): rec.update({'pop2023':g('pop2023'),'areaKm2':g('areaKm2'),'households':g('households')})
    out[u['unitId']]=rec
json.dump({'built':'2026-10-04','source':'Pakistan Bureau of Statistics, 7th Population and Housing Census 2023, district tables 1, 5, 16, 20 and 22 (Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan; user-supplied)',
 'method':'PBS tehsil, taluka, sub-division and sub-tehsil rows matched to the 577 NIGRAAN tehsils by district and name (string similarity >= 0.85); a NIGRAAN tehsil that is a whole district takes the district row; otherwise shares are the district figure (match = districtShareOnly) and no count is given',
 'stats':stats,'units':out},open('/home/claude/nig/nigraan-local/data/census-tehsil.json','w'),indent=1)
print(stats); import collections; print([ (u['unitId']) for u in U if out.get(u['unitId'],{}).get('match') in (None,'districtShareOnly')][:25])
