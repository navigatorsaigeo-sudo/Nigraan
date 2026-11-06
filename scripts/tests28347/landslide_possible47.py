#!/usr/bin/env python3
"""v91.17.283.47 (NIGRAAN 1.0.8) owner rule 2 Nov 2026 01:15 PKT: landslide "cannot happen here" from a PUBLISHED susceptibility source,
not from the failed 30 Oct steep-ground mask. Source: GIRI landslide susceptibility (NGI for UNDRR / CDRI / UNEP-GRID-Geneva, CC BY 4.0;
data/giri-landslide-tehsil.json: every ~370 m cell of each tehsil, class 1 very low .. 5 very high, for landslides triggered by
precipitation AND by earthquakes). Rule (no fitted or invented number):
  cannot happen  = every cell of the tehsil is class 1 "very low" for BOTH triggers, AND no tehsil sharing a boundary with it holds a
                   cell of class 3 "moderate" or above (owner: "tehsils touching moderate+ susceptibility keep their level/value";
                   debris from a neighbour's slopes can cross the boundary)
  everything else = possible (its level or value as served)
Check: the landslide inventory (NASA Global Landslide Catalog events in Pakistan, station-lake/reports/landslide_events.csv) must hold
NO event in a cannot-happen tehsil; the build stops if one does. usage:
  python3 -I landslide_possible47.py --tree <tree> --giri <giri-landslide-tehsil.json> --events <landslide_events.csv> --out <json>"""
import argparse, json, csv
from shapely.geometry import shape
from shapely.strtree import STRtree
ap = argparse.ArgumentParser(); ap.add_argument('--tree'); ap.add_argument('--giri'); ap.add_argument('--events'); ap.add_argument('--out'); a = ap.parse_args()
G = json.load(open(a.giri)); U = G['units']
T = json.load(open(a.tree + '/data/pk-tehsils.json'))
geo = {f['properties']['uid']: shape(f['geometry']).buffer(0) for f in T['features']}
uids = list(geo); tree = STRtree([geo[u] for u in uids])
def allVeryLow(v): return bool(v and v.get('classes') and sum(v['classes'][1:]) == 0 and float(v.get('quakeMeanClass', 1)) <= 1.0)
def modPlus(v): return bool(v and v.get('classes') and sum(v['classes'][2:]) > 0) or bool(v and float(v.get('quakeMeanClass', 1)) > 1.0 and float(v.get('quakeShareHigh', 0)) > 0)
out = {}; nb = {}
for u in uids:
    g = geo[u]; near = [uids[i] for i in tree.query(g) if uids[i] != u and geo[uids[i]].intersects(g)]; nb[u] = near
for u in uids:
    v = U.get(u)
    if v is None: out[u] = {'possible': None, 'why': 'no GIRI summary for this tehsil'}; continue
    if not allVeryLow(v): out[u] = {'possible': True, 'why': 'GIRI cells above very low in the tehsil'}; continue
    t = [n for n in nb[u] if modPlus(U.get(n))]
    if t: out[u] = {'possible': True, 'why': 'every cell very low, but it touches tehsil(s) with moderate or higher susceptibility: ' + ', '.join(n.split('|')[2] for n in t[:3]), 'touches': t}; continue
    out[u] = {'possible': False, 'why': 'cannot happen here: every ~370 m cell of this tehsil and of the tehsils around it is in the lowest landslide susceptibility class (GIRI, very low, for rain- and earthquake-triggered landslides)'}
ev = list(csv.DictReader(open(a.events))); bad = [e['event_id'] + ' ' + e['uid'] for e in ev if out.get(e['uid'], {}).get('possible') is False]
cnt = {'cannotHappen': sum(1 for x in out.values() if x['possible'] is False), 'possible': sum(1 for x in out.values() if x['possible'] is True), 'noSummary': sum(1 for x in out.values() if x['possible'] is None)}
res = {'name': 'landslide-possible', 'version': 'lsp-91.17.283.47', 'built': '2026-11-02',
       'source': G.get('source'), 'sourceFile': 'data/giri-landslide-tehsil.json (built ' + str(G.get('built')) + ')',
       'rule': 'cannot happen = every GIRI cell of the tehsil very low (class 1) for rain- and earthquake-triggered landslides and no bordering tehsil with a moderate-or-higher cell; otherwise possible',
       'eventCheck': {'inventory': 'NASA Global Landslide Catalog, Pakistan (station-lake/reports/landslide_events.csv)', 'events': len(ev), 'inCannotHappen': bad, 'passed': not bad},
       'counts': cnt, 'units': out}
if bad: raise SystemExit('STOP: inventory events in cannot-happen tehsils: %s' % bad)
json.dump(res, open(a.out, 'w'), indent=0); print('landslide-possible', cnt, 'events', len(ev), 'in cannot-happen', len(bad))
