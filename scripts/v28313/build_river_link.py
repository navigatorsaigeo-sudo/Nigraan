"""v91.17.283.13 · RIVER LINK BY DRAINAGE (audit B4 item 1). Builds data/river-link.json.

Replaces the district inheritance of a gauge's main-river level (data/river-reach-units.json: every tehsil of a district listed under a
gauge took that gauge's level wherever it lay) with a link along the river itself:
  river     the main-stem centre line of each named river (data/pk-rivers.json: OpenStreetMap waterway=river, main stem by the longest
            shortest path, ordered downstream)
  gauge     each river forecast point of data/flood.json is placed on its own river's line (nearest vertex: chainage in km from the
            upstream end); its REACH is the stretch of that line nearer to it than to the next gauge up or down the same river (midpoints
            in chainage); the first gauge's reach starts at the line's upstream end, the last one's ends at the confluence or the sea
  tehsil    linked to a gauge when that gauge's reach passes through or along the tehsil, within half a river-model cell (0.025 deg,
            the resolution of the 0.05 deg model the level comes from): rivers are often the tehsil boundary. A tehsil no gauged reach
            touches has no river level, whatever its district
  check     the national channel review (store/static/flood_risk/false_channels.json: GloFAS v4 channels with no river on the ground by
            MODIS 2002-2024 floods and JRC GSW / Landsat water, OSM canals excluded) is applied as a mask: a reach cell it disputes is
            dropped (none on the ten perennial rivers, per the review); per tehsil the disputed and the ungauged channel cells are counted
            as facts (why a desert tehsil with a GloFAS 'channel' gets no river level)
Height above the river (HAND, data/hand-tehsil.json) is applied at serve time (server/api/riverlink.mjs), not here.
Usage: python3 -I build_river_link.py <flood_risk_dir> <data_dir> <out.json>"""
import json, sys, hashlib, math, datetime
import numpy as np
from shapely.geometry import shape, LineString, Point, box
from shapely.prepared import prep

FR, DATA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
HALF_CELL = 0.025
def gkm(lat1, lon1, lat2, lon2):
    la1, lo1, la2, lo2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))

fc = json.load(open(FR + '/false_channels.json')); QMIN = float(fc['rule']['mean_annual_flood_min_m3s'])
q = np.load(FR + '/glofas_qbar.npy'); NR, NC = q.shape; LAT0, LON0, STEP = 37.175, 60.525, 0.05
d0 = fc['detail'][0]; assert NC == 348 and abs(LAT0 - STEP * (d0['cell'] // NC) - d0['lat']) < 1e-6 and abs(LON0 + STEP * (d0['cell'] % NC) - d0['lon']) < 1e-6
false = set(fc['cells'])
latc = lambda r: LAT0 - STEP * r; lonc = lambda c: LON0 + STEP * c
def cells_of(geom):
    x0, y0, x1, y1 = geom.bounds; P = prep(geom); out = []
    for r in range(max(0, int((LAT0 - y1) / STEP)), min(NR, int((LAT0 - y0) / STEP) + 2)):
        for c in range(max(0, int((x0 - LON0) / STEP)), min(NC, int((x1 - LON0) / STEP) + 2)):
            if P.intersects(box(lonc(c) - STEP / 2, latc(r) - STEP / 2, lonc(c) + STEP / 2, latc(r) + STEP / 2)): out.append((r, c))
    return out

RV = {r['name']: r for r in json.load(open(DATA + '/pk-rivers.json'))['rivers']}
def chain(coords):
    s = [0.0]
    for i in range(1, len(coords)): s.append(s[-1] + gkm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]))
    return s
CH = {n: chain(r['coords']) for n, r in RV.items()}
F = json.load(open(DATA + '/flood.json')); pts = F['snapped']['points']
gauges = {}
for gid, p in pts.items():
    R = RV.get(p.get('river'))
    if not R: gauges[gid] = {'name': p.get('name'), 'river': p.get('river'), 'reach': None, 'why': 'no main-stem line for this river in data/pk-rivers.json'}; continue
    C = R['coords']; dk = [gkm(p['lat'], p['lon'], y, x) for x, y in C]; i = int(np.argmin(dk))
    gauges[gid] = {'name': p.get('name'), 'river': p['river'], 'chainageKm': round(CH[p['river']][i], 1), 'offLineKm': round(dk[i], 1), '_i': i}
