#!/usr/bin/env python3
"""ECMWF IFS 0.1 deg open data -> NIGRAAN Pakistan grids (v91.17.283.2; v91.17.283.15 mirror, used fields, 96 h, parallel ranges).

Source  : the Google Cloud mirror of the ECMWF open data (v283.15: data.ecmwf.int took up to 18 h a run and completed 2 runs in 4 days)
          https://storage.googleapis.com/ecmwf-open-data/YYYYMMDD/HHz/ifs/0p1/oper/YYYYMMDDHH0000-<step>h-oper-fc-sfc.grib2 (+ .index),
          the same files as https://data.ecmwf.int/forecasts/... (NIGRAAN_ECMWF010_BASE overrides). Licence CC-BY-4.0, commercial use
          allowed. Credit: "Contains ECMWF data" (Copyright ECMWF, CC-BY-4.0).
Fields  : v283.15: only what the shadow, the score and the serve switch read (server/api/ecmwf010.mjs, scripts/ecmwf/score_shadow.py):
          2 m temperature and dew point, 10 m wind (u, v), 10 m gust, total precipitation, and the model orography at step 0; steps 0-96 h
          by 3 h (33 steps, about 0.4 GB a run). Ranges are fetched in parallel (--ranges, default 8 at once) with retry and back-off.
Runs    : 00 and 12 UTC: steps 0-144 h by 3 h, 150-360 h by 6 h (85 steps); 06 and 18 UTC: 0-144 h by 3 h (49 steps),
          measured on the server listing 20-21 Oct 2026. The 0.1 deg files appear about 2 h after the 0.25 deg ones
          (00z complete about 09:35 UTC, 06z about 14:30, 12z about 21:35, 18z about 02:30 next day).
Method  : only the needed surface fields are fetched, by HTTP byte range from the .index offsets (the files are global; the
          server has no area subsetting), then decoded with ecCodes and cropped to the Pakistan box 23-38 N, 60-78 E
          (151 x 181 points at 0.1 deg). Accumulated fields (tp, ssrd) are de-accumulated per step interval.
Output  : <app>/data/ecmwf010/<YYYYMMDDHH>/meta.json + <var>.i16.gz (int16 little-endian, shape nsteps x ny x nx, value =
          int * scale + offset, -32768 = missing) and index.json (the runs held). The last --keep runs are kept.
          As-issued point archive: <app>/data/ecmwf010/archive/<YYYY-MM>/<run>_points.csv.gz at the 577 tehsil centroids
          (server/contract/units.json), the MACH stations (data/mach-fleet-stations.json) and, since 28 Oct 2026, the 580 retrain
          points (data/retrain/ifs_points.csv, kind 'retrain'), bilinear; kept --archive-days.
Resume  : each step is saved to work/<run>/s<step>.npz when complete; a field download continues from its .part file.
          A run is published (moved into place, index updated) only when every step is complete.
Usage   : python scripts/ecmwf/ingest_ecmwf010.py --app <nigraan-local folder> [--cycles 00,06,12,18] [--max-step 144]
          [--max-step-0012 144] [--keep 8] [--workers 4] [--run 2026102100] [--archive-days 400] [--status <json>]
Needs   : Python 3.9+, numpy, eccodes (pip install eccodes numpy; the Windows eccodes wheel carries eccodes.dll and its
          definitions, no separate install). No other dependency (downloads use urllib).
"""
import argparse, datetime as dt, gzip, io, json, math, os, shutil, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np


def _pid_alive(pid):
    """v91.17.283.30 - True when a process with this id still runs on this computer. Windows: OpenProcess + GetExitCodeProcess
    (STILL_ACTIVE = 259); os.kill(pid, 0) is never used on Windows (there it terminates the process). POSIX: kill(pid, 0)."""
    try:
        pid = int(pid)
    except Exception:
        return False
    if pid <= 0:
        return False
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL('kernel32', use_last_error=True)
        k32.OpenProcess.restype = wintypes.HANDLE
        h = k32.OpenProcess(0x1000, False, pid)          # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return ctypes.get_last_error() == 5           # access denied: the process exists
        try:
            code = wintypes.DWORD()
            if not k32.GetExitCodeProcess(h, ctypes.byref(code)):
                return True
            return code.value == 259
        finally:
            k32.CloseHandle(h)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _lock_dead(path):
    """v91.17.283.30 - a lock file whose holder (the pid written first in it) no longer runs: left by a run killed by a deploy, a
    restart or sleep. Such a lock is taken over at once instead of blocking every run until the time limit (29 Oct 2026: a record run
    killed by the 06:43 deploy kept the MACH live feed stopped for an hour)."""
    try:
        with open(path, 'r', encoding='ascii', errors='replace') as h:
            tok = (h.read(64).split() or [''])[0]
        if not tok.isdigit():
            return False                                  # being written or unreadable: the time rule decides
        return not _pid_alive(tok)
    except FileNotFoundError:
        return False
    except Exception:
        return False

