import json,numpy as np,pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
exec(open('study.py').read().split("SETS=")[0])   # builds df
# v91.17.153 · labels without permanent water: the client extents include river channels and standing water bodies
# (Rivers + Water Bodies Inventory polygons removed; 46 of 1832 tehsil-seasons change; held-out AUC 0.76 -> 0.77)
S={y:json.load(open(f'/home/claude/nig/flood2010/share_{y}.json')) for y in (2010,2014,2022,2025)}
df['y']=[int(S[y].get(u,0)>=0.01) for u,y in zip(df.u,df.yr)]
# v91.17.153 · distance to the main rivers (Rivers polygons, user data): log(1 + median distance in km over the tehsil, 250 m grid)
RD=json.load(open('/home/claude/nig/floodstudy/river_dist.json')); df['riverDist']=[np.log1p(RD.get(u,{}).get('riverDistMedKm',np.nan)) for u in df.u]; df=df.dropna()
cols=['hand_major','hand_local','cn2','imperv','sponge','twi10','area','riverDist']
U=df.groupby('u')[cols].first()
# leave-one-year-out skill of the land-only model (as in study.py)
P=np.zeros(len(df))
for yr in df.yr.unique():
    te=(df.yr==yr).values; X=df[cols].values; mu=X[~te].mean(0); sd=X[~te].std(0)+1e-9
    m=LogisticRegression(max_iter=2000).fit((X[~te]-mu)/sd,df.y.values[~te]); P[te]=m.predict_proba((X[te]-mu)/sd)[:,1]
auc=roc_auc_score(df.y,P)
X=df[cols].values; mu=X.mean(0); sd=X.std(0); m=LogisticRegression(max_iter=2000).fit((X-mu)/sd,df.y)
p=m.predict_proba((U.values-mu)/sd)[:,1]
# reliability by fifths of predicted chance, pooled held-out predictions
q=pd.qcut(P,5,labels=False); rel=[{'band':int(b),'predicted':round(float(P[q==b].mean()),3),'observed':round(float(df.y.values[q==b].mean()),3),'n':int((q==b).sum())} for b in range(5)]
hist=df.groupby('u').y.agg(['sum','size'])
out={'version':'fsusc-91.17.153','labels':'mapped flood water outside river channels and permanent water bodies (Rivers and Water Bodies Inventory polygons removed), at least 1 % of the tehsil','built':'2026-10-04',
 'what':'Chance that a monsoon flood season leaves mapped standing water on at least 1 % of the tehsil, from its ground alone (standing susceptibility, not a forecast).',
 'method':'Logistic regression on the share of the tehsil within 2 m and 2-5 m of the nearest river and of the nearest local drain (HAND, 30 m), the curve number (soil group and land cover, with the built-up share as impervious), the built-up share, the soil storage S, the share with topographic wetness index above 10, and the tehsil area; target: flooded share >= 1 % in the mapped flood extents of 2010, 2014, 2022 and 2025 (458 tehsils x 4 seasons).',
 'test':{'design':'each season held out in turn','auc':round(float(auc),3),'reliability':rel,'withRainAuc':0.863,'riverDistanceGain':'+0.034 AUC (95 % 0.022-0.046, resampling tehsils)','rainOnlyAuc':0.593,
   'finding':'Low, flat, converging ground (wetness index, height above drainage) explains where floods were mapped far better than local rain (AUC 0.59): plains floods come down the rivers. The built-up share adds nothing measurable here, because satellite flood maps miss shallow, short urban flooding; its effect on city flooding is not tested by this record.'},
 'features':cols,'mean':[round(float(x),5) for x in mu],'sd':[round(float(x),5) for x in sd],'coef':[round(float(x),4) for x in m.coef_[0]],'intercept':round(float(m.intercept_[0]),4),
 'units':{u:{'p':round(float(pp),3),'mappedSeasons':int(hist.loc[u,'sum']),'of':int(hist.loc[u,'size'])} for u,pp in zip(U.index,p)}}
json.dump(out,open('/home/claude/nig/nigraan-local/data/flood-susceptibility.json','w'),indent=1)
print('auc',round(auc,3),rel); print(sorted(out['units'].items(),key=lambda x:-x[1]['p'])[:5])
