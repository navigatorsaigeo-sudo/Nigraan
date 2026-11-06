#!/usr/bin/env python3
"""v91.17.283.41 (NIGRAAN 1.0.5) . owner update 31 Oct 22:55 PKT: landslide in three groups from the 30 m terrain and the landslide records.
  (a) steep ground in the tehsil         -> the landslide level (the served mask: data/hazard-applicability.json layers.landslide, steep
                                            share of the 30 m slope >= steepDeg, calibrated on the catalogue events; unchanged)
  (b) edge tehsil: flat inside, steep ground right beside (within REACH_KM of the boundary)
                                         -> grey "No local steep ground; debris from nearby slopes possible"
  (c) plains: no steep ground in or near -> hatched "Cannot happen here"
Steep ground beside a tehsil: 250 m cells of the national terrain grid whose 90th percentile 30 m slope (data/feat/t_slope_p90, Copernicus
GLO-30) is at least the mask's steepDeg (25 deg), in connected patches of at least MIN_PATCH cells (single cells are embankments, river
bluffs and DEM artefacts). REACH_KM: 5 km = the coarsest location class the mask itself was calibrated on (catalogue events located to
5 km or better) and the order of debris-flow run-out (several km; Hungr, Leroueil & Picarelli 2014, Landslides 11:167-194, debris
flows; Rickenmann 1999, Natural Hazards 19:47-77, run-out distances). Every recorded landslide is placed in its group; any in (c) is listed.
usage: python3 -I landslide_groups41.py --tree <tree> --slope <dir with t_slope_p90.*> --events <landslide_events.csv> --out <json>"""
import argparse, json, csv, zlib, os, numpy as np
from matplotlib.path import Path
from scipy import ndimage
ap = argparse.ArgumentParser(); ap.add_argument('--tree'); ap.add_argument('--slope'); ap.add_argument('--events'); ap.add_argument('--out')
ap.add_argument('--reach', type=float, default=5.0); ap.add_argument('--steep', type=float, default=None); ap.add_argument('--minpatch', type=int, default=4)
a = ap.parse_args()
APP = json.load(open(os.path.join(a.tree, 'data', 'hazard-applicability.json')))
LS = APP['layers']['landslide']; STEEP = a.steep or LS['params']['steepDeg']['value']
J = json.load(open(os.path.join(a.slope, 't_slope_p90.json'))); G = J['grid']; cell = G['cell']; W0, N0 = G['west'], G['north']; R, C = G['rows'], G['cols']; B = G['block']
arr = np.full((R, C), np.nan, dtype=np.float32); fh = {}
for k, (part, off, ln) in J['blocks'].items():
    br, bc = map(int, k.split(',')); f = fh.get(part) or fh.setdefault(part, open(os.path.join(a.slope, 't_slope_p90.p%d.bin' % part), 'rb'))
    f.seek(off); raw = zlib.decompress(f.read(ln)); v = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    n = int(round(np.sqrt(v.size))); v = v.reshape(n, n); v[v == J['nodata']] = np.nan; v = v * J['scale'] + J['offset']
    r0, c0 = br * B, bc * B; arr[r0:r0 + n, c0:c0 + n] = v[:R - r0, :C - c0]
