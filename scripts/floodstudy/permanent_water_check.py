import geopandas as gpd, pandas as pd, json, warnings; warnings.filterwarnings('ignore')
F='/mnt/user-data/uploads/Data_9_23/Flood_Extents/'; W='/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/waterbodies/'
riv=gpd.read_file(W+'03_drainage__Rivers.geojson').to_crs(6933); riv['geometry']=riv.buffer(0)
wb=gpd.read_file(W+'08_inventory__Water_Bodies_Inventory.geojson').to_crs(6933); wb['geometry']=wb.buffer(0)
perm=pd.concat([riv[['geometry']],wb[['geometry']]]); perm=gpd.GeoDataFrame(perm,crs=6933)
PU=perm.union_all() if hasattr(perm,'union_all') else perm.unary_union
print('permanent water km2', round(PU.area/1e6))
out={}
for y in (2010,2014,2022,2025):
    import glob
    fs=glob.glob(F+f'Flood_{y}*.shp')
    if not fs: continue
    g=gpd.read_file(fs[0]).to_crs(6933); g['geometry']=g.buffer(0); U=g.union_all() if hasattr(g,'union_all') else g.unary_union
    a=U.area/1e6; inter=U.intersection(PU).area/1e6
    out[y]={'totalKm2':round(a),'insideRiversAndWaterBodiesKm2':round(inter),'share':round(inter/a,3),'outsideKm2':round(a-inter)}
    print(y,out[y],flush=True)
json.dump(out,open('/home/claude/nig/flood2010/result.json','w'),indent=1)
