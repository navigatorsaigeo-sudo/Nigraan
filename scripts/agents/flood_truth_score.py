#!/usr/bin/env python3
"""v91.17.283.8 . agent 4 . score the flood shadow (scripts/agents/flood_shadow.mjs) against the flood truth an operator dropped in
data/flood-truth/drop/ (registered in data/flood-truth/registry.json). Never changes a served value; writes data/agents/flood/scores.jsonl
and the registry status only.
  C3 (fx_jrc_hand): the shadow bitmap of every shadow day whose forecast window (day .. day+3) holds the truth date (the window's last day)
     against the truth rasterized on the extent grid (250 m cell-centre rule, as fx_grid). Observed area = the truth file's bounding frame
     (an operator drop carries no analysis extent; a file named *Analysis* beside it is not read). Per reach zone (fx_r) with >= 200 framed
     cells: CSI, hit rate, false-alarm share; and the comparator B2 = JRC 1-in-10 wet (data/flood-depth tiles) on the same cells, as R2.
  D25 (rain_d25): over the tehsils with >= 40 framed cells outside the river domain (no fx_r cell), event = the tehsil's flooded share above
     the frame-wide share (A3 rule); AUC of the shadow's d25 (ties by max day rain) against the event, with a 2000-draw tehsil bootstrap 95 %.
  Missing Python packages or inputs: the entry says "not scored" with the reason.
usage: python3 flood_truth_score.py --data <nigraan data folder>"""
import argparse, json, os, sys, zlib, hashlib, datetime as dt

def jr(p, d=None):
    try:
        with open(p, 'r', encoding='utf-8') as h: return json.load(h)
    except Exception: return d

def jw(p, o):
    t = p + '.tmp'
    with open(t, 'w', encoding='utf-8') as h: json.dump(o, h, indent=1)
    os.replace(t, p)

