"""v91.17.283 WS2 D18 · the coast snap distance of the territory check (server/api/territory.mjs, data/territory-snap.json).
The tehsil boundaries (data/pk-tehsils.json) are generalised: along the Arabian Sea coast (Sindh and Balochistan boundary segments
south of 25.7 N between 61.5 and 68.8 E) consecutive vertices lie a median 4.4 km apart, so a straight edge can cut off a strip of
real shore (Ormara town, Kemari port). A point outside every polygon is snapped to the nearest non-disputed tehsil when it lies
within half that median segment of the tehsil's boundary edge (the largest offset a straight chord of a median segment leaves
between its vertices). usage: python3 -I derive_snap.py [srv root] [out.json]"""
import json, math, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'; OUT = sys.argv[2] if len(sys.argv) > 2 else None
g = json.load(open(ROOT + '/data/pk-tehsils.json'))
def km(a, b, c, d):
    p = math.pi / 180; x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2; return 12742 * math.asin(math.sqrt(x))
sp = []
for f in g['features']:
    pr = f['properties']
    if pr.get('province') not in ('Sindh', 'Balochistan'): continue
    geom = f['geometry']; polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    for poly in polys:
        r = poly[0]
        for i in range(len(r) - 1):
            lo, la = r[i][:2]; lo2, la2 = r[i + 1][:2]
            if 23.5 < la < 25.7 and 61.5 < lo < 68.8: sp.append(km(la, lo, la2, lo2))
sp.sort(); med = sp[len(sp) // 2]
res = {'version': 'snap-91.17.283', 'snapKm': round(med / 2, 1), 'coastSegments': len(sp), 'medianSegmentKm': round(med, 2),
       'rule': 'a point outside every tehsil polygon is placed in the nearest non-disputed tehsil when its distance to that tehsil\'s boundary edge is at most snapKm (half the median coastal boundary segment of data/pk-tehsils.json); otherwise a point seaward of the Arabian Sea coastline is "at sea" and any other point is outside Pakistan-administered territory',
       'source': 'data/pk-tehsils.json, Sindh and Balochistan boundary segments 23.5-25.7 N, 61.5-68.8 E'}
print(json.dumps(res, indent=1))
if OUT: json.dump(res, open(OUT, 'w'), indent=1)
