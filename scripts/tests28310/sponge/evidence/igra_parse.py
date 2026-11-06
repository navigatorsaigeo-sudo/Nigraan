"""IGRA v2 data-por -> 00 UTC Nov 2025 - Feb 2026: surface T/p and 925 hPa T per sounding."""
import json, sys
out = {}
for sid in ['41640', '41780', '41571', '41675']:
    rows = []; cur = None
    for ln in open(f'igra/PKM000{sid}-data.txt'):
        if ln.startswith('#'):
            if cur: rows.append(cur)
            y, m, d, h = int(ln[13:17]), int(ln[18:20]), int(ln[21:23]), int(ln[24:26])
            cur = None
            if h == 0 and ((y == 2025 and m in (11, 12)) or (y == 2026 and m in (1, 2))):
                cur = dict(date='%04d-%02d-%02d' % (y, m, d), sfcT=None, sfcP=None, t925=None, lat=int(ln[55:62]) / 1e4, lon=int(ln[63:71]) / 1e4)
            continue
        if cur is None: continue
        typ2 = ln[1]; p = int(ln[9:15]); t = int(ln[22:27])
        if t in (-9999, -8888): continue
        if typ2 == '1': cur['sfcT'] = t / 10; cur['sfcP'] = p / 100 if p > 0 else None
        if p == 92500: cur['t925'] = t / 10
    if cur: rows.append(cur)
    out[sid] = rows
    ok = [r for r in rows if r['sfcT'] is not None and r['t925'] is not None]
    print(sid, 'soundings', len(rows), 'with sfc+925', len(ok), rows[0] if rows else None)
json.dump(out, open('igra_winter.json', 'w'))
