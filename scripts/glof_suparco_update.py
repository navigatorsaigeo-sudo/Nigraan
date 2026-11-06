#!/usr/bin/env python3
"""
glof_suparco_update.py  (v91.17.275 HAZ2) - the GLOF register on SUPARCO's current lake inventory where it is newer.

Owner (30 Sep / 17 Oct 2026): SUPARCO's lake inventory is more current than the 2024 national (PMD) inventory; credit SUPARCO by
name. Until v91.17.274 SUPARCO's inventory (data/glof-suparco-inventory.json, SUPARCO Glacier Geospatial Portal, 3,906 lakes) was
only DRAWN on the map; the GLOF level (routing, susceptibility, tehsil level, asset upstream check) still read the 2024 areas.

What this script does [every rule taken from the register's own files, nothing hand-set]:
  1. Match each SUPARCO lake to the register lake nearest to it, mutual nearest, within the register's own point-match rule
     (merge.pointMatchM, 500 m). The distance distribution is bimodal (median 30 m; 75th percentile 524 m), so the rule
     separates same-lake pairs from neighbours.
  2. A matched lake takes SUPARCO's area (areaKm2; the 2024 / Hi-MAG area kept as areaRegisterKm2) and its susceptibility is
     recomputed with THE SAME fitted model (register `model`: L2 logistic, leave-one-basin-out AUC 0.82): only the logArea
     feature changes, so the model's logit moves by coef_logArea x (log10 A_new - log10 A_old) / sd_logArea (exact for this
     model; the floor 1e-3 km2 as the model's own feature rule). A lake carrying a documented-outburst S (S != sModel) keeps
     its record value in S; sModel (what the ladder reads) is updated. The tier follows the register's S cuts with the
     national listing as a floor (register rules 1-2).
  3. A SUPARCO lake with no register counterpart is ADDED when it is a glacial lake by the register's own rule (glacier
     distance <= the largest glacier distance in the open register) and its point lies in a HydroBASINS level-12 basin the
     register already routes (data/glof-basins-merged.json). Its route follows NEXT_DOWN with the register's distance rule
     (max of the DIST_MAIN step and the straight line to the basin, to 100 km). S from the same model: area and glacier
     distance from SUPARCO; lake type, slope, relief, surge, growth and persistence at the model mean (not in SUPARCO's
     attributes; the same convention the merge used for growth and persistence). Tier from the S cuts. Tehsil from
     data/pk-tehsils.json (Indian-occupied units excluded, as the register).
  4. Register lakes SUPARCO does not list are kept unchanged (absence from one inventory is not evidence a lake is gone).
Output: data/glof-register-current.json (same schema as glof-register-merged.json + `suparco` block and per-lake
`areaSource`); glof.mjs reads it before the merged register (NIGRAAN_GLOF_SUPARCO=0 falls back).
Usage: python3 scripts/glof_suparco_update.py [--data data]
"""
import sys, os, json, math, collections, datetime as dt
import numpy as np
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

a = sys.argv[1:]
DATA = os.path.abspath(a[a.index('--data') + 1] if '--data' in a else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
REG = json.load(open(os.path.join(DATA, 'glof-register-merged.json')))
SUP = json.load(open(os.path.join(DATA, 'glof-suparco-inventory.json')))
BAS = json.load(open(os.path.join(DATA, 'glof-basins-merged.json')))
TEH = json.load(open(os.path.join(DATA, 'pk-tehsils.json')))['features']
OPN = json.load(open(os.path.join(DATA, 'glof-register-open.json')))
M = REG['model']; FEAT, MU, SD, CO, B0 = M['features'], M['mean'], M['sd'], M['coef'], M['intercept']
MATCH_M = REG['merge']['pointMatchM']; ROUTE_KM = REG['routeKm']
cut1, cut2 = REG['params']['tierCuts']['value']['priority'], REG['params']['tierCuts']['value']['elevated']
GLACIAL_MAX_M = max(L['glacierDistM'] for L in OPN['lakes'] if L.get('glacierDistM') is not None)
logit = lambda p: math.log(p / (1 - p)); sig = lambda z: 1 / (1 + math.exp(-z))
la10 = lambda A: math.log10(max(A, 1e-3))

def s_model(x):
    return sig(B0 + sum(CO[f] * ((x[f] if x.get(f) is not None else MU[f]) - MU[f]) / SD[f] for f in FEAT))

def hav(la1, lo1, la2, lo2):
    r = math.pi / 180; x = math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(x))

