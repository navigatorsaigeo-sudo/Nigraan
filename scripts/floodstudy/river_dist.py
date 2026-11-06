import geopandas as gpd, json, numpy as np, warnings, rasterio.features as rf; warnings.filterwarnings('ignore')
from affine import Affine; from scipy.ndimage import distance_transform_edt
W='/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/waterbodies/'
T=gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json')[['uid','geometry']].to_crs(32642)
R=gpd.read_file(W+'03_drainage__Rivers.geojson').to_crs(32642)
x0,y0,x1,y1=T.total_bounds; px=250.0; W_=int((x1-x0)/px)+1; H_=int((y1-y0)/px)+1; tr=Affine(px,0,x0,0,-px,y1)
TI=rf.rasterize(((g,i+1) for i,g in enumerate(T.geometry)),out_shape=(H_,W_),transform=tr,fill=0,dtype='int32')
RI=rf.rasterize(((g,1) for g in R.geometry),out_shape=(H_,W_),transform=tr,fill=0,dtype='uint8',all_touched=True)
D=distance_transform_edt(RI==0)*px/1000.0
out={}
for i,u in enumerate(T.uid):
    m=TI==(i+1); n=m.sum()
    if n==0: continue
    d=D[m]; out[u]={'river2km':round(float((d<=2).mean()),4),'river5km':round(float((d<=5).mean()),4),'river10km':round(float((d<=10).mean()),4),'riverDistMedKm':round(float(np.median(d)),2)}
json.dump(out,open('river_dist.json','w')); print(len(out))
