import json, glob, geopandas as gpd, pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
W = '/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/waterbodies/'
T = gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json')[['uid', 'geometry']].to_crs(6933)
T['geometry'] = T.buffer(0); T['A'] = T.area / 1e6
out = pd.DataFrame({'uid': T.uid, 'areaKm2': T.A}).set_index('uid')
def line_len(f, name):
    g = gpd.read_file(W + f).to_crs(6933); g = g[g.geometry.notna()]
    x = gpd.overlay(g[['geometry']], T[['uid', 'geometry']], how='intersection', keep_geom_type=True); x['L'] = x.length / 1e3
    out[name] = x.groupby('uid').L.sum().reindex(out.index).fillna(0) / out.areaKm2; print(name, 'done', flush=True)
def poly_share(files, name):
    g = pd.concat([gpd.read_file(W + f).to_crs(6933)[['geometry']] for f in files]); g = g[g.geometry.notna()]; g['geometry'] = g.buffer(0)
    x = gpd.overlay(g, T[['uid', 'geometry']], how='intersection', keep_geom_type=True); x['a'] = x.area / 1e6
    out[name] = x.groupby('uid').a.sum().reindex(out.index).fillna(0) / out.areaKm2; print(name, 'done', flush=True)
line_len('01_basins__Stream_Network.geojson', 'streamDensity')
line_len('05_infrastructure__Irrigation_Networks.geojson', 'canalDensity')
poly_share(sorted(glob.glob(W + '03_drainage__*.geojson')) and [p.split('/')[-1] for p in sorted(glob.glob(W + '03_drainage__*.geojson'))], 'drainShare')
poly_share(['02_waterbodies__Other_Water_Bodies.geojson', '02_waterbodies__Lakes.geojson'], 'waterShare')
m = gpd.read_file(W + '05_infrastructure__Outlets_Moghas.geojson').to_crs(6933)
j = gpd.sjoin(m[['geometry']], T[['uid', 'geometry']], predicate='within'); out['moghaDensity'] = j.groupby('uid').size().reindex(out.index).fillna(0) / out.areaKm2
out.round(6).to_json('/home/claude/nig/floodstudy/water_feats.json', orient='index'); print(out.describe().T.round(4))
