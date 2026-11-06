#!/usr/bin/env python3
"""
zone_hills_blend.py  (v91.17.71, forecast quality)  --  serve the hills zone on the mountain blend, if the held-out test says so

  why      v91.17.70 kept the hills (1,000-2,000 m outside GB / Chitral) on best_match: raw, no challenger passed the adoption
           rule. With station calibration back (stationData()), what is served is basis + calibration, and only the
           mountain blend (icon + gfs + meteofrance) can be calibrated on the served basis itself: those models are archived
           over the whole synop record, while best_match (ECMWF IFS 9 km since Oct 2025) has no archive overlapping any
           hill observation. station-lake/scripts/train_zone_corr.py scores both at the 9 hill synop sites and writes
           hillsDecision into station-lake/reports/zone_corr.json [measured there].
  does     if hillsDecision.basis == 'blend': data/model-zone.json zones.hills takes the mountain zone's temperature models
           (same members, fallback and blend hours) and clientBoxes are rebuilt so a client request for a mountain OR hills
           point carries the zone models. Otherwise nothing changes.
  boxes    derived, not typed: the tehsil polygons (data/pk-tehsils.json) of every unit whose zone (model-zone.json units,
           settlement height) is mountain or hills, dissolved; a CELL_DEG grid cell joins when MIN_FRAC of it is such a
           tehsil or it holds such a unit's point; the cells of each row form runs, and runs repeated on consecutive rows
           are stacked into one rectangle. [measured, this build] 13 boxes, every mountain / hills unit inside, 146 of
           420 lowland units inside (v91.17.70's 5 mountain-only boxes: 0 hills units covered).
           Coarse on purpose: a box only decides whether the request carries the zone models; the server still decides the
           zone per point from its resolved height, so a lowland point inside a box is served exactly as before.
  run      after temp_zone_rank.py (which rewrites model-zone.json) and train_zone_corr.py.
"""
import os, json, datetime as dt
from shapely.geometry import shape, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__)); NL = os.path.dirname(HERE); LAKE = os.path.join(os.path.dirname(NL), 'station-lake')
BUFFER_DEG = 0.02
CELL_DEG = 1.0     # coarse on purpose (13 boxes; 0.75 deg gives 19)
MIN_FRAC = 0.25   # a cell joins when a quarter of it is mountain / hills tehsil


def boxes_for(zm):
    """1-degree grid cells that are at least MIN_FRAC mountain/hills tehsil area, or hold a mountain/hills unit's point;
       each row's runs of cells, stacked where consecutive rows have the same run -> a few rectangles"""
    import math
    g = json.load(open(os.path.join(NL, 'data', 'pk-tehsils.json')))
    units = json.load(open(os.path.join(NL, 'server', 'contract', 'units.json')))
    want = {u for u, z in zm['units'].items() if z in ('mountain', 'hills')}
    m = unary_union([shape(f['geometry']) for f in g['features'] if f.get('geometry') and f['properties'].get('uid') in want]).buffer(BUFFER_DEG)
    x0, y0, x1, y1 = m.bounds
    X = [x0 + i * CELL_DEG for i in range(int(math.ceil((x1 - x0) / CELL_DEG)) + 1)]; Y = [y0 + j * CELL_DEG for j in range(int(math.ceil((y1 - y0) / CELL_DEG)) + 1)]
    mt = unary_union([shape(f['geometry']) for f in g['features'] if f.get('geometry') and zm['units'].get(f['properties'].get('uid')) == 'mountain'])
    cell = lambda i, j: box(X[i], Y[j], X[i + 1], Y[j + 1])
    # every cell the mountain zone touches (it is served on the blend since v91.17.70), and a hills cell from MIN_FRAC
    on = {(i, j) for i in range(len(X) - 1) for j in range(len(Y) - 1) if mt.intersects(cell(i, j)) or m.intersection(cell(i, j)).area >= MIN_FRAC * CELL_DEG ** 2}
    for u in units:
        if u['unitId'] in want and u.get('lat') is not None: on.add((int((u['lon'] - x0) // CELL_DEG), int((u['lat'] - y0) // CELL_DEG)))
    runs = {}
    for j in range(len(Y) - 1):
        i = 0
        while i < len(X) - 1:
            if (i, j) in on:
                k = i
                while (k + 1, j) in on: k += 1
                runs.setdefault((i, k), []).append(j); i = k + 1
            else: i += 1
    R = []
    for (i, k), js in runs.items():
        js.sort(); s0 = p = js[0]
        for q in js[1:] + [None]:
            if q is not None and q == p + 1: p = q; continue
            R.append([round(Y[s0], 2), round(X[i], 2), round(Y[p + 1], 2), round(X[k + 1], 2)])   # [latMin, lonMin, latMax, lonMax]
            if q is not None: s0 = p = q
    return sorted(R, key=lambda r: (-r[2], r[1]))


def main():
    rep = json.load(open(os.path.join(LAKE, 'reports', 'zone_corr.json')))
    dec = rep.get('hillsDecision') or {}
    f = os.path.join(NL, 'data', 'model-zone.json'); Z = json.load(open(f))
    if dec.get('basis') != 'blend':
        print('hillsDecision:', dec, '- the hills stay on best_match; model-zone.json unchanged'); return
    mt = Z['zones']['mountain']; h = Z['zones']['hills']
    Z['zones']['hills'] = dict(rule=h['rule'], temperatureModels=list(mt['temperatureModels']), temperatureModel=mt['temperatureModel'], horizonFallback=mt.get('horizonFallback'),
                               blendHours=mt.get('blendHours'), combine=mt.get('combine'), horizonsH=mt.get('horizonsH'),
                               why='v91.17.71: the served hills value is basis + station calibration; on the blend the calibration is fitted on the served basis itself and verifies better held out (station-lake/reports/zone_corr.json hillsDecision, internal)')
    Z['clientBoxes'] = boxes_for(Z)
    Z['clientBoxesRule'] = dict(script='nigraan-local/scripts/zone_hills_blend.py boxes_for', zones=['mountain', 'hills'], cellDeg=CELL_DEG, minFrac=MIN_FRAC,
                                note='coarse: a box decides only whether a client request carries the zone models; the server decides the zone per point')
    sel = Z.setdefault('selection', {}).setdefault('perZone', {}).setdefault('hills', {})
    sel['served'] = list(mt['temperatureModels']); sel['v91_17_71'] = 'adopted with the station calibration (hillsDecision rule in the internal report)'
    Z['version'] = 'tc-91.17.71'; Z['builtHills'] = dt.datetime.now(dt.timezone.utc).isoformat()[:19] + 'Z'
    json.dump(Z, open(f, 'w'), indent=1)
    print('hills -> ' + mt['temperatureModel'] + '; clientBoxes', len(Z['clientBoxes']), Z['clientBoxes'])


if __name__ == '__main__':
    main()