lakes = REG['lakes']; sl = SUP['lakes']
RL = np.radians(np.array([[L['lat'], L['lon']] for L in lakes])); SLa = np.radians(np.array([[r[0], r[1]] for r in sl]))
def dmat(A, B):
    x = np.sin((B[None, :, 0] - A[:, None, 0]) / 2) ** 2 + np.cos(A[:, None, 0]) * np.cos(B[None, :, 0]) * np.sin((B[None, :, 1] - A[:, None, 1]) / 2) ** 2
    return 2 * 6371008.8 * np.arcsin(np.sqrt(x))
D = dmat(SLa, RL); ns = D.argmin(1); ds = D.min(1); nr = D.argmin(0)
pairs = {int(ns[i]): i for i in range(len(sl)) if nr[ns[i]] == i and ds[i] <= MATCH_M}

def tier_of(L, s):
    t = 1 if s >= cut1 else 2 if s >= cut2 else 3
    if L.get('listed'): t = min(t, 2 if L.get('tier', 3) != 1 else 1)
    return t

changed = {'matched': 0, 'areaChanged': 0, 'tierUp': 0, 'tierDown': 0, 'sUp': 0, 'sDown': 0}
for j, i in pairs.items():
    L = lakes[j]; r = sl[i]; A = r[2]
    L['suparcoInventory'] = {'glimsId': r[6], 'areaKm2': A, 'type': r[3], 'basin': r[4], 'elevM': r[5], 'glacierDistM': r[7], 'matchM': round(float(ds[i]))}
    changed['matched'] += 1
    if A is None or A <= 0 or not L.get('areaKm2'):
        L['areaSource'] = 'register (SUPARCO lists no area)'; continue
    A0 = L['areaKm2']; L['areaRegisterKm2'] = A0; L['areaKm2'] = A; L['areaSource'] = 'SUPARCO Glacier Geospatial Portal'
    if abs(A - A0) > 1e-9: changed['areaChanged'] += 1
    dz = CO['logArea'] * (la10(A) - la10(A0)) / SD['logArea']
    sm0 = L.get('sModel', L['S'])
    if sm0 is None or not (0 < sm0 < 1): continue
    sm = round(sig(logit(sm0) + dz), 5)
    L['sModelRegister'] = sm0; L['sModel'] = sm
    if L['S'] == sm0: L['S'] = sm
    t0 = L['tier']; t = tier_of(L, max(L['S'], sm)) if L.get('origin') != 'event-site' else t0
    if t < t0: changed['tierUp'] += 1
    if t > t0: changed['tierDown'] += 1
    L['tier'] = t
    changed['sUp' if sm > sm0 else 'sDown'] += (sm != sm0)

# ── 3. SUPARCO lakes the register lacks ──
BP = {f['properties']['id']: f['properties'] for f in BAS['features']}
BG = {f['properties']['id']: shape(f['geometry']) for f in BAS['features']}
bids = list(BG); btree = STRtree([BG[k] for k in bids]); REP = {b: (BG[b].representative_point().y, BG[b].representative_point().x) for b in bids}
TG = [shape(f['geometry']) for f in TEH]; ttree = STRtree(TG)
def tehsil_of(pt, tol=0.02):
    c = [k for k in ttree.query(pt) if TG[k].contains(pt)]
    if not c:
        k = ttree.nearest(pt); c = [k] if TG[k].distance(pt) < tol else []
    p = TEH[c[0]]['properties'] if c else None
    return p if p and p.get('province') != 'Indian Illegally Occupied Jammu Kashmir' else None
def basin_of(pt):
    c = [bids[k] for k in btree.query(pt) if BG[bids[k]].contains(pt)]
    return c[0] if c else None
def route(b, lat, lon):
    chain = []; d0 = BP[b]['distMain']; cur = b; g = 0
    while cur and cur in BP and g < 400:
        km = max(d0 - BP[cur]['distMain'], hav(lat, lon, REP[cur][0], REP[cur][1]) if cur != b else 0.0)
        if km > ROUTE_KM: break
        chain.append([cur, round(km, 1)]); cur = BP[cur]['down'] or None; g += 1
    return chain
def basin_pk(b):
    y, x = REP[b]; return tehsil_of(Point(x, y), 0.0) is not None