for name, R in RV.items():
    G = sorted([g for g in gauges.values() if g.get('river') == name and '_i' in g], key=lambda g: g['_i'])
    for k, g in enumerate(G):
        lo = 0 if k == 0 else (G[k - 1]['_i'] + g['_i']) // 2
        hi = len(R['coords']) - 1 if k == len(G) - 1 else (g['_i'] + G[k + 1]['_i']) // 2
        g['_seg'] = (lo, hi); g['reachKm'] = [round(CH[name][lo], 1), round(CH[name][hi], 1)]
        g['upstreamGauge'] = next((x for x, y in gauges.items() if y is (G[k - 1] if k else None)), None)
        g['downstreamGauge'] = next((x for x, y in gauges.items() if k + 1 < len(G) and y is G[k + 1]), None)
reachGeom = {}; disputedOnReach = {}
for gid, g in gauges.items():
    if '_seg' not in g: continue
    name = g['river']; lo, hi = g['_seg']; L = LineString(RV[name]['coords'][lo:hi + 1]) if hi > lo else Point(RV[name]['coords'][lo])
    reachGeom[gid] = L
    cs = cells_of(L.buffer(1e-9)); dis = [r * NC + c for r, c in cs if (r * NC + c) in false]
    g['modelCells'] = len(cs); g['disputedCellsOnReach'] = len(dis); disputedOnReach[gid] = dis

T = json.load(open(DATA + '/pk-tehsils.json')); anch = json.load(open(DATA + '/tehsil-anchor.json')).get('units', {})
units = {}
for f in T['features']:
    uid = f['properties'].get('uid')
    if not uid: continue
    gpoly = shape(f['geometry']); near = gpoly.buffer(HALF_CELL); a = (anch.get(uid) or {}).get('anchor') or {}
    reaches = {}
    for gid, L in reachGeom.items():
        if not near.intersects(L): continue
        inside = L.intersection(gpoly); along = inside.length * 111.0 if not inside.is_empty else 0.0   # deg -> km (order of magnitude, a fact)
        e = {'river': gauges[gid]['river'], 'reachInsideKmApprox': round(along, 1), 'onBoundary': inside.is_empty}
        if a.get('lat') is not None:
            pp = L.interpolate(L.project(Point(a['lon'], a['lat']))); e['settlementKmToRiver'] = round(gkm(a['lat'], a['lon'], pp.y, pp.x), 1)
        reaches[gid] = e
    chan = dis = 0
    for r, c in cells_of(gpoly):
        if not (np.isfinite(q[r, c]) and q[r, c] >= QMIN): continue
        if (r * NC + c) in false: dis += 1
        else: chan += 1
    units[uid] = {'reaches': reaches, 'modelChannelCells': chan, 'disputedChannelCells': dis}
for g in gauges.values(): g.pop('_i', None); g.pop('_seg', None)
out = {'version': 'river-link-91.17.283.13', 'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
  'method': __doc__.split('Usage:')[0].strip(), 'tolerance': {'halfModelCellDeg': HALF_CELL, 'why': 'half of the 0.05 deg river-model cell the level comes from'},
  'provenance': {'rivers': {'file': 'data/pk-rivers.json', 'sha256': sha(DATA + '/pk-rivers.json')}, 'flood': {'file': 'data/flood.json', 'snappedAt': F['snapped'].get('at')},
    'tehsils': {'file': 'data/pk-tehsils.json', 'sha256': sha(DATA + '/pk-tehsils.json')},
    'channelReview': {'file': 'store/static/flood_risk/false_channels.json', 'sha256': sha(FR + '/false_channels.json'), 'receiptSha256': sha(FR + '/false_channels.receipt.json'),
      'disputedCells': len(false), 'rule': fc['rule'], 'sources': 'GloFAS v4.0 historical reanalysis (mean annual flood), MODIS MOD09A1/MYD09A1 seasonal flood maps 2002-2024, JRC GloFAS flood hazard maps v2.1.2, JRC Global Surface Water v1.4 (Landsat 1984-2021); OpenStreetMap canals excluded'}},
  'gauges': gauges, 'units': units}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('gauges with a reach', sum(1 for g in gauges.values() if g.get('reachKm')), 'of', len(gauges), '; disputed cells on reaches', sum(len(v) for v in disputedOnReach.values()),
      '; tehsils linked', sum(1 for u in units.values() if u['reaches']), 'of', len(units))