steep = np.nan_to_num(arr, nan=0) >= STEEP
lab, nl = ndimage.label(steep, structure=np.ones((3, 3)))
sizes = ndimage.sum(steep, lab, index=np.arange(1, nl + 1)); keep = np.zeros(nl + 1, bool); keep[1:] = sizes >= a.minpatch; steepP = keep[lab]
lat_mid = N0 - R * cell / 2; dy = cell * 111.32; dx = cell * 111.32 * np.cos(np.radians(lat_mid))
dist = ndimage.distance_transform_edt(~steepP, sampling=(dy, dx))   # km from each cell to the nearest steep patch cell
T = json.load(open(os.path.join(a.tree, 'data', 'pk-tehsils.json')))
outside = {k for k, v in LS['units'].items() if v.get('applies') is False}
def rings(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
res = {}; cellsOf = {}
for f in T['features']:
    p = f['properties']; uid = p['uid']
    if uid.startswith('Indian Illegally'): continue
    polys = rings(f['geometry']); mins = []; ncell = 0; own = 0
    for poly in polys:
        ext = np.array(poly[0]); lo0, la0 = ext.min(0); lo1, la1 = ext.max(0)
        c0 = max(0, int((lo0 - W0) / cell)); c1 = min(C, int((lo1 - W0) / cell) + 1); r0 = max(0, int((N0 - la1) / cell)); r1 = min(R, int((N0 - la0) / cell) + 1)
        if c1 <= c0 or r1 <= r0: continue
        cc, rr = np.meshgrid(np.arange(c0, c1), np.arange(r0, r1)); pts = np.c_[W0 + (cc.ravel() + .5) * cell, N0 - (rr.ravel() + .5) * cell]
        m = Path(ext).contains_points(pts)
        for hole in poly[1:]: m &= ~Path(np.array(hole)).contains_points(pts)
        if not m.any(): continue
        sel = (rr.ravel()[m], cc.ravel()[m]); ncell += m.sum(); own += int(steepP[sel].sum()); mins.append(float(dist[sel].min()))
    res[uid] = {'cells': int(ncell), 'steepCellsOwn': own, 'kmToSteep': round(min(mins), 2) if mins else None}
groups = {}
for uid, r in res.items():
    if uid not in outside: g = 'a'
    elif r['kmToSteep'] is not None and r['kmToSteep'] <= a.reach: g = 'b'
    else: g = 'c'
    r['group'] = g; groups[uid] = g
ev = list(csv.DictReader(open(a.events))); inC = []; byG = {'a': 0, 'b': 0, 'c': 0, 'none': 0}
for e in ev:
    g = groups.get(e['uid']); byG[g or 'none'] += 1
    if g == 'c': inC.append({k: e[k] for k in ('event_id', 'date', 'lat', 'lon', 'accuracy', 'title', 'uid', 'effSlope')})
cnt = {k: sum(1 for g in groups.values() if g == k) for k in 'abc'}
out = {'name': 'landslide-groups', 'version': 'lsg-91.17.283.41', 'built': '2026-10-31', 'rule': {
    'a': 'steep ground in the tehsil: the served steep-ground mask (data/hazard-applicability.json layers.landslide, unchanged) -> landslide level',
    'b': 'flat inside (outside the mask) and steep ground within %.0f km of the tehsil -> "No local steep ground; debris from nearby slopes possible" (grey, not hatched)' % a.reach,
    'c': 'no steep ground in the tehsil or within %.0f km -> "Cannot happen here" (hatched)' % a.reach},
  'params': {'steepDeg': {'value': STEEP, 'source': 'the mask steepDeg (data/hazard-applicability.json)'}, 'slopeBand': 't_slope_p90 (90th percentile of the 30 m Copernicus GLO-30 slope per 250 m cell)',
    'minPatchCells': {'value': a.minpatch, 'unit': '250 m cells (about 0.25 km2)', 'status': 'expert', 'method': 'a single steep cell is an embankment, a river bluff or a DEM artefact'},
    'reachKm': {'value': a.reach, 'status': 'expert', 'method': 'the coarsest event location class the mask was calibrated on (5 km) and debris-flow run-out of several km (Hungr, Leroueil & Picarelli 2014; Rickenmann 1999)'}},
  'counts': cnt, 'events': {'total': len(ev), 'byGroup': byG, 'inGroupC': inC}, 'units': res}
json.dump(out, open(a.out, 'w'), indent=0)
print('groups', cnt, 'events by group', byG, 'events in c', len(inC))
for e in inC: print('  C-EVENT', e)