def agnj_reader(dd):
    """the packed JRC depth tiles (flooddepth.mjs format): 'AGNJ', nrp at 5, nb (u16) at 6, index of (offset u32, length u32), deflated blocks"""
    import numpy as np
    IX = jr(os.path.join(dd, 'flood-depth', 'index.json'));  cache = {}
    if not IX: return None
    G = IX['grid']; N, B = G['cellsPerDegree'], G['block']
    def rp10(lat, lon):
        row = int((G['top'] - lat) * N); col = int((lon - G['left']) * N); cr, cc = row // N, col // N
        name = 'jrc_N%d_E%d.bin' % (G['top'] - cr, G['left'] + cc)
        if name not in (IX.get('files') or {}): return 0
        if name not in cache:
            p = os.path.join(dd, 'flood-depth', name)
            if not os.path.exists(p): return None
            b = open(p, 'rb').read(); nb = int.from_bytes(b[6:8], 'little'); nrp = b[5]
            idx = [(int.from_bytes(b[8 + 8 * k:12 + 8 * k], 'little'), int.from_bytes(b[12 + 8 * k:16 + 8 * k], 'little')) for k in range(nb * nb)]
            cache[name] = (b, nb, nrp, idx, {})
        b, nb, nrp, idx, blk = cache[name]; lr, lc = row - cr * N, col - cc * N; bi, bj = lr // B, lc // B; k = bi * nb + bj; o, l = idx[k]
        if not l: return 0
        if k not in blk: blk[k] = np.frombuffer(zlib.decompress(b[o:o + l]), np.uint8)
        a = blk[k]; r, c = lr - bi * B, lc - bj * B
        return a[0 * B * B + r * B + c] / 10.0
    return rp10

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--data', required=True); a = ap.parse_args(); dd = a.data
    regf = os.path.join(dd, 'flood-truth', 'registry.json'); reg = jr(regf, {'entries': []}); out = os.path.join(dd, 'agents', 'flood', 'scores.jsonl')
    pend = [e for e in reg.get('entries', []) if e.get('window') and 'not yet scored' in str(e.get('status'))]
    if not pend: print('nothing to score'); return 0
    try:
        import numpy as np, geopandas as gpd
        from rasterio.features import rasterize
        from rasterio.transform import from_origin
    except Exception as e:
        for x in pend: x['status'] = 'registered, not yet scored (the scorer needs the Python packages numpy, geopandas and rasterio: %s)' % e
        jw(regf, reg); print('not scored: %s' % e); return 3
    fx = os.path.join(dd, 'flood-extent'); HJ = jr(os.path.join(fx, 'fx_h.json')); RJ = jr(os.path.join(fx, 'fx_r.json'))
    if not HJ or not RJ:
        print('not scored: the extent grid bands are not on this computer'); return 3
    g = HJ['grid']; H, W = g['rows'], g['cols']; T = from_origin(g['west'], g['north'], g['cell'], g['cell'])
    def band(J, name):
        a = np.full(H * W, -32768, np.int16); f = open(os.path.join(fx, name + '.p0.bin'), 'rb')
        for key, (_, off, ln) in J['blocks'].items():
            br, bc = map(int, key.split(',')); f.seek(off); v = np.frombuffer(zlib.decompress(f.read(ln)), np.int16).reshape(g['block'], g['block'])
            r0, c0 = br * g['block'], bc * g['block']; r1, c1 = min(H, r0 + g['block']), min(W, c0 + g['block'])
            a.reshape(H, W)[r0:r1, c0:c1] = v[:r1 - r0, :c1 - c0]
        return a
    reach = band(RJ, 'fx_r'); Mo = jr(os.path.join(fx, 'fx-model.json'), {}); order = Mo.get('reachOrder', [])
    lat = g['north'] - (np.arange(H) + 0.5) * g['cell']; lon = g['west'] + (np.arange(W) + 0.5) * g['cell']
    rp10 = agnj_reader(dd); TH = jr(os.path.join(dd, 'pk-tehsils.json'), {}).get('features', [])
    shadows = sorted(f for f in os.listdir(os.path.join(dd, 'agents', 'flood', 'shadow')) if f.endswith('.json')) if os.path.isdir(os.path.join(dd, 'agents', 'flood', 'shadow')) else []
    for e in pend:
        res = {'at': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'truth': e['id'], 'file': e['file'], 'window': e['window'], 'scores': []}
        try:
            p = os.path.join(dd, 'flood-truth', e['file']); src = ('zip://' + p) if p.lower().endswith('.zip') else p
            gdf = gpd.read_file(src); gdf = gdf[gdf.geometry.notna()]
            if gdf.crs is not None and gdf.crs.to_epsg() not in (4326, None): gdf = gdf.to_crs(4326)
            truth = rasterize(((geom, 1) for geom in gdf.explode(index_parts=False).geometry), out_shape=(H, W), transform=T, fill=0, dtype='uint8').ravel().astype(bool)
            x0, y0, x1, y1 = gdf.total_bounds; frame = ((lat >= y0) & (lat <= y1))[:, None] & ((lon >= x0) & (lon <= x1))[None, :]; frame = frame.ravel()
            d1 = e['window']['to']
            for sf in shadows:
                day = sf[:10]; end = (dt.date.fromisoformat(day) + dt.timedelta(days=3)).isoformat()
                if not (day <= d1 <= end): continue
                S = jr(os.path.join(dd, 'agents', 'flood', 'shadow', sf), {}); C = (S.get('candidates') or {})
                c3 = C.get('fx_jrc_hand') or {}
                if c3.get('status') in ('ok', 'partial'):
                    bits = np.unpackbits(np.frombuffer(zlib.decompress(open(os.path.join(dd, c3['bitmap']), 'rb').read()), np.uint8), bitorder='little')[:H * W].astype(bool)
                    zs = []
                    for k, rid in enumerate(order):
                        z = (reach == k) & frame
                        if z.sum() < 200: continue
                        pr, ob = bits & z, truth & z; hit = int((pr & ob).sum()); miss = int((~pr & ob).sum()); fa = int((pr & ~ob).sum())
                        b2 = None
                        if rp10:
                            ii = np.flatnonzero(z); w = np.array([((rp10(lat[i // W], lon[i % W]) or 0) > 0) for i in ii], bool)
                            bh = int((w & truth[ii]).sum()); bm = int((~w & truth[ii]).sum()); bf = int((w & ~truth[ii]).sum()); b2 = round(bh / (bh + bm + bf), 3) if bh + bm + bf else None
                        zs.append({'reach': rid, 'cells': int(z.sum()), 'csi': round(hit / (hit + miss + fa), 3) if hit + miss + fa else None, 'pod': round(hit / (hit + miss), 3) if hit + miss else None,
                                   'falseShare': round(fa / (hit + fa), 3) if hit + fa else None, 'csiB2': b2})
                    res['scores'].append({'shadowDay': day, 'candidate': 'fx_jrc_hand', 'zones': zs, 'note': 'observed = the truth file\'s bounding frame'})
                d25 = C.get('rain_d25') or {}
                if d25.get('status') == 'ok' and TH:
                    tid = rasterize(((f['geometry'], i + 1) for i, f in enumerate(TH)), out_shape=(H, W), transform=T, fill=0, dtype='uint16').ravel()
                    sel = frame & (reach == -32768) & (tid > 0); n_all = np.bincount(tid[sel], minlength=len(TH) + 1); n_fl = np.bincount(tid[sel], weights=truth[sel], minlength=len(TH) + 1)
                    fs = float(n_fl.sum() / n_all.sum()) if n_all.sum() else None; xs, ys = [], []
                    for i, f in enumerate(TH):
                        if n_all[i + 1] < 40: continue
                        u = (d25.get('units') or {}).get((f.get('properties') or {}).get('uid'))
                        if not u: continue
                        xs.append(u['d25'] + (u.get('maxDayMm') or 0) / 1000.0); ys.append(1 if n_fl[i + 1] / n_all[i + 1] > fs else 0)
                    if sum(ys) and sum(ys) < len(ys):
                        X, Y = np.array(xs), np.array(ys); rng = np.random.default_rng(3)
                        def auc(x, y):
                            from scipy.stats import rankdata
                            r = rankdata(x); n1 = y.sum(); n0 = len(y) - n1; return (r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
                        bs = []
                        for _ in range(2000):
                            k = rng.integers(0, len(Y), len(Y))
                            if 0 < Y[k].sum() < len(k): bs.append(auc(X[k], Y[k]))
                        res['scores'].append({'shadowDay': day, 'candidate': 'rain_d25', 'tehsils': len(Y), 'events': int(Y.sum()), 'auc': round(float(auc(X, Y)), 3), 'auc95': [round(float(np.percentile(bs, 2.5)), 3), round(float(np.percentile(bs, 97.5)), 3)] if bs else None, 'frameShare': fs})
                    else: res['scores'].append({'shadowDay': day, 'candidate': 'rain_d25', 'why': 'not scored: no tehsil contrast (all or none flooded above the frame share)'})
            e['status'] = 'scored %s (%d result(s))' % (res['at'], len(res['scores'])) if res['scores'] else 'registered, not yet scored (no shadow day covers %s yet)' % d1
        except Exception as ex:
            e['status'] = 'registered, not yet scored (%s)' % str(ex)[:200]; res['error'] = str(ex)[:300]
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'a', encoding='utf-8') as h: h.write(json.dumps(res) + '\n')
    jw(regf, reg); print('scored %d truth file(s)' % len(pend)); return 0

if __name__ == '__main__':
    sys.exit(main())
