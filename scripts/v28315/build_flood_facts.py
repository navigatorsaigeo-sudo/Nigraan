#!/usr/bin/env python3
"""v91.17.283.15 . RIVER FLOOD AND FLASH-FLOOD FACTS PER PLACE -> data/flood-facts.json (one compact table, read by server/api/placefacts.mjs).

The long-term river flood facts of the cloud v2 science (HISAAB's native-pixel method, adopted 23 Oct 2026), computed once per named place
of the gazetteer (data/pk-places.tsv.gz) at the place's own coordinates, and stored as facts, never as a level:
  river     the containing 3 arc-second (about 90 m) pixel of the JRC / Copernicus GloFAS river flood maps v2.1.2 (return periods 10 .. 500 y),
            no resampling and no neighbouring maximum; a pixel with no wet return period on ground the maps cover is dry (the coverage
            record), off the coverage it is unknown; a producer advisory (permanent water, spurious depth) or a curve that falls withholds
            the depths; where the place's river link (the strongest GloFAS cell within 2 cells, ~11 km) is a channel the national channel
            review disputes (no river on the ground, MODIS 2002-2024 + Landsat), a wet map is withheld.
            Facts: first return period that wets the pixel, first return period with >= 0.5 m (a reported fact, not a class cut),
            depth in the 1-in-100 flood.
  observed  the observed flood history at the 1 arc-second pixel: UNOSAT maps 2010-2025, the government outlines 2010 / 2014 / 2022 / 2025,
            TU Wien Sentinel-1 2022, and the MODIS monsoon seasons 2002-2024 (at 12 arc-seconds). Unobserved is unknown, never dry.
  flash     the 1-in-100 hill-torrent corridor (HAND <= 5 m inside the flash domain: hilly ground away from the river domain with a
            mapped stream or mountain relief; GLO-30 HAND, HydroRIVERS) and the height above the nearest stream.
Inputs (read only): --native <folder with native.sqlite + receipt.json> (the HISAAB / v2 native flood store, 428 MB), --coverage
flood_coverage.npz, --review false_channels.json, --qbar glofas_qbar.npy, --observed observations.sqlite, --flash flash_domain.npz.
On the laptop these come from the v2 store (copy step in the package README); the table itself ships with the package.
Usage: python scripts/v28315/build_flood_facts.py --app <nigraan-local> --native ... --coverage ... --review ... --qbar ... --observed ...
       --flash ... [--out data/flood-facts.json]"""
import argparse, gzip, hashlib, json, math, os, sqlite3, struct, sys, time, zlib
from functools import lru_cache
import numpy as np

# store formats and fact definitions, with their source (no class cut is applied anywhere: these are facts)
PARAMS = {
    'depthFactM': (0.5, 'first return period with at least 0.5 m: a reported fact of HISAAB native_flood.physical_assessment, not a class cut'),
    'depthAtRp': (100, 'depth in the 1-in-100 flood: served as a fact (coordinator decision 23 Oct 2026)'),
    'coverageGrid': ({'north': 37.25, 'west': 60.75, 'cell': 0.0025, 'rows': 5500, 'cols': 6900}, 'g9 250 m grid of the coverage record (HISAAB flood_coverage GRID)'),
    'glofasGrid': ({'north': 37.2, 'west': 60.5, 'res': 0.05, 'cols': 348}, 'false_channels.json grid: GloFAS v4 0.05 deg, flat index row*348+col'),
    'linkRadiusCells': (2, 'HISAAB PAR-017: river link radius 2 GloFAS cells (~11 km)'),
}
V = lambda k: PARAMS[k][0]