BASE = os.environ.get('NIGRAAN_ECMWF010_BASE', 'https://storage.googleapis.com/ecmwf-open-data')
BOX = {'south': 23.0, 'north': 38.0, 'west': 60.0, 'east': 78.0}
RES = 0.1
def utcnow():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


CREDIT = 'Contains ECMWF data (Copyright ECMWF, CC-BY-4.0, IFS open data 0.1 deg)'
UA = 'AI-GEO-NIGRAAN-local/91.17 ecmwf010'

# shortName in the index -> stored variable; scale/offset of the int16 store; units after conversion
VARS = [
    # name   index params        kind    scale  offset  units      conversion from GRIB
    ('t2m',  ('2t',),            'inst', 0.01,  0.0,    'degC',    lambda a: a - 273.15),
    ('d2m',  ('2d',),            'inst', 0.01,  0.0,    'degC',    lambda a: a - 273.15),
    ('u10',  ('10u',),           'inst', 0.01,  0.0,    'm/s',     None),
    ('v10',  ('10v',),           'inst', 0.01,  0.0,    'm/s',     None),
    ('gust', ('10fg', '10fg3', '10fg6'), 'max', 0.01, 0.0, 'm/s',  None),
    ('tp',   ('tp',),            'acc',  0.01,  0.0,    'mm',      lambda a: a * 1000.0),   # per step interval after de-accumulation
    ('tcc',  ('tcc',),           'inst', 0.01,  0.0,    '%',       None),   # v91.17.283.28: back (units from the GRIB message: % kept, a 0-1 fraction x 100)
]   # v283.15: msl, sp, tcc and ssrd were no longer fetched (nothing in the shadow, score or serve path read them).
# v91.17.283.28 (independence from LAMHA): total cloud cover is fetched again. The monthly retrain's IFS table (station-lake/retrain/produce/
# ifs.py, nwp/dly ifs_dly tcc) took tcc from LAMHA's IFS archive; NIGRAAN now has its own. The open-data index carries 'tcc' (levtype sfc)
# at every step (checked 27 Oct 2026 00z: steps 0, 3, 24). Cost measured on that index: about 2.1 MB a step by byte range (2.07-2.12 MB),
# i.e. about +69 MB a run at 33 steps (the run's other fields about 0.4 GB) and about +0.1 GB at the 49-step 06/18z or longer 00/12z
# runs; stored cropped as int16 gzip, about 1-2 MB a run (8 runs kept), and one more column in the as-issued point archive.
STATIC = [('z', 'orog', 'm', lambda a: a / 9.80665)]   # model orography from step 0 geopotential


def log(*a):
    print('[' + utcnow().strftime('%Y-%m-%d %H:%M:%S') + 'Z]', *a, flush=True)


def steps_for(hh, max_step, max_step_0012):
    if hh in (0, 12):
        full = list(range(0, 145, 3)) + list(range(150, 361, 6))
        lim = max_step_0012
    else:
        full = list(range(0, 145, 3))
        lim = max_step
    return [s for s in full if s <= lim]


def url_of(run, step, ext):
    d, hh = run[:8], run[8:10]
    return '%s/%s/%sz/ifs/0p1/oper/%s%s0000-%dh-oper-fc-sfc.%s' % (BASE, d, hh, d, hh, step, ext)


def http(url, rng=None, head=False, timeout=60):
    req = urllib.request.Request(url, method='HEAD' if head else 'GET', headers={'User-Agent': UA})
    if rng:
        req.add_header('Range', 'bytes=%d-%d' % rng)
    return urllib.request.urlopen(req, timeout=timeout)


def retry(fn, what, tries=6):
    err = None
    for k in range(tries):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            err = e
        except Exception as e:   # network errors, timeouts, short reads
            err = e
        wait = min(60, 2 ** k * 2) * (0.75 + 0.5 * ((os.getpid() + k + time.time()) % 1))   # back-off with jitter
        log('retry %s in %.0fs (%s)' % (what, wait, err))
        time.sleep(wait)
    raise RuntimeError('%s failed after %d tries: %s' % (what, tries, err))


