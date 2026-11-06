"""Pixel -> tehsil runs for the MODIS 250 m flood grid (0.0020833 deg, tiles h24-h25 v05-v06 = 60-80E, 20-40N).
Output nigraan-local/data/floodobs-runs.bin (uint32 header count, then per row: uint16 nRuns, nRuns x (uint16 col0, uint16 len, uint16 unit))
and floodobs-runs.json (grid, row/col window, unit list). Pixel centre inside the tehsil polygon (rasterio all_touched=False)."""
import json, numpy as np, geopandas as gpd, rasterio.features as rf, struct
from affine import Affine
T = gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json')
units = list(T.uid); px = 1 / 480.0
r0, r1 = int((40 - 37.6) / px), int((40 - 23.4) / px); c0, c1 = int((60.4 - 60) / px), int((78.2 - 60) / px)
tr = Affine(px, 0, 60 + c0 * px, 0, -px, 40 - r0 * px)
A = rf.rasterize(((g, i + 1) for i, g in enumerate(T.geometry)), out_shape=(r1 - r0, c1 - c0), transform=tr, fill=0, dtype='int32')
print(A.shape, (A > 0).sum())
buf = bytearray(); nr = 0
for r in range(A.shape[0]):
    row = A[r]; ch = np.flatnonzero(np.diff(np.r_[0, row, 0]) != 0); runs = []
    for a, b in zip(ch[:-1], ch[1:]):
        if row[a] > 0: runs.append((a, b - a, row[a] - 1))
    buf += struct.pack('<H', len(runs)); nr += len(runs)
    for a, l, u in runs: buf += struct.pack('<HHH', a, l, u)
open('/home/claude/nig/nigraan-local/data/floodobs-runs.bin', 'wb').write(bytes(buf))
cnt = np.bincount(A.ravel(), minlength=len(units) + 1)[1:]
json.dump({'built': '2026-10-04', 'what': 'pixel-to-tehsil runs for the MODIS 250 m flood grid', 'pixelDeg': px, 'gridOrigin': [60, 40], 'row0': r0, 'col0': c0, 'rows': int(A.shape[0]), 'cols': int(A.shape[1]),
           'tiles': {'h24v05': [60, 40], 'h25v05': [70, 40], 'h24v06': [60, 30], 'h25v06': [70, 30]}, 'units': units, 'pixels': [int(x) for x in cnt], 'runs': nr,
           'rule': 'pixel centre inside the tehsil polygon'}, open('/home/claude/nig/nigraan-local/data/floodobs-runs.json', 'w'))
print('runs', nr, 'bytes', len(buf), 'units without pixels', int((cnt == 0).sum()))
