import geopandas as gpd, pandas as pd, json, glob, os, warnings; warnings.filterwarnings('ignore')
T=gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json')[['uid','geometry']].to_crs(6933)
T['A']=T.area
B='/home/claude/nig/geo/floodext/oct19/FL20220808PAK_SHP/'
files=sorted(glob.glob(B+'VIIRS_2022*_FloodExtent_PAK.shp'))
out=json.load(open('weekly2022.json')) if os.path.exists('weekly2022.json') else {}
for f in files:
    k=os.path.basename(f).replace('_FloodExtent','').replace('.shp','')
    if k in out: continue
    g=gpd.read_file(f).to_crs(6933); g=g[g.geometry.notna()]
    g['geometry']=g.buffer(0)
    ov=gpd.overlay(T[['uid','geometry']],g[['geometry']],how='intersection',keep_geom_type=True)
    ov['a']=ov.area; s=ov.groupby('uid').a.sum()
    sh=(s/T.set_index('uid').A).reindex(T.uid).fillna(0)
    cl=B+os.path.basename(f).replace('FloodExtent','CloudObstruction')
    cs=None
    if os.path.exists(cl):
        c=gpd.read_file(cl).to_crs(6933); c['geometry']=c.buffer(0); oc=gpd.overlay(T[['uid','geometry']],c[['geometry']],how='intersection',keep_geom_type=True); oc['a']=oc.area
        cs=(oc.groupby('uid').a.sum()/T.set_index('uid').A).reindex(T.uid).fillna(0)
    out[k]={'flooded':{u:round(float(v),5) for u,v in sh.items()}, 'cloud':({u:round(float(v),4) for u,v in cs.items()} if cs is not None else None)}
    print(k, int((sh>=0.01).sum()), flush=True); json.dump(out,open('weekly2022.json','w'))
json.dump(out,open('weekly2022.json','w'))
