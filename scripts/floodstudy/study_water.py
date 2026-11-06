import json,numpy as np,pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
D='/home/claude/nig/nigraan-local/data/'
FX=json.load(open(D+'flood-extent-calibration.json'))['sets']
_C=json.load(open(D+'cn-tehsil.json')); CN=_C.get('units') or _C.get('tehsils'); HD=json.load(open(D+'hand-tehsil.json'))
H=HD.get('units') or {k:v for k,v in HD.items() if isinstance(v,dict) and 'local' in v}
if not H:
    for k in HD:
        if isinstance(HD[k],dict) and len(HD[k])>400: H=HD[k]; break
R=json.load(open('rain_jas.json')); WF=json.load(open('water_feats.json'))
rows=[]
for yr,key in ((2010,'pk2010'),(2014,'pk2014'),(2022,'pk2022'),(2025,'pk2025')):
    for u,v in FX[key]['units'].items():
        if u not in R or u not in CN or u not in H: continue
        r=np.array([x if x is not None else np.nan for x in R[u][str(yr)]],float)
        if np.isnan(r).mean()>0.1: continue
        r=np.nan_to_num(r); r3=np.convolve(r,np.ones(3),'valid')
        c=CN[u]; h=H[u]
        rows.append(dict(u=u,yr=yr,y=int((v.get('floodedShare') or 0)>=0.01),share=v.get('floodedShare') or 0,
          tot=np.log1p(r.sum()),mx1=np.log1p(r.max()),mx3=np.log1p(r3.max()),
          hand_major=h['major']['lt2']+h['major']['b2_5'],hand_local=h['local']['lt2'],twi10=h.get('twi',{}).get('shareOver10',np.nan),
          cn2=c['cn2'],imperv=c['impervious_share'],sponge=np.log(c['s2_mm']),area=np.log(c['areaKm2']),
          stream=WF.get(u,{}).get('streamDensity',np.nan),canal=np.log1p(10*WF.get(u,{}).get('canalDensity',np.nan)),drain=np.log1p(100*WF.get(u,{}).get('drainShare',np.nan)),water=np.log1p(100*WF.get(u,{}).get('waterShare',np.nan)),mogha=np.log1p(10*WF.get(u,{}).get('moghaDensity',np.nan))))
print(len(rows), rows[0] if rows else None); df=pd.DataFrame(rows).dropna(); print(len(df), df.groupby('yr').y.agg(['size','sum']).to_dict())
# within-unit normal: rain relative to the unit's own 4-year mean (rarity proxy, computed without the target)
for c in ('tot','mx1','mx3'): df[c+'_rel']=df[c]-df.groupby('u')[c].transform('mean')
B=['tot','mx3','mx1','hand_major','hand_local','cn2','imperv','sponge','twi10','area']
SETS={'base (v151 full)':B,'base+drainage channels':B+['drain'],'base+canals+outlets':B+['canal','mogha'],'base+stream density':B+['stream'],'base+water bodies':B+['water'],
 'base+all water':B+['drain','canal','mogha','stream','water'],'land only (v151)':B[3:],'land only+all water':B[3:]+['drain','canal','mogha','stream','water'],'rain':['tot','mx3','mx1'],
 'rain+lowground(HAND)':['tot','mx3','mx1','hand_major','hand_local'],
 'rain+HAND+built/sponge(CN)':['tot','mx3','mx1','hand_major','hand_local','cn2','imperv','sponge'],
 'rain+HAND+CN+TWI+area':['tot','mx3','mx1','hand_major','hand_local','cn2','imperv','sponge','twi10','area'],
 'land only (no rain)':['hand_major','hand_local','cn2','imperv','sponge','twi10','area']}
res={}
for name,cols in SETS.items():
    P=np.zeros(len(df))
    for yr in df.yr.unique():
        te=(df.yr==yr).values; X=df[cols].values; mu=X[~te].mean(0); sd=X[~te].std(0)+1e-9
        m=LogisticRegression(C=1.0,max_iter=2000).fit((X[~te]-mu)/sd,df.y.values[~te]); P[te]=m.predict_proba((X[te]-mu)/sd)[:,1]
    y=df.y.values; auc=roc_auc_score(y,P); br=brier_score_loss(y,P); clim=brier_score_loss(y,np.full(len(y),y.mean()))
    peryr={int(yr):round(roc_auc_score(df.y[df.yr==yr],P[(df.yr==yr).values]),3) for yr in df.yr.unique() if df.y[df.yr==yr].nunique()>1}
    res[name]=dict(auc=round(auc,3),brier=round(br,4),bss=round(1-br/clim,3),aucByYearHeldOut=peryr)
    print(f'{name:32s} AUC {auc:.3f} BSS {1-br/clim:.3f} {peryr}')

json.dump(res,open('results_water.json','w'),indent=1)
# paired bootstrap by tehsil for the AUC gain of all water layers
def oof(cols):
    P=np.zeros(len(df))
    for yr in df.yr.unique():
        te=(df.yr==yr).values; X=df[cols].values; mu=X[~te].mean(0); sd=X[~te].std(0)+1e-9
        m=LogisticRegression(C=1.0,max_iter=2000).fit((X[~te]-mu)/sd,df.y.values[~te]); P[te]=m.predict_proba((X[te]-mu)/sd)[:,1]
    return P
pa=oof(B); pb=oof(B+['drain','canal','mogha','stream','water']); us=df.u.unique(); rng=np.random.default_rng(3); g=[]
idx={u:np.where(df.u.values==u)[0] for u in us}
for _ in range(400):
    s_=np.concatenate([idx[u] for u in rng.choice(us,len(us))]); yy=df.y.values[s_]
    g.append(roc_auc_score(yy,pb[s_])-roc_auc_score(yy,pa[s_]))
print('AUC gain all water: mean %.3f 95%% [%.3f, %.3f]'%(np.mean(g),*np.percentile(g,[2.5,97.5])))
m=LogisticRegression(C=1.0,max_iter=2000); cols=B+['drain','canal','mogha','stream','water']; X=df[cols].values; mu=X.mean(0); sd=X.std(0); m.fit((X-mu)/sd,df.y); print(dict(zip(cols,np.round(m.coef_[0],3))))
