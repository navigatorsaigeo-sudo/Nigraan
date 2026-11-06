"""Independent spatial test of the served 30 m landslide susceptibility (trained on 73 NASA-catalogue events, 2007-2017)
against the user-supplied GB inventory (Landslide_events.shp, located events of any year) and COOLR HKH events not in the NASA catalogue.
Tehsil level: AUC of relDensity for 'tehsil has >=1 independent event' (all tehsils; and mountain tehsils only, s25 >= 0.1)."""
import json, numpy as np, pandas as pd, geopandas as gpd
from sklearn.metrics import roc_auc_score
U = '/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/GB_Landslide_layers/Landslide_inventory/'
T = gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json'); print(T.columns.tolist()[:10], len(T))
LS = json.load(open('/home/claude/nig/nigraan-local/data/landslide-susceptibility30.json'))['units']
e = gpd.read_file(U + 'Landslide_points/Landslide_events.shp'); e = e[~e.Data_Quali.isin(['regional', '50km', '100km', '25km'])]
A = gpd.GeoDataFrame({'src': 'gb_inventory', 'trig': e.Trigger.astype(str)}, geometry=gpd.points_from_xy(e.Longitude.astype(float), e.Latitude.astype(float)), crs=4326)
l = pd.read_csv(U + 'LS_inven.csv'); l = l[l.src_dataset == 'coolr_hkh_export']
glc = pd.read_csv('/home/claude/nig/landslide/glc.csv', low_memory=False); g2 = glc[glc.country_name == 'Pakistan']
# drop COOLR points within 2 km of a NASA-catalogue Pakistan point (already in training)
from scipy.spatial import cKDTree
kd = cKDTree(np.c_[g2.latitude, g2.longitude]); d, _ = kd.query(np.c_[l.latitude, l.longitude]); l = l[d > 0.02]
B = gpd.GeoDataFrame({'src': 'coolr_hkh', 'trig': l.trigger.astype(str)}, geometry=gpd.points_from_xy(l.longitude, l.latitude), crs=4326)
P = pd.concat([A, B]); print('independent points', len(P), P.src.value_counts().to_dict())
J = gpd.sjoin(P, T.to_crs(4326), predicate='within'); print('in tehsils', len(J))
return_key = [c for c in T.columns if c.lower() in ('key', 'uid', 'id')]; print('key cols', return_key)
J = J[J.uid.isin(LS)]
cnt = J.groupby('uid').size()
ev = pd.read_csv('/home/claude/nig/station-lake/reports/landslide_events.csv') if __import__('os').path.exists('/home/claude/nig/station-lake/reports/landslide_events.csv') else None
tr = set()
if ev is not None:
    tr = set(ev.uid.dropna())
R = pd.DataFrame([{'uid': k, 'rel': v['model30']['relDensity'], 'cls': v['model30']['class'], 's25': v['s25'], 'giri': v.get('giriMeanClass'), 'y': int(k in cnt.index), 'n': int(cnt.get(k, 0)), 'train': int(k in tr)} for k, v in LS.items()])
out = {'points': int(len(J)), 'tehsilsWithEvents': int(R.y.sum()), 'tehsilsWithEventsNotInTraining': int(((R.y == 1) & (R.train == 0)).sum()), 'tehsils': int(len(R))}
out['aucAll'] = round(roc_auc_score(R.y, R.rel), 3)
Mt = R[R.s25 >= 0.1]; out['aucMountain'] = round(roc_auc_score(Mt.y, Mt.rel), 3); out['mountainTehsils'] = int(len(Mt))
N = R[R.train == 0]; out['aucNewTehsilsOnly'] = round(roc_auc_score(N.y, N.rel), 3) if N.y.sum() else None; out['newTehsilsN'] = int(len(N))
Rg = R.dropna(subset=['giri']); out['aucGiriAll'] = round(roc_auc_score(Rg.y, Rg.giri), 3)
out['eventClassShare'] = (J.merge(R[['uid', 'cls']], on='uid').cls.value_counts(normalize=True).sort_index().round(3)).to_dict()
out['tehsilClassShare'] = R.cls.value_counts(normalize=True).sort_index().round(3).to_dict()
out['missed'] = R[(R.y == 1) & (R.cls <= 2)][['uid', 'n', 'cls', 'rel']].to_dict('records')
json.dump(out, open('spatial_result.json', 'w'), indent=1, default=str); print(json.dumps(out, default=str))
