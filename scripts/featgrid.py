"""v91.17.72 · FEATURE GRID WRITER (shared by the terrain, surface and AI-downscaling jobs)

One national grid for every fine-resolution feature NIGRAAN serves at a point:
  grid "g9": EPSG:4326, cell 1/400 degree (9 arc-seconds, about 250 m N-S and 230-255 m E-W over Pakistan),
             west edge 60.75 E, north edge 37.25 N, 6900 columns x 5500 rows (to 78.00 E, 23.50 N).
Storage per band (data/feat/<band>.json + <band>.p<k>.bin):
  - the band is cut into 1-degree blocks (400 x 400 cells), stored as int16 = round((value - offset) / scale),
    nodata -32768, each block zlib-compressed on its own; all-nodata blocks are omitted;
  - blocks are appended to part files that stay under PART_MAX bytes (the device bridge moves files <= 20 MB);
  - the JSON index holds the grid, scale/offset/units, provenance (built/method/source/licence) and, per block,
    [part, byte offset, byte length].
Readers: server/api/featgrid.mjs (Node, no native dependencies). Values are CELL values: a 30 m or 10 m input is
aggregated into the cell by the job that writes it (mean, share, percentile ... named in the band's method).
"""
import json, os, zlib, datetime
import numpy as np

GRID = {'id': 'g9', 'crs': 'EPSG:4326', 'cell': 1 / 400, 'west': 60.75, 'north': 37.25, 'cols': 6900, 'rows': 5500, 'block': 100}   # v91.17.132 · 100-cell blocks (was 400): 16 x cheaper per point read; readers take the block size from each band's index
PART_MAX = 16_000_000
NODATA = -32768

def grid_coords():
    """cell-centre lon (cols) and lat (rows) vectors"""
    c = GRID['cell']
    lon = GRID['west'] + (np.arange(GRID['cols']) + 0.5) * c
    lat = GRID['north'] - (np.arange(GRID['rows']) + 0.5) * c
    return lon, lat

def cell_of(lat, lon):
    c = GRID['cell']
    return int((GRID['north'] - lat) / c), int((lon - GRID['west']) / c)

def write_band(data_dir, name, arr, scale, offset=0.0, units='', method='', source='', licence=None, extra=None):
    """arr: float array (rows, cols) with NaN for nodata"""
    assert arr.shape == (GRID['rows'], GRID['cols']), arr.shape
    out = os.path.join(data_dir, 'feat'); os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith(name + '.p') and f.endswith('.bin'): os.remove(os.path.join(out, f))
    q = np.where(np.isfinite(arr), np.clip(np.round((arr - offset) / scale), -32767, 32767), NODATA).astype('<i2')
    B = GRID['block']; blocks = {}; part = 0; fh = open(os.path.join(out, f'{name}.p{part}.bin'), 'wb'); pos = 0; n = 0
    for r in range(0, GRID['rows'], B):
        for c in range(0, GRID['cols'], B):
            blk = q[r:r + B, c:c + B]
            if (blk == NODATA).all(): continue
            full = np.full((B, B), NODATA, '<i2'); full[:blk.shape[0], :blk.shape[1]] = blk
            z = zlib.compress(full.tobytes(), 6)
            if pos + len(z) > PART_MAX:
                fh.close(); part += 1; fh = open(os.path.join(out, f'{name}.p{part}.bin'), 'wb'); pos = 0
            fh.write(z); blocks[f'{r // B},{c // B}'] = [part, pos, len(z)]; pos += len(z); n += 1
    fh.close()
    fin = arr[np.isfinite(arr)]
    idx = {'band': name, 'grid': GRID, 'dtype': 'int16', 'nodata': NODATA, 'scale': scale, 'offset': offset, 'units': units,
           'built': datetime.datetime.utcnow().isoformat(timespec='seconds') + 'Z', 'method': method, 'source': source,
           'parts': part + 1, 'blocks': blocks, 'nBlocks': n,
           'stats': {'n': int(fin.size), 'min': float(fin.min()) if fin.size else None, 'max': float(fin.max()) if fin.size else None,
                     'mean': float(fin.mean()) if fin.size else None}}
    if licence: idx['licence'] = licence
    if extra: idx.update(extra)
    json.dump(idx, open(os.path.join(out, f'{name}.json'), 'w'), indent=1)
    return idx

def read_band(data_dir, name):
    """full float32 array (NaN nodata) — for jobs and tests"""
    out = os.path.join(data_dir, 'feat'); idx = json.load(open(os.path.join(out, f'{name}.json')))
    B = idx['grid'].get('block', 400); a = np.full((GRID['rows'], GRID['cols']), np.nan, 'float32'); fhs = {}
    for k, (p, o, l) in idx['blocks'].items():
        r, c = map(int, k.split(','))
        fh = fhs.setdefault(p, open(os.path.join(out, f'{name}.p{p}.bin'), 'rb')); fh.seek(o)
        blk = np.frombuffer(zlib.decompress(fh.read(l)), '<i2').reshape(B, B).astype('float32')
        blk = np.where(blk == NODATA, np.nan, blk * idx['scale'] + idx['offset'])
        rr, cc = r * B, c * B; h = min(B, GRID['rows'] - rr); w = min(B, GRID['cols'] - cc)
        a[rr:rr + h, cc:cc + w] = blk[:h, :w]
    return a
