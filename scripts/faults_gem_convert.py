#!/usr/bin/env python3
"""
faults_gem_convert.py  (v91.17.275 HAZ2) - NIGRAAN's own copy of the GEM Global Active Faults layer (copy, not fetch).

Owner (12 Oct 2026): the fault-line layer is the GEM Global Active Faults Database (Styron & Pagani 2020, Earthquake Spectra 36;
CC BY-SA 4.0). The lake catalogue lists it (dataset gem_active_faults, data/gem_faults/gem_active_faults_pk.geojson, 403 features
clipped to 20-40 N, 58-80 E), but the file was never in D:\\DATA LAKE: on 12 Oct it was clipped and converted into
D:\\NIGRAAN\\nig\\agn-lake only, and since v91.17.269 the lake root is the copies mirror (nig\\copies\\lake), which holds the
catalogue but not this file -> /api/faults answers 503. This script converts the already-held GEM clip (the harmonized GeoJSON
from github.com/GEMScienceTools/gem-global-active-faults, clipped on 12 Oct; no new download) into the schema faults.mjs reads
and writes it into NIGRAAN's own data folder: data/gem-active-faults-pk.json.

GEM fields used (GEM GAF-DB harmonized schema; tuples are "(best,min,max)"): catalog_name, catalog_id, name / fs_name, slip_type,
net_slip_rate (else strike_slip_rate, else shortening_rate, marked), average_dip (best), dip_dir. Length: geodesic sum of the trace
(haversine, R = 6371.0088 km). Nothing else is derived.
Usage: python3 scripts/faults_gem_convert.py <gem_clip.geojson> [--data data]
"""
import sys, os, json, math, datetime as dt

a = sys.argv[1:]
SRC = a[0]
DATA = os.path.abspath(a[a.index('--data') + 1] if '--data' in a else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
G = json.load(open(SRC))

def tup(v):
    if v is None: return None
    if isinstance(v, (int, float)): return [float(v), None, None]
    s = str(v).strip().strip('()')
    out = []
    for x in s.split(','):
        x = x.strip()
        try: out.append(float(x))
        except ValueError: out.append(None)
    while len(out) < 3: out.append(None)
    return out[:3] if out and out[0] is not None else None

def hav(lo1, la1, lo2, la2):
    r = math.pi / 180; x = math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(x))

feats = []
for f in G['features']:
    p = f['properties']; g = f['geometry']
    lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    L = sum(hav(l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]) for l in lines for i in range(len(l) - 1))
    rate, comp = tup(p.get('net_slip_rate')), 'net'
    if rate is None and tup(p.get('strike_slip_rate')): rate, comp = tup(p.get('strike_slip_rate')), 'strike-slip'
    if rate is None and tup(p.get('shortening_rate')): rate, comp = tup(p.get('shortening_rate')), 'shortening'
    dip = tup(p.get('average_dip'))
    feats.append({'type': 'Feature', 'geometry': g, 'properties': {
        'name': p.get('name') or p.get('fs_name') or None, 'catalog': p.get('catalog_name'), 'catalogId': p.get('catalog_id'),
        'slipType': p.get('slip_type') or None, 'slipRateMmYr': [None if x is None else round(x, 2) for x in rate] if rate else None,
        'slipRateComponent': comp if rate else None, 'dipDeg': dip[0] if dip else None, 'dipDir': p.get('dip_dir') or None,
        'lengthKm': round(L, 1)}})
# the licence header first (server/api/sources.mjs reads the first 64 KB of each data file: the Sources page credit)
out = {'licence': {'id': 'gem_active_faults', 'dataset': 'GEM Global Active Faults Database (GAF-DB)', 'provider': 'Global Earthquake Model (GEM) Foundation',
                   'licence': 'CC BY-SA 4.0', 'licenceUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
                   'attribution': 'Styron, R. and Pagani, M. (2020). The GEM Global Active Faults Database. Earthquake Spectra 36(1_suppl):160-180, doi:10.1177/8755293020944182. Clipped to 20-40 N, 58-80 E by AGN; shared under the same licence.',
                   'url': 'https://github.com/GEMScienceTools/gem-global-active-faults',
                   'use': 'Active fault lines on the map and the distance from a place to the nearest mapped fault: a reference, not a hazard level and not a damage estimate'},
       'type': 'FeatureCollection', 'metadata': {
    'credit': 'GEM Global Active Faults (Styron & Pagani 2020), CC BY-SA',
    'citation': 'Styron & Pagani (2020), Earthquake Spectra 36(1_suppl):160-180, doi:10.1177/8755293020944182',
    'licence': 'CC BY-SA 4.0 (GEM GAF-DB repository); this clip is a derivative under the same licence',
    'source': 'github.com/GEMScienceTools/gem-global-active-faults (harmonized GeoJSON), clipped to 20-40 N, 58-80 E',
    'fetchedUtc': '2026-10-12', 'converted': dt.date.today().isoformat(), 'method': 'scripts/faults_gem_convert.py',
    'lakeDataset': 'gem_active_faults', 'features': len(feats)}, 'features': feats}
dst = os.path.join(DATA, 'gem-active-faults-pk.json')
json.dump(out, open(dst + '.tmp', 'w'), separators=(',', ':')); os.replace(dst + '.tmp', dst)
from collections import Counter
print(len(feats), 'features ->', dst, Counter(x['properties']['catalog'] for x in feats), 'first', feats[0]['properties'])