class Native:
    def __init__(self, folder):
        self.db = sqlite3.connect('file:' + os.path.join(folder, 'native.sqlite') + '?mode=ro', uri=True)
        m = {k: json.loads(v) for k, v in self.db.execute('SELECT key,value FROM metadata')}
        if m.get('schema') != 'native-flood-blocks-1': raise SystemExit('native store: unknown schema')
        self.rps, self.tiles, self.bs = m['return_periods'], m['tiles'], m['block_size']
        self.receipt = json.load(open(os.path.join(folder, 'receipt.json'), encoding='utf-8'))

    @lru_cache(maxsize=64)
    def block(self, tile, br, bc):
        row = self.db.execute('SELECT height,width,payload,raw_sha256 FROM blocks WHERE tile=? AND block_row=? AND block_col=?', (tile, br, bc)).fetchone()
        if row is None: return None
        h, w, payload, digest = row; raw = zlib.decompress(payload)
        if len(raw) != (5 * len(self.rps) + 2) * h * w or hashlib.sha256(raw).hexdigest() != digest: raise SystemExit('native store: corrupt block')
        return h, w, raw

    def sample(self, lat, lon):
        found = []
        for t in self.tiles:
            a, _, c, _, e, f = t['transform'][:6]; r, cc = math.floor((lat - f) / e), math.floor((lon - c) / a)
            if 0 <= r < t['height'] and 0 <= cc < t['width']: found.append((t, r, cc))
        if len(found) != 1: return {'status': 'outside' if not found else 'ambiguous'}
        t, r, c = found[0]; b = self.block(t['id'], r // self.bs, c // self.bs)
        if b is None: return {'status': 'unsaved'}
        h, w, raw = b; n = h * w; i = (r % self.bs) * w + (c % self.bs); k = len(self.rps); d, sup = [], []
        for p in range(k):
            v = struct.unpack_from('<f', raw, 4 * (p * n + i))[0]; m = raw[4 * k * n + p * n + i]
            st = 'missing' if m == 0 else 'invalid' if not math.isfinite(v) or v < 0 else 'known'
            d.append(v if st == 'known' else None); sup.append(st)
        flags = [raw[5 * k * n + p * n + i] for p in range(2)]   # permanent water, spurious depth (1 = flagged, 255 = none recorded, 0 = unflagged)
        return {'status': 'sampled', 'depths': d, 'support': sup, 'advisory': any(f not in (0, 255) for f in flags)}


class Coverage:
    def __init__(self, path):
        z = np.load(path, allow_pickle=False); g = V('coverageGrid')
        if tuple(int(x) for x in z['shape']) != (g['rows'], g['cols']): raise SystemExit('coverage record: other grid')
        self.cov = z['covered'].tobytes()

    def covered(self, lat, lon):
        g = V('coverageGrid'); r = int((g['north'] - lat) // g['cell']); c = int((lon - g['west']) // g['cell'])
        if not (0 <= r < g['rows'] and 0 <= c < g['cols']): return False
        i = r * g['cols'] + c; return bool((self.cov[i >> 3] >> (7 - (i & 7))) & 1)


def river_fact(N, C, disputed, qbar, lat, lon):
    """-> status code and facts: 0 dry on covered ground, 1 wet (facts), 2 partial, 3 unknown, 4 withheld (channel disputed)"""
    s = N.sample(lat, lon)
    if s['status'] != 'sampled': return 3, None, None, None
    d, sup = s['depths'], s['support']; rps = N.rps
    if 'invalid' in sup: return 3, None, None, None
    known = [v for v in d if v is not None]
    src = 'none' if not known else 'decline' if any(x > y for x, y in zip(known, known[1:])) else 'partial' if len(known) != len(rps) else 'complete'
    cov = C.covered(lat, lon)
    if src == 'none':   # no wet return period: dry on covered ground (the coverage record), unknown off it
        if not cov: return 3, None, None, None
        d = [0.0] * len(rps)
    elif src == 'decline': return 3, None, None, None   # a curve that falls is not repaired
    elif src == 'partial':   # depths known from some return period on, none below it, on covered ground: the lower periods are dry
        first = next(i for i, v in enumerate(d) if v is not None)
        if not (cov and all(v is not None for v in d[first:])): return (3 if s['advisory'] else 2), None, None, None
        d = [0.0 if v is None else v for v in d]
        if any(x > y for x, y in zip(d, d[1:])): return (3 if s['advisory'] else 2), None, None, None
    elif s['advisory']: return 3, None, None, None   # a producer advisory (permanent water, spurious depth) withholds the curve
    wet = any(v > 0 for v in d)
    if wet and disputed is not None:   # the river link: the strongest GloFAS cell within the radius of the place's own cell
        g = V('glofasGrid'); r = int((g['north'] - lat) // g['res']); c = int((lon - g['west']) // g['res']); R = V('linkRadiusCells'); best, score = None, -np.inf
        for di in range(-R, R + 1):
            for dj in range(-R, R + 1):
                y, x = r + di, c + dj
                if 0 <= y < qbar.shape[0] and 0 <= x < qbar.shape[1] and np.isfinite(qbar[y, x]) and qbar[y, x] >= 0 and qbar[y, x] > score: best, score = (y, x), qbar[y, x]
        if best is not None and best[0] * g['cols'] + best[1] in disputed: return 4, None, None, None
    fw = next((rp for rp, v in zip(rps, d) if v > 0), None); f5 = next((rp for rp, v in zip(rps, d) if v >= V('depthFactM')), None)
    d100 = d[rps.index(V('depthAtRp'))]
    return (1 if wet else 0), fw, f5, round(d100, 2)


class Observed:
    def __init__(self, path):
        self.db = sqlite3.connect('file:' + path + '?mode=ro', uri=True)
        meta = json.loads(self.db.execute("SELECT value FROM metadata WHERE key='index'").fetchone()[0])
        if meta['schema'] != 'observed-floods-1': raise SystemExit('observed store: unknown schema')
        self.grid = meta['grid']; self.layers = [json.loads(m) for (m,) in self.db.execute('SELECT meta FROM layers')]

    @lru_cache(maxsize=2048)
    def block(self, lid, br, bc):
        row = self.db.execute('SELECT h, w, payload FROM blocks WHERE layer=? AND br=? AND bc=?', (lid, br, bc)).fetchone()
        if row is None: return None
        h, w, payload = row; return h, w, zlib.decompress(payload)

    def at(self, lat, lon):
        fy, sy, mf, mo = set(), set(), 0, 0
        for L in self.layers:
            g = L['grid'] if L['kind'] == 'seasons' else self.grid
            r = int((g['north'] - lat) // g['res_deg']); c = int((lon - g['west']) // g['res_deg'])
            if not (0 <= r < g['rows'] and 0 <= c < g['cols']): continue
            b = self.block(L['id'], r // g['block'], c // g['block'])
            if b is None: continue
            h, w, raw = b; i = (r % g['block']) * w + (c % g['block'])
            if L['kind'] == 'seasons':
                f = int(np.frombuffer(raw, '<u4', 1, 4 * i)[0]); o = int(np.frombuffer(raw, '<u4', 1, 4 * (h * w + i))[0]); ys = L['seasons']
                fl = [y for k, y in enumerate(ys) if f >> k & 1]; ob = [y for k, y in enumerate(ys) if o >> k & 1]
                fy.update(fl); sy.update(ob); mf, mo = len(fl), len(ob); continue
            n = (h * w + 7) // 8; F = raw[i >> 3] >> (7 - (i & 7)) & 1; O = raw[n + (i >> 3)] >> (7 - (i & 7)) & 1
            if F: fy.add(L['year']); sy.add(L['year'])
            elif O and L['kind'] != 'outline': sy.add(L['year'])
        return sorted(fy), sorted(sy), mf, mo


class Flash:
    def __init__(self, path):
        self.Z = np.load(path); self.cache = {}

    def at(self, lat, lon):
        la, lo = math.floor(lat), math.floor(lon); key = 't%d_%d' % (la, lo)
        if key + '_dom' not in self.Z.files: return 0, None
        if key not in self.cache:
            if len(self.cache) > 24: self.cache.clear()
            self.cache[key] = {k: self.Z[key + '_' + k].reshape(-1) for k in ('dom', 'cor100', 'proc', 'hand')}
        T = self.cache[key]; i = min(1199, int((la + 1 - lat) * 1200)); j = min(1199, int((lon - lo) * 1200)); k = i * 1200 + j   # a point on the tile's south / east edge: its last row / column
        bit = lambda nm: bool((T[nm][k >> 3] >> (7 - (k & 7))) & 1)
        hv = int(T['hand'][k]); hand = None if hv == 255 else hv
        if not bit('proc'): return 1, hand
        if not bit('dom'): return 2, hand
        return (4 if bit('cor100') else 3), hand


def main():
    ap = argparse.ArgumentParser(); A = lambda *a, **k: ap.add_argument(*a, **k)
    A('--app', required=True); A('--native', required=True); A('--coverage', required=True); A('--review', required=True); A('--qbar', required=True)
    A('--observed', required=True); A('--flash', required=True); A('--out', default=None)
    a = ap.parse_args(); t0 = time.time()
    places = []
    with gzip.open(os.path.join(a.app, 'data', 'pk-places.tsv.gz'), 'rt', encoding='utf-8') as h:
        for line in h:
            p = line.rstrip('\n').split('\t')
            try: places.append((float(p[3]), float(p[4])))
            except (ValueError, IndexError): pass
    pts = sorted(set((round(la, 5), round(lo, 5)) for la, lo in places), key=lambda q: (int(q[0] * 4), int(q[1] * 4), q[0], q[1]))
    N = Native(a.native); C = Coverage(a.coverage); O = Observed(a.observed); FL = Flash(a.flash)
    rv = json.load(open(a.review, encoding='utf-8')); listed = set(int(x) for x in rv.get('cells') or [])
    disputed = {int(r['cell']) for r in rv.get('detail') or [] if r.get('no_river_flood') is True and int(r.get('cell', -1)) in listed}
    qbar = np.load(a.qbar)
    years = sorted({L['year'] for L in O.layers if L.get('year')} | set(next((L['seasons'] for L in O.layers if L['kind'] == 'seasons'), [])))
    Y = {y: k for k, y in enumerate(years)}
    cols = {k: [] for k in ('lat', 'lon', 'rs', 'fw', 'f5', 'd100', 'fy', 'sy', 'mf', 'mo', 'fl', 'fh')}
    for n, (la, lo) in enumerate(pts):
        rs, fw, f5, d100 = river_fact(N, C, disputed, qbar, la, lo)
        fy, sy, mf, mo = O.at(la, lo); fl, fh = FL.at(la, lo)
        bm = lambda ys: sum(1 << Y[y] for y in ys)
        for k, v in (('lat', round(la * 1e5)), ('lon', round(lo * 1e5)), ('rs', rs), ('fw', fw or 0), ('f5', f5 or 0), ('d100', -1 if d100 is None else round(d100 * 100)),
                     ('fy', bm(fy)), ('sy', bm(sy)), ('mf', mf), ('mo', mo), ('fl', fl), ('fh', 255 if fh is None else fh)):
            cols[k].append(v)
        if n % 20000 == 0: print('%d / %d places, %.0f s' % (n, len(pts), time.time() - t0), flush=True)
    out = {'name': 'flood-facts', 'version': 'flood-facts-91.17.283.15', 'built': time.strftime('%Y-%m-%d', time.gmtime()), 'places': len(pts),
           'what': 'river flood facts (no level), observed flood history and the 1-in-100 hill-torrent corridor at the coordinates of every named place of data/pk-places.tsv.gz',
           'columns': {'lat': 'latitude x 1e5', 'lon': 'longitude x 1e5', 'rs': 'river map: 0 dry on covered ground, 1 wet (facts), 2 partial return periods only, 3 unknown (off the coverage, producer advisory or a falling curve), 4 withheld (the linked channel is disputed by the channel review)',
                       'fw': 'first return period (years) that wets the pixel, 0 none', 'f5': 'first return period with >= 0.5 m, 0 none', 'd100': 'depth in the 1-in-100 flood (cm), -1 not known',
                       'fy': 'bit k: flood water seen in years[k]', 'sy': 'bit k: the place was observed in years[k]', 'mf': 'MODIS monsoons flooded (2002-2024)', 'mo': 'MODIS monsoons observed',
                       'fl': 'hill-torrent corridor: 0 not mapped (unknown), 1 outside the mapped area, 2 outside the flash domain (no claim), 3 outside the 1-in-100 corridor, 4 inside the 1-in-100 corridor', 'fh': 'height above the nearest stream (0.1 m), 255 not known'},
           'years': years, 'returnPeriods': N.rps,
           'sources': {'riverMaps': 'JRC / Copernicus GloFAS global river flood hazard maps v2.1.2 (Baugh et al. 2024), 3 arc-second, undefended, 1-in-10 to 1-in-500 years',
                       'channelReview': rv.get('what'), 'observed': 'UNOSAT flood maps 2010-2025, government flood outlines 2010/2014/2022/2025, TU Wien Sentinel-1 2022, MODIS monsoon seasons 2002-2024',
                       'flash': 'ASF GLO-30 HAND (CC BY 4.0), HydroRIVERS v1.0; corridor HAND <= 5 m (Nobre et al. 2011) inside the flash domain, 1-in-100 only'},
           'params': {k: {'value': v[0], 'source': v[1]} for k, v in PARAMS.items()},
           'inputs': {'nativeStoreSha256': N.receipt.get('database_sha256'), 'channelCellsDisputed': len(disputed)},
           'method': 'scripts/v28315/build_flood_facts.py (the v2 science: HISAAB native-pixel method, coverage record, channel review, observed store, flash corridor)',
           **cols}
    p = a.out or os.path.join(a.app, 'data', 'flood-facts.json'); tmp = p + '.tmp'
    with open(tmp, 'w', encoding='ascii') as o: json.dump(out, o, separators=(',', ':'))
    os.replace(tmp, p)
    c = lambda k, v: sum(1 for x in cols[k] if x == v)
    print('wrote %s: %d places in %.0f s; river dry %d wet %d partial %d unknown %d withheld %d; observed flooded %d; corridor in %d out %d'
          % (p, len(pts), time.time() - t0, c('rs', 0), c('rs', 1), c('rs', 2), c('rs', 3), c('rs', 4), sum(1 for x in cols['fy'] if x), c('fl', 4), c('fl', 3)))


if __name__ == '__main__':
    sys.exit(main())