matched_s = set(pairs.values()); added = []; why = collections.Counter()
for i, r in enumerate(sl):
    if i in matched_s: continue
    if ds[i] <= MATCH_M: why['near a register lake, not mutual nearest (same lake, second record)'] += 1; continue
    if r[2] is None or r[2] <= 0: why['no area'] += 1; continue
    if r[7] is None or r[7] > GLACIAL_MAX_M: why['not glacial by the register rule'] += 1; continue
    pt = Point(r[1], r[0]); b = basin_of(pt)
    if not b: why['outside the routed basins'] += 1; continue
    ch = route(b, r[0], r[1]); te = tehsil_of(pt)
    if not te and not any(basin_pk(bb) for bb, _ in ch): why['route never enters a Pakistan-administered tehsil'] += 1; continue
    x = {'logArea': la10(r[2]), 'logGlacierDist': math.log10(1 + max(0.0, float(r[7])))}
    s = round(s_model(x), 5); t = 1 if s >= cut1 else 2 if s >= cut2 else 3
    gid = r[6] or ('%.5f,%.5f' % (r[0], r[1]))
    rec = {'id': 'SLI-%04d' % (len(added) + 1), 'src': 'SUPARCO Glacier Geospatial Portal', 'origin': 'suparco', 'name': None, 'lat': r[0], 'lon': r[1],
           'areaKm2': r[2], 'areaSource': 'SUPARCO Glacier Geospatial Portal', 'dam': None, 'lakeType': r[3], 'glacierType': None, 'glacierDistM': r[7],
           'nearGlacier': None, 'settlement': None, 'settlementDistM': None,
           'tehsil': te.get('tehsil') if te else None, 'district': te.get('district') if te else None, 'province': te.get('province') if te else None,
           'unitUid': te.get('uid') if te else None, 'transboundary': not te, 'nullah': None, 'listed': None, 'liveIds': {'inventory': None, 'open': None},
           'match': None, 'S': s, 'sModel': s, 'sPct': None,
           'sBasis': 'register model applied to SUPARCO attributes (area, glacier distance); lake type, slope, relief, surge, growth and persistence at the model mean',
           'tierBasis': 'susceptibility model (SUPARCO attributes)', 'surge': None, 'events': None, 'basin12': b, 'damsDownstream': [], 'elevApproxM': r[5], 'tier': t,
           'suparcoInventory': {'glimsId': r[6], 'areaKm2': r[2], 'type': r[3], 'basin': r[4], 'elevM': r[5], 'glacierDistM': r[7], 'matchM': None}, 'route': ch}
    added.append(rec); why['added'] += 1
lakes.extend(added)
REG['lakes'] = lakes
REG['version'] = 'v91.17.275-suparco'
REG['built'] = dt.date.today().isoformat()
REG['source'] = ('SUPARCO Glacier Geospatial Portal lake inventory (current areas and lakes) over the register of the 2024 national inventory '
                 'and the open register (Hi-MAG, RGI 7.0, HMAGLOFDB)')
REG['suparco'] = {'inventoryBuilt': SUP['built'], 'credit': SUP['credit'], 'url': SUP['url'], 'count': len(sl), 'matchRule': 'mutual nearest within merge.pointMatchM = %d m' % MATCH_M,
                  'matchedLakes': changed['matched'], 'areasUpdated': changed['areaChanged'], 'sModelUp': changed['sUp'], 'sModelDown': changed['sDown'],
                  'tierUp': changed['tierUp'], 'tierDown': changed['tierDown'], 'added': len(added), 'notAdded': dict(why),
                  'addedTiers': dict(collections.Counter(L['tier'] for L in added)), 'glacialMaxM': GLACIAL_MAX_M,
                  'method': 'scripts/glof_suparco_update.py (header)'}
REG['rules'] = dict(REG['rules'], **{
    '1': 'High susceptibility (tier 1): S at or above the top cut, or on SUPARCO\'s potentially-dangerous lake list at its top tier',
    '2': 'Moderate susceptibility (tier 2): S at or above the second cut, or on SUPARCO\'s potentially-dangerous lake list',
    '3': 'Low susceptibility (tier 3): every other mapped glacial lake; it still contributes through its S',
    'suparco': 'areas and lakes from the SUPARCO Glacier Geospatial Portal inventory where it holds the lake (mutual nearest within %d m); '
               'lakes only the 2024 national inventory or Hi-MAG hold are kept as they were' % MATCH_M})
REG['counts']['lakes'] = len(lakes); REG['counts']['tiers'] = dict(collections.Counter(str(L['tier']) for L in lakes))
out = os.path.join(DATA, 'glof-register-current.json')
json.dump(REG, open(out + '.tmp', 'w')); os.replace(out + '.tmp', out)
print(json.dumps(REG['suparco'], indent=1)); print('tiers', REG['counts']['tiers'], '->', out)