def exists(url):
    try:
        with http(url, head=True, timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False
    except Exception:
        return False


def read_index(run, step, cache_dir):
    f = os.path.join(cache_dir, 's%03d.index' % step)
    if not os.path.exists(f):
        def get():
            with http(url_of(run, step, 'index')) as r:
                return r.read()
        b = retry(get, 'index %s +%d' % (run, step))
        tmp = f + '.tmp'
        with open(tmp, 'wb') as o:
            o.write(b)
        os.replace(tmp, f)
    rows = []
    with open(f, 'r', encoding='ascii', errors='replace') as h:
        for line in h:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def fetch_range(url, off, length, part):
    """byte-range download of one field into memory; continues from <part> if a previous attempt left one"""
    def go():
        have = os.path.getsize(part) if os.path.exists(part) else 0
        if have > length:
            os.remove(part); have = 0
        if have < length:
            with http(url, rng=(off + have, off + length - 1), timeout=120) as r:
                if r.status != 206:
                    raise RuntimeError('server ignored the Range header (status %s)' % r.status)
                with open(part, 'ab') as o:
                    while True:
                        b = r.read(1 << 16)
                        if not b:
                            break
                        o.write(b)
        with open(part, 'rb') as h:
            data = h.read()
        if len(data) != length or data[:4] != b'GRIB' or data[-4:] != b'7777':
            os.remove(part)
            raise RuntimeError('field incomplete or not GRIB (%d of %d bytes)' % (len(data), length))
        return data
    return retry(go, 'range %s@%d' % (url.rsplit('/', 1)[-1], off))


def decode_crop(msg):
    import eccodes
    h = eccodes.codes_new_from_message(msg)
    try:
        g = lambda k: eccodes.codes_get(h, k)
        ni, nj = g('Ni'), g('Nj')
        la1, lo1 = g('latitudeOfFirstGridPointInDegrees'), g('longitudeOfFirstGridPointInDegrees')
        di, dj = g('iDirectionIncrementInDegrees'), g('jDirectionIncrementInDegrees')
        if g('iScansNegatively') or g('jScansPositively') or g('gridType') != 'regular_ll':
            raise RuntimeError('unexpected grid layout')
        meta = {'shortName': g('shortName'), 'units': g('units')}
        try:
            meta['stepRange'] = g('stepRange')
        except Exception:
            meta['stepRange'] = None
        v = eccodes.codes_get_values(h).astype(np.float32)
        try:
            miss = g('missingValue')
            if g('bitmapPresent'):
                v[v == miss] = np.nan
        except Exception:
            pass
    finally:
        eccodes.codes_release(h)
    v = v.reshape(nj, ni)
    j0 = int(round((la1 - BOX['north']) / dj)); j1 = int(round((la1 - BOX['south']) / dj))
    i0 = int(round(((BOX['west'] - lo1) % 360.0) / di)); i1 = int(round(((BOX['east'] - lo1) % 360.0) / di))
    if not (0 <= j0 < j1 < nj and 0 <= i0 < i1 < ni):
        raise RuntimeError('box outside the grid')
    lat0 = la1 - j0 * dj
    lon0 = ((lo1 + i0 * di + 180.0) % 360.0) - 180.0
    return v[j0:j1 + 1, i0:i1 + 1].copy(), {'lat0': round(lat0, 4), 'lon0': round(lon0, 4), 'dlat': -dj, 'dlon': di}, meta


RANGES = None   # the shared pool of byte-range downloads (set in run_all from --ranges)


def do_step(run, step, work, workers_inner=1):
    out = os.path.join(work, 's%03d.npz' % step)
    if os.path.exists(out):
        return step, 0, 'cached'
    rows = read_index(run, step, work)
    want = {}
    for name, params, kind, *_ in VARS:
        for r in rows:
            if r.get('levtype') == 'sfc' and r.get('param') in params:
                want[name] = r; break
    if step == 0:
        for name, _, _, _ in STATIC:
            for r in rows:
                if r.get('levtype') == 'sfc' and r.get('param') == name:
                    want['static_' + name] = r; break
    url = url_of(run, step, 'grib2')
    arrays, info, grid, nbytes = {}, {}, None, 0
    order = sorted(want.items(), key=lambda kv: kv[1]['_offset'])
    futs = {name: RANGES.submit(fetch_range, url, int(r['_offset']), int(r['_length']), os.path.join(work, 's%03d_%s.part' % (step, name))) for name, r in order}
    for name, r in order:   # v283.15: the fields of a step are fetched in parallel (one shared pool of --ranges connections)
        msg = futs[name].result()
        nbytes += len(msg)
        a, gr, meta = decode_crop(msg)
        grid = grid or gr
        arrays[name] = a
        info[name] = {'param': r['param'], 'stepRange': meta['stepRange'], 'units': meta['units'], 'bytes': int(r['_length'])}
    tmp = out + '.tmp.npz'
    np.savez(tmp, **arrays, _info=np.frombuffer(json.dumps({'info': info, 'grid': grid}).encode('ascii'), dtype=np.uint8))
    os.replace(tmp, out)
    for name in want:
        p = os.path.join(work, 's%03d_%s.part' % (step, name))
        if os.path.exists(p):
            os.remove(p)
    return step, nbytes, 'fetched %d fields' % len(want)


def load_points(app):
    pts = []
    try:
        with open(os.path.join(app, 'server', 'contract', 'units.json'), 'r', encoding='utf-8') as h:
            for u in json.load(h):
                if isinstance(u.get('lat'), (int, float)) and isinstance(u.get('lon'), (int, float)):
                    pts.append(('tehsil', str(u.get('unitId') or u.get('key')), float(u['lat']), float(u['lon']), u.get('elevM')))
    except Exception as e:
        log('tehsil centroids not read:', e)
    try:
        with open(os.path.join(app, 'data', 'mach-fleet-stations.json'), 'r', encoding='utf-8') as h:
            for s in json.load(h).get('stations', []):
                if isinstance(s.get('lat'), (int, float)) and isinstance(s.get('lon'), (int, float)):
                    pts.append(('mach', str(s['key']), float(s['lat']), float(s['lon']), None))
    except Exception as e:
        log('MACH stations not read:', e)
    # 28 Oct 2026 (automatic monthly retrain): the 580 retrain points (data/retrain/ifs_points.csv: pid, lat, lon; the points of the
    # retrain's IFS archive), so the as-issued archive keeps NIGRAAN's own IFS forecasts there (station-lake/retrain/produce/ifs.py
    # turns them into the retrain's ifs_dly / ifs_points_ext month files). Rows of kind 'retrain', id = pid.
    try:
        with open(os.path.join(app, 'data', 'retrain', 'ifs_points.csv'), 'r', encoding='utf-8') as h:
            head = h.readline().strip().split(',')
            ip, ia, io_ = head.index('pid'), head.index('lat'), head.index('lon')
            for line in h:
                c = line.strip().split(',')
                if len(c) > max(ip, ia, io_):
                    pts.append(('retrain', c[ip], float(c[ia]), float(c[io_]), None))
    except Exception as e:
        log('retrain points not read:', e)
    return pts


def bilinear(grid, field, lat, lon):
    """field shape (..., ny, nx); grid lat0 north edge, dlat negative"""
    fy = (lat - grid['lat0']) / grid['dlat']; fx = (lon - grid['lon0']) / grid['dlon']
    ny, nx = field.shape[-2], field.shape[-1]
    if not (0 <= fy <= ny - 1 and 0 <= fx <= nx - 1):
        return None
    j = min(int(math.floor(fy)), ny - 2); i = min(int(math.floor(fx)), nx - 2)
    wy, wx = fy - j, fx - i
    a = field[..., j, i]; b = field[..., j, i + 1]; c = field[..., j + 1, i]; d = field[..., j + 1, i + 1]
    return (1 - wy) * ((1 - wx) * a + wx * b) + wy * ((1 - wx) * c + wx * d)


def assemble(app, run, steps, work, root, keep, archive_days, points):
    t0 = dt.datetime.strptime(run, '%Y%m%d%H')
    S = {}
    for s in steps:
        z = np.load(os.path.join(work, 's%03d.npz' % s))
        S[s] = {k: z[k] for k in z.files if k != '_info'}
        S[s]['_info'] = json.loads(bytes(z['_info']).decode('ascii'))
    grid = S[steps[0]]['_info']['grid']
    ny, nx = S[steps[0]]['t2m'].shape
    outdir = os.path.join(root, run + '.tmp')
    if os.path.exists(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)
    meta = {'run': run, 'runTimeUtc': t0.strftime('%Y-%m-%dT%H:00Z'), 'model': 'ECMWF IFS HRES 0.1 deg open data (oper, fc, sfc)',
            'source': BASE + '/' + run[:8] + '/' + run[8:10] + 'z/ifs/0p1/oper/', 'credit': CREDIT, 'licence': 'CC-BY-4.0',
            'box': BOX, 'grid': {'lat0': grid['lat0'], 'lon0': grid['lon0'], 'dlat': grid['dlat'], 'dlon': grid['dlon'], 'ny': ny, 'nx': nx},
            'steps': steps, 'validTimesUtc': [(t0 + dt.timedelta(hours=s)).strftime('%Y-%m-%dT%H:00Z') for s in steps],
            'encoding': 'int16 little-endian, gzip; value = int * scale + offset; -32768 = missing; shape steps x ny x nx (row 0 = north)',
            'vars': {}, 'built': utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'script': 'scripts/ecmwf/ingest_ecmwf010.py'}
    series = {}
    for name, params, kind, scale, off, units, conv in VARS:
        arr = np.full((len(steps), ny, nx), np.nan, dtype=np.float32)
        src, windows = [], []
        prev_acc, prev_s = None, None
        for k, s in enumerate(steps):
            a = S[s].get(name); inf = S[s]['_info']['info'].get(name)
            src.append(inf['param'] if inf else None); windows.append(inf['stepRange'] if inf else None)
            if a is None:
                continue
            a = a.astype(np.float64)
            if name == 'tcc' and str((inf or {}).get('units', '')).strip() in ('(0 - 1)', '0-1', 'fraction', '1', 'Proportion', '(0-1)'):
                a = a * 100.0   # a 0-1 fraction: stored as percent, so a run's tcc is always %
            if kind == 'acc':
                if s == 0:
                    prev_acc, prev_s = a, 0
                    continue   # nothing accumulated yet: the step-0 interval is empty
                inc = a - prev_acc if prev_acc is not None else None
                if inc is not None:
                    inc = np.maximum(inc, 0.0)   # packing noise can give tiny negatives
                    if name == 'ssrd':
                        inc = inc / ((s - prev_s) * 3600.0)
                    else:
                        inc = conv(inc)
                    arr[k] = inc
                prev_acc, prev_s = a, s
            elif kind == 'max':
                if s == 0:
                    continue   # no window before the analysis
                arr[k] = a
            else:
                arr[k] = conv(a) if conv else a
        q = np.where(np.isfinite(arr), np.clip(np.round((arr - off) / scale), -32767, 32767), -32768).astype('<i2')
        with gzip.open(os.path.join(outdir, name + '.i16.gz'), 'wb', compresslevel=6) as o:
            o.write(q.tobytes())
        meta['vars'][name] = {'scale': scale, 'offset': off, 'units': units, 'kind': kind,
                              'note': {'acc': 'amount (tp) or mean (ssrd) over the interval ending at the step, from the previous step',
                                       'max': 'maximum 10 m gust over the GRIB window ending at the step (windows: 1 h at steps 3-90, 3 h at 93-144, 6 h at 150-360, measured 21 Oct 2026)',
                                       'inst': 'instantaneous at the valid time'}[kind],
                              'gribParams': src, 'windows': windows if kind != 'inst' else None}
        series[name] = arr
    if 'static_z' in S[steps[0]]:
        orog = S[steps[0]]['static_z'] / 9.80665
        q = np.clip(np.round(orog), -32767, 32767).astype('<i2')
        with gzip.open(os.path.join(outdir, 'orog.i16.gz'), 'wb', compresslevel=6) as o:
            o.write(q.tobytes())
        meta['vars']['orog'] = {'scale': 1, 'offset': 0, 'units': 'm', 'kind': 'static', 'note': 'model orography (step-0 geopotential / g); shape ny x nx'}
        series['orog'] = orog.astype(np.float32)
    nbytes = sum(sum(v.get('bytes', 0) for v in S[s]['_info']['info'].values()) for s in steps)
    meta['downloadedBytes'] = int(nbytes)
    with open(os.path.join(outdir, 'meta.json'), 'w', encoding='ascii') as o:
        json.dump(meta, o, indent=1)
    final = os.path.join(root, run)
    if os.path.exists(final):
        shutil.rmtree(final)
    os.replace(outdir, final)
    # as-issued point archive
    if points:
        adir = os.path.join(root, 'archive', run[:4] + '-' + run[4:6]); os.makedirs(adir, exist_ok=True)
        names = [v[0] for v in VARS]
        buf = io.StringIO()
        buf.write('run_utc,valid_utc,lead_h,kind,id,lat,lon,model_elev_m,' + ','.join(names) + '\n')
        for kind, pid, lat, lon, _elev in points:
            cols = {n: bilinear(grid, series[n], lat, lon) for n in names}
            if cols['t2m'] is None:
                continue
            oe = bilinear(grid, series['orog'], lat, lon) if 'orog' in series else None
            for k, s in enumerate(steps):
                vals = []
                for n in names:
                    x = cols[n][k]
                    vals.append('' if not np.isfinite(x) else ('%.2f' % x))
                buf.write('%s,%s,%d,%s,"%s",%.4f,%.4f,%s,%s\n' % (meta['runTimeUtc'], meta['validTimesUtc'][k], s, kind, pid.replace('"', "'"), lat, lon,
                                                               '' if oe is None else '%.0f' % oe, ','.join(vals)))
        tmp = os.path.join(adir, run + '_points.csv.gz.tmp')
        with gzip.open(tmp, 'wt', encoding='ascii', errors='replace', compresslevel=6) as o:
            o.write(buf.getvalue())
        os.replace(tmp, os.path.join(adir, run + '_points.csv.gz'))
    shutil.rmtree(work, ignore_errors=True)
    return meta


def prune(root, keep, archive_days):
    runs = sorted([d for d in os.listdir(root) if len(d) == 10 and d.isdigit() and os.path.exists(os.path.join(root, d, 'meta.json'))])
    for d in runs[:-keep] if keep > 0 else []:
        shutil.rmtree(os.path.join(root, d), ignore_errors=True)
    wdir = os.path.join(root, 'work')   # unfinished runs older than 3 days (ECMWF keeps open data only a few days): dropped
    if os.path.isdir(wdir):
        old = (utcnow() - dt.timedelta(days=8)).strftime('%Y%m%d%H')   # v91.17.283.30: the back-fill window (was 3 days)
        for d in os.listdir(wdir):
            if d < old:
                shutil.rmtree(os.path.join(wdir, d), ignore_errors=True)
    cut = (utcnow() - dt.timedelta(days=archive_days)).strftime('%Y%m%d%H')
    adir = os.path.join(root, 'archive')
    if os.path.isdir(adir):
        for m in os.listdir(adir):
            p = os.path.join(adir, m)
            if not os.path.isdir(p):
                continue
            for f in os.listdir(p):
                if f[:10].isdigit() and f[:10] < cut:
                    os.remove(os.path.join(p, f))
    held = sorted([d for d in os.listdir(root) if len(d) == 10 and d.isdigit() and os.path.exists(os.path.join(root, d, 'meta.json'))])
    idx = {'updated': utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'credit': CREDIT, 'runs': []}
    for d in held:
        try:
            with open(os.path.join(root, d, 'meta.json'), 'r', encoding='ascii') as h:
                m = json.load(h)
            idx['runs'].append({'run': d, 'runTimeUtc': m['runTimeUtc'], 'steps': len(m['steps']), 'maxStep': m['steps'][-1],
                                'built': m['built'], 'downloadedBytes': m.get('downloadedBytes')})
        except Exception:
            pass
    idx['latest'] = idx['runs'][-1]['run'] if idx['runs'] else None
    tmp = os.path.join(root, 'index.json.tmp')
    with open(tmp, 'w', encoding='ascii') as o:
        json.dump(idx, o, indent=1)
    os.replace(tmp, os.path.join(root, 'index.json'))
    return idx


def held_runs(root):
    """v91.17.283.30: the runs held: a grid folder with meta.json, or an as-issued point archive (a back-filled run older than the
    --keep newest is pruned as a grid at once but keeps its point archive; without this it would be fetched again at every start)"""
    held = {d for d in os.listdir(root) if len(d) == 10 and d.isdigit() and os.path.exists(os.path.join(root, d, 'meta.json'))}
    adir0 = os.path.join(root, 'archive')
    if os.path.isdir(adir0):
        for m in os.listdir(adir0):
            p0 = os.path.join(adir0, m)
            if os.path.isdir(p0):
                held |= {f[:10] for f in os.listdir(p0) if f.endswith('_points.csv.gz') and f[:10].isdigit()}
    return held


def choose_runs(cands, held, max_runs, explicit=None):
    """v91.17.283.30: every missed run still in the window, newest first (the newest serves; the older ones fill the as-issued archive the
    shadow, the score and the retrain read); returns (runs in order, how many may be fetched this start: a run not yet complete on the
    server costs none, so the budget is spent on runs that can be fetched)"""
    if explicit:
        return list(explicit), len(explicit)
    return sorted([r for r in cands if r not in held], reverse=True), max(1, int(max_runs))


def candidate_runs(cycles, back_h=48):
    now = utcnow()
    t = now.replace(minute=0, second=0, microsecond=0)
    t -= dt.timedelta(hours=t.hour % 6)
    out = []
    while (now - t).total_seconds() <= back_h * 3600:
        if t.hour in cycles:
            out.append(t.strftime('%Y%m%d%H'))
        t -= dt.timedelta(hours=6)
    return sorted(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--app', default=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
    ap.add_argument('--out', default=None, help='default <app>/data/ecmwf010')
    ap.add_argument('--cycles', default=os.environ.get('NIGRAAN_ECMWF010_CYCLES', '00,12'))
    ap.add_argument('--max-step', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_MAX_STEP', '96')), help='06/18 runs (v283.15: 96 h, the longest lead the shadow, score and serve paths use)')
    ap.add_argument('--max-step-0012', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_MAX_STEP_0012', '96')), help='00/12 runs (up to 360)')
    ap.add_argument('--ranges', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_RANGES', '8')), help='byte ranges fetched at once (v283.15)')
    ap.add_argument('--keep', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_KEEP', '8')))
    ap.add_argument('--archive-days', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_ARCHIVE_DAYS', '400')))
    ap.add_argument('--workers', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_WORKERS', '6')))
    ap.add_argument('--run', action='append', help='YYYYMMDDHH (repeatable); default: the newest complete runs of --cycles not yet held')
    ap.add_argument('--back-hours', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_BACK_HOURS', '168')), help='v91.17.283.30: how far back a missed run is still fetched (the mirror keeps about 8 days; was 30 h, so a laptop off for a day lost its runs for good)')
    ap.add_argument('--max-runs', type=int, default=int(os.environ.get('NIGRAAN_ECMWF010_MAX_RUNS', '2')), help='newest runs fetched per start (a laptop that was off catches up only these)')
    ap.add_argument('--status', default=None, help='default <app>/data/ecmwf010-status.json')
    ap.add_argument('--max-minutes', type=float, default=float(os.environ.get('NIGRAAN_ECMWF010_MAX_MINUTES', '0')),
                    help='v91.17.283.2: stop starting new steps after this many minutes and exit 3 (resumable); 0 = no limit. The server passes 85, inside its own 90-min kill, so the limit holds even if the server that started this process has gone')
    a = ap.parse_args()
    app = os.path.abspath(a.app)
    root = os.path.abspath(a.out or os.path.join(app, 'data', 'ecmwf010'))
    os.makedirs(root, exist_ok=True)
    status_file = a.status or os.path.join(app, 'data', 'ecmwf010-status.json')
    cycles = sorted({int(c) for c in a.cycles.split(',') if c.strip() != ''})
    st = {'started': utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'config': {'cycles': cycles, 'maxStep': a.max_step, 'maxStep0012': a.max_step_0012, 'keep': a.keep, 'archiveDays': a.archive_days},
          'done': [], 'skipped': [], 'errors': [], 'bytes': 0}

    def save_status(final=False):
        st['state'] = 'finished' if final else 'running'
        st['ended'] = utcnow().strftime('%Y-%m-%dT%H:%M:%SZ') if final else None
        try:
            tmp = status_file + '.tmp'
            with open(tmp, 'w', encoding='ascii') as o:
                json.dump(st, o, indent=1)
            os.replace(tmp, status_file)
        except Exception:
            pass

    # v91.17.283.2: one fetcher at a time per folder, even across a server restart (a child left running by a server that stopped). A
    # lock older than the time limit + 10 min belongs to a process that can no longer be running under the limit and is taken over.
    lock = os.path.join(root, 'fetch.lock')
    stale_s = ((a.max_minutes or 90) + 10) * 60
    def take_lock():
        for _ in range(2):
            try:
                fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                with os.fdopen(fd, 'w', encoding='ascii') as o:
                    o.write('%d %s\n' % (os.getpid(), utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')))
                return True
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(lock) > stale_s or _lock_dead(lock):
                        os.replace(lock, lock + '.stale'); continue
                except OSError:
                    continue
                return False
        return False
    if not take_lock():
        log('another fetcher holds %s; nothing done' % lock)
        return 5
    try:
        return run_all(a, app, root, status_file, st, save_status)
    finally:
        try:
            os.remove(lock)
        except OSError:
            pass


def run_all(a, app, root, status_file, st, save_status):
    cycles = sorted({int(c) for c in a.cycles.split(',') if c.strip() != ''})
    deadline = (time.time() + a.max_minutes * 60) if a.max_minutes and a.max_minutes > 0 else None

    def step_in_time(run, s, work):
        if deadline is not None and time.time() > deadline:
            raise RuntimeError('time limit of %g min reached before this step; the next start resumes' % a.max_minutes)
        return do_step(run, s, work)
    held = held_runs(root)
    try:
        import eccodes  # noqa: F401  (binary wheel: pip install eccodes numpy; scripts/ecmwf/SETUP_ECMWF010.bat)
    except Exception as e:
        st['errors'].append({'why': 'Python package eccodes not installed (%s): run scripts\\ecmwf\\SETUP_ECMWF010.bat' % e})
        save_status(final=True); log(st['errors'][-1]['why']); return 4
    global RANGES
    RANGES = ThreadPoolExecutor(max_workers=max(1, a.ranges))
    cands = candidate_runs(cycles, a.back_hours)
    # v91.17.283.30: every missed run still on the source is fetched, newest first (the newest serves; the older ones fill the as-issued
    # archive the shadow, the score and the retrain read); --max-runs per start, so a long catch-up spreads over the 30-min starts
    runs, budget = choose_runs(cands, held, a.max_runs, a.run)
    st['missing'] = sorted([r for r in cands if r not in held])
    # v283.15: unfinished work of a run that is held, or that has left the fetch window (it can no longer be chosen), is removed at
    # start; the work of a run still in the window is resumed (its finished steps are kept as s<step>.npz, a field from its .part file)
    wdir = os.path.join(root, 'work'); st['cleaned'] = []
    if os.path.isdir(wdir):
        for d in sorted(os.listdir(wdir)):
            if d in runs:
                continue
            if d in held or not a.run and d not in cands:
                shutil.rmtree(os.path.join(wdir, d), ignore_errors=True); st['cleaned'].append(d)
        if st['cleaned']:
            log('removed unfinished work of runs no longer fetched:', ', '.join(st['cleaned']))
    points = load_points(app)
    log('ecmwf010: %d candidate run(s): %s; %d points; out %s' % (len(runs), ', '.join(runs) or '-', len(points), root))
    save_status()
    for run in runs:
        if budget <= 0:
            st['skipped'].append({'run': run, 'why': 'left for the next start (--max-runs %d per start)' % a.max_runs}); continue
        hh = int(run[8:10])
        steps = steps_for(hh, a.max_step, a.max_step_0012)
        last = steps[-1]   # v283.15: the run is ready for us when its last NEEDED step is out (was: the +360 h file)
        if not exists(url_of(run, last, 'index')):
            st['skipped'].append({'run': run, 'why': 'not complete on the server yet (no +%dh index)' % last}); log('skip', run, 'not complete yet')
            continue
        budget -= 1
        work = os.path.join(root, 'work', run); os.makedirs(work, exist_ok=True)
        t1 = time.time(); got = 0; fails = []
        with ThreadPoolExecutor(max_workers=max(1, a.workers)) as ex:
            futs = {ex.submit(step_in_time, run, s, work): s for s in steps}
            for f in as_completed(futs):
                s = futs[f]
                try:
                    _, nb, what = f.result(); got += nb
                except Exception as e:
                    fails.append((s, str(e)))
        if fails:
            st['errors'].append({'run': run, 'failedSteps': [s for s, _ in fails][:20], 'first': fails[0][1][:300]})
            log('run', run, 'incomplete:', len(fails), 'step(s) failed; the next start resumes'); save_status(); continue
        meta = assemble(app, run, steps, work, root, a.keep, a.archive_days, points)
        st['bytes'] += got
        st['done'].append({'run': run, 'steps': len(steps), 'downloadedThisStart': got, 'runBytes': meta['downloadedBytes'], 'seconds': round(time.time() - t1, 1)})
        log('run %s: %d steps, %.1f MB this start (%.1f MB run total), %.0f s' % (run, len(steps), got / 1e6, meta['downloadedBytes'] / 1e6, time.time() - t1))
        save_status()
    idx = prune(root, a.keep, a.archive_days)
    st['held'] = [r['run'] for r in idx['runs']]
    save_status(final=True)
    log('held runs:', ', '.join(st['held']) or '-')
    return 0 if not st['errors'] else 3


if __name__ == '__main__':
    sys.exit(main())
