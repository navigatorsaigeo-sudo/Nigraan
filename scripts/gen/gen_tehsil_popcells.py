"""v91.17.283.31 · owner 2.2 · the POPULATED POINTS of each tehsil for the area heat and cold levels -> data/tehsil-popcells.json
The tehsil's main settlement (data/tehsil-anchor.json anchor) plus up to MAX_EXTRA more populated places inside the tehsil polygon
(GeoNames PK, data/pk-places.tsv.gz, feature class PPL*, population >= MIN_POP, at least 5 km from the anchor and from each other), each
weighted by its GeoNames population (the anchor by its own population, at least 1). The tehsil's area level is then the level reached by
at least SHARE of this population (server/api/areaheat.mjs). The polygon centre is NOT a populated point (high ground or empty land):
it stays a reported point (coldest / hottest point), not a weight.   python scripts/gen/gen_tehsil_popcells.py"""
import json, gzip, math, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')
MIN_POP, MAX_EXTRA, SEP_KM, SHARE = 5000, 3, 5.0, 0.25
T = json.load(open(os.path.join(D, 'pk-tehsils.json'))); A = json.load(open(os.path.join(D, 'tehsil-anchor.json')))['units']
def km(a, b, c, d):
    p = math.pi / 180; x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2; return 12742 * math.asin(math.sqrt(x))
def rings(g): return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
def inside(poly, x, y):
    ins = False
    for ring in poly:   # even-odd over all rings (holes subtract)
        n = len(ring); j = n - 1
        for i in range(n):
            xi, yi = ring[i][0], ring[i][1]; xj, yj = ring[j][0], ring[j][1]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-300) + xi: ins = not ins
            j = i
    return ins
places = []
with gzip.open(os.path.join(D, 'pk-places.tsv.gz'), 'rt', encoding='utf-8') as h:
    for l in h:
        c = l.rstrip('\n').split('\t')
        if len(c) < 7 or not c[5].startswith('PPL') or c[5] in ('PPLX', 'PPLQ', 'PPLW', 'PPLH'): continue
        try: pop = int(float(c[6] or 0)); la = float(c[3]); lo = float(c[4])
        except ValueError: continue
        if pop >= MIN_POP: places.append((pop, c[0], la, lo))
places.sort(reverse=True)
out = {}; n_extra = 0
for f in T['features']:
    uid = f['properties']['uid']; g = f['geometry']; a = (A.get(uid) or {}).get('anchor')
    polys = rings(g); xs = [p[0] for P in polys for r in P for p in r]; ys = [p[1] for P in polys for r in P for p in r]
    bb = (min(xs), min(ys), max(xs), max(ys)); pts = []
    if a: pts.append({'name': a['name'], 'lat': a['lat'], 'lon': a['lon'], 'pop': max(1, int(a.get('population') or 0)), 'kind': 'main settlement'})
    for pop, nm, la, lo in places:
        if len(pts) - (1 if a else 0) >= MAX_EXTRA: break
        if not (bb[0] <= lo <= bb[2] and bb[1] <= la <= bb[3]): continue
        if not any(inside(P, lo, la) for P in polys): continue
        if any(km(la, lo, p['lat'], p['lon']) < SEP_KM for p in pts): continue
        pts.append({'name': nm, 'lat': la, 'lon': lo, 'pop': pop, 'kind': 'town'}); n_extra += 1
    out[uid] = pts
meta = {'built': __import__('datetime').date.today().isoformat(), 'version': 'tehsil-popcells-91.17.283.31',
  'method': __doc__.strip().splitlines()[0], 'rule': {'share': SHARE, 'minPop': MIN_POP, 'maxExtra': MAX_EXTRA, 'sepKm': SEP_KM,
  'text': 'the tehsil area level is the level reached by at least ' + str(int(SHARE * 100)) + ' % of the population of its populated points (main settlement + up to ' + str(MAX_EXTRA) + ' towns of >= ' + str(MIN_POP) + ' people); the hottest / coldest point is served beside it',
  'source': 'NIGRAAN rule (owner 2.2, 29 Oct 2026): a share of the populated area, not the single most extreme point; populations GeoNames PK (CC BY 4.0)'},
  'counts': {'units': len(out), 'extraTowns': n_extra, 'withTowns': sum(1 for v in out.values() if len(v) > 1)}, 'units': out}
json.dump(meta, open(os.path.join(D, 'tehsil-popcells.json'), 'w'), separators=(',', ':'))
print(meta['counts'])
