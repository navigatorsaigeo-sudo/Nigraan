import geopandas as gpd, pandas as pd, json, glob, warnings; warnings.filterwarnings('ignore')
from shapely.validation import make_valid
F='/mnt/user-data/uploads/Data_9_23/Flood_Extents/'; W='/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/waterbodies/'
T=gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json')[['uid','geometry']].to_crs(6933); T['geometry']=T.buffer(0); T['A']=T.area
perm=pd.concat([gpd.read_file(W+f).to_crs(6933)[['geometry']] for f in ('03_drainage__Rivers.geojson','08_inventory__Water_Bodies_Inventory.geojson')]); perm['geometry']=perm.buffer(0)
pj=gpd.overlay(gpd.GeoDataFrame(perm,crs=6933),T[['uid','geometry']],how='intersection',keep_geom_type=True); pj['pa']=pj.area
FX=json.load(open('/home/claude/nig/nigraan-local/data/flood-extent-calibration.json'))['sets']
res={}
for y in (2010,2014,2022,2025):
    g=gpd.read_file(glob.glob(F+f'Flood_{y}.shp')[0]).to_crs(6933); g['geometry']=g.buffer(0)
    fx=gpd.overlay(g[['geometry']],T[['uid','geometry']],how='intersection',keep_geom_type=True)
    fx=fx.dissolve('uid').reset_index()
    pp=pj.dissolve('uid').reset_index()[['uid','geometry']].rename(columns={'geometry':'pg'})
    m=fx.merge(pp,on='uid',how='left')
    m['wet']=[ (a.difference(b).area if b is not None else a.area) for a,b in zip(m.geometry,m.pg)]
    m=m.merge(T[['uid','A']],on='uid'); m['sh']=m.wet/m.A
    sh=dict(zip(m.uid,m.sh)); old={u:(v.get('floodedShare') or 0) for u,v in FX[f'pk{y}']['units'].items()}
    flip=sum(1 for u,o in old.items() if (o>=0.01)!=(sh.get(u,0)>=0.01)); n1=sum(1 for o in old.values() if o>=0.01); n2=sum(1 for u in old if sh.get(u,0)>=0.01)
    json.dump({u:round(float(v),5) for u,v in sh.items()},open(f'share_{y}.json','w'))
    res[y]={'tehsils':len(old),'floodedBefore':n1,'floodedAfterRemovingPermanentWater':n2,'labelsChanged':flip}; print(y,res[y],flush=True)
json.dump(res,open('flip.json','w'),indent=1)
