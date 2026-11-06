#!/usr/bin/env python3
"""v91.17.270 (16 Oct 2026) - OPS F3 - the PMD synop hole of March to May 2026, fetched only where nobody holds it.

INTERNAL USE: training and verification. These are synoptic reports as relayed on the WMO GTS by Ogimet. No station name or source
name reaches a client output (client-view rule). (v91.17.272: licence remarks removed by owner order, 16 Oct 2026.)

What it does
  1 HOLDINGS FIRST (copy, not fetch). It reads every Ogimet raw file AGN already holds, read only, and counts per WMO block (415, 416,
    417) and UTC day how many reports exist:
      - NIGRAAN's own archive          <out>\\raw                                     (this script's earlier runs)
      - NIGRAAN's earlier backfill      D:\\NIGRAAN\\nig\\station-lake\\archive\\synop_ogimet\\raw  (Oct 2025 - Feb 2026; read only)
      - the AGN data lake               D:\\DATA LAKE\\synop\\raw                      (Jun 2026 onwards; read only)
    A half-month of a block counts as HELD when at least --held-share (0.9) of its days carry at least half of the block's median
    daily report count (measured on every held day of that block). Only half-months that are not held are fetched.
    It also lists what else covers the hole (not synop, so not counted): METAR at 8 airports (lake metar_hourly.parquet) and the
    Meteostat/PMD hourly tables, which end in Feb-Mar 2026.
  2 FETCH, POLITELY: one Ogimet request every --gap seconds (default 1200 = 20 min; the server already asks Ogimet 3 times an hour),
    half a month of one block per request, stop at the first refusal or error (run again later: it resumes, a file once saved is never
    fetched again). No account, no key.
  3 DECODE every raw file of all three holdings (synop_decode.py, NIGRAAN's own copy of the decoder) into
    <out>\\synop_ogimet_all.parquet (sid, t, t_c, td_c, wdir, wspd, p_msl, rain_mm, rain_h, tmax_c, tmin_c; one row per station and
    hour; NIGRAAN's own files win a duplicate). The DS2 station master can read it from there (ds2_config.json "synop_ogimet").
Nothing is written outside <out> (default D:\\NIGRAAN\\nig\\archive\\synop_ogimet); station-lake and the data lake are only read.

usage (from D:\\NIGRAAN\\nig\\nigraan-local):
  python scripts\\synop_f3_backfill.py --plan            holdings table and the fetch list, nothing fetched or written
  python scripts\\synop_f3_backfill.py                   fetch what nobody holds (Mar-May 2026), then decode
  python scripts\\synop_f3_backfill.py --decode-only     decode what is held
options: --from 2026-03 --to 2026-05 --gap 1200 --out <folder> --held-share 0.9 --root D:\\NIGRAAN --lake "D:\\DATA LAKE"
"""
import argparse, glob, json, os, re, sys, time, urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
BLOCKS = ('415', '416', '417')
UA = {'User-Agent': 'AGN-NIGRAAN/91.17.270 (one-off synop history backfill, one request per 20 min)'}
LINE = re.compile(r'^(\d{5}),(\d{4}),(\d{2}),(\d{2}),(\d{2}),(\d{2}),')


def pkt():
    return (datetime.now(timezone.utc) + timedelta(hours=5)).strftime('%Y-%m-%d %H:%M PKT')


def halves(f, t):
    """[(block, tag 'YYYYMMa|b', first day, last day)] for every month from f to t (YYYY-MM)"""
    y, m = map(int, f.split('-')); y1, m1 = map(int, t.split('-')); out = []
    while (y, m) <= (y1, m1):
        first = date(y, m, 1); nxt = date(y + (m == 12), m % 12 + 1, 1); last = nxt - timedelta(days=1); mid = date(y, m, 16)
        for b in BLOCKS:
            out += [(b, '%04d%02da' % (y, m), first, mid - timedelta(days=1)), (b, '%04d%02db' % (y, m), mid, last)]
        y, m = (y + (m == 12), m % 12 + 1)
    return out


def scan(folders):
    """per (block, day): number of distinct reports (station, time) in every held raw file; and the files per folder"""
    seen = defaultdict(set); files = {}
    for name, d in folders:
        fl = sorted(glob.glob(os.path.join(d, '*.txt'))) if d and os.path.isdir(d) else []
        files[name] = (d, len(fl))
        for fp in fl:
            try:
                with open(fp, encoding='latin-1', errors='ignore') as fh:
                    for ln in fh:
                        m = LINE.match(ln)
                        if m and m.group(1)[:3] in BLOCKS:
                            seen[(m.group(1)[:3], date(int(m.group(2)), int(m.group(3)), int(m.group(4))))].add((m.group(1), m.group(5), m.group(6)))
            except OSError:
                pass
    return {k: len(v) for k, v in seen.items()}, files


def held_table(jobs, counts, share):
    med = {}
    for b in BLOCKS:
        v = sorted(n for (bb, _), n in counts.items() if bb == b)
        med[b] = v[len(v) // 2] if v else 0
    rows = []
    for b, tag, d0, d1 in jobs:
        days = [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]
        ok = sum(1 for d in days if med[b] and counts.get((b, d), 0) >= 0.5 * med[b])
        rows.append(dict(block=b, half=tag, days=len(days), goodDays=ok, reports=sum(counts.get((b, d), 0) for d in days), held=ok >= share * len(days)))
    return rows, med


def others(lake):
    """what else covers the hole (not synop): METAR airports, Meteostat / PMD hourly tables; read only, best effort"""
    out = []
    try:
        import pandas as pd
        f = os.path.join(lake, 'station-lake', 'archive', 'metar', 'metar_hourly.parquet')
        if os.path.exists(f):
            d = pd.read_parquet(f, columns=['station', 'timestamp_utc']); d['timestamp_utc'] = pd.to_datetime(d['timestamp_utc'], utc=True)
            x = d[(d.timestamp_utc >= '2026-03-01') & (d.timestamp_utc < '2026-06-01')]
            out.append('METAR (lake metar_hourly.parquet): %d reports, %d airports, Mar-May 2026 (airport reports, not synop: not counted)' % (len(x), x.station.nunique()))
        f = os.path.join(lake, 'station-lake', 'raw', 'hourly_synop', 'station_summary.csv')
        if os.path.exists(f):
            s = pd.read_csv(f); out.append('Meteostat hourly (lake raw/hourly_synop): newest day %s (%d of %d stations end after 2026-02-01)' % (s['last'].max(), int((s['last'] > '2026-02-01').sum()), len(s)))
    except Exception as e:
        out.append('other holdings not read: %s' % e)
    return out


def fetch(job, raw, gap_done):
    b, tag, d0, d1 = job
    url = 'https://www.ogimet.com/cgi-bin/getsynop?block=%s&begin=%s0000&end=%s2359' % (b, d0.strftime('%Y%m%d'), d1.strftime('%Y%m%d'))
    t = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read().decode('latin-1')
    lines = [l for l in t.splitlines() if l[:5].isdigit()]
    if not lines:
        raise RuntimeError('refused or empty: ' + t[:120].replace('\n', ' '))
    tmp = os.path.join(raw, '%s_%s.txt.part' % (b, tag))
    with open(tmp, 'w', encoding='latin-1') as fh:
        fh.write('\n'.join(lines) + '\n')
    os.replace(tmp, os.path.join(raw, '%s_%s.txt' % (b, tag)))   # a half-written file is never left under its final name
    return len(lines)


def decode_all(folders, out):
    sys.path.insert(0, HERE)
    from synop_decode import decode
    import pandas as pd
    rec = {}
    for name, d in reversed(folders):            # NIGRAAN's own raw files last: they win a duplicate station-hour
        for fp in sorted(glob.glob(os.path.join(d, '*.txt'))) if d and os.path.isdir(d) else []:
            with open(fp, encoding='latin-1', errors='ignore') as fh:
                for ln in fh:
                    r = decode(ln)
                    if r and r.get('t_c') is not None:
                        rec[(r['sid'], r['t'])] = r
    if not rec:
        return None
    D = pd.DataFrame(list(rec.values())); D['t'] = pd.to_datetime(D.t, utc=True); D = D[(D.t_c > -45) & (D.t_c < 55)]
    keep = [c for c in ['sid', 't', 't_c', 'td_c', 'wdir', 'wspd', 'p_msl', 'rain_mm', 'rain_h', 'tmax_c', 'tmin_c'] if c in D]
    f = os.path.join(out, 'synop_ogimet_all.parquet'); tmp = f + '.part'
    D[keep].sort_values(['sid', 't']).to_parquet(tmp, index=False); os.replace(tmp, f)
    return dict(file=f, rows=len(D), stations=int(D.sid.nunique()), first=str(D.t.min()), last=str(D.t.max()))


def main(argv=None):
    ap = argparse.ArgumentParser(description='F3: Mar-May 2026 synop, fetched only where nobody holds it (internal use only)')
    ap.add_argument('--from', dest='f', default='2026-03'); ap.add_argument('--to', default='2026-05')
    ap.add_argument('--gap', type=int, default=1200); ap.add_argument('--held-share', type=float, default=0.9)
    ap.add_argument('--root', default=os.environ.get('NIGRAAN_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..', '..')))
    ap.add_argument('--lake', default=os.environ.get('NIGRAAN_DATALAKE_ROOT') or None)
    ap.add_argument('--out', default=None)
    ap.add_argument('--plan', action='store_true'); ap.add_argument('--decode-only', action='store_true')
    a = ap.parse_args(argv)
    root = a.root; lake = a.lake or os.path.join(os.path.dirname(os.path.abspath(root)), 'DATA LAKE')
    out = a.out or os.path.join(root, 'nig', 'archive', 'synop_ogimet'); raw = os.path.join(out, 'raw')
    folders = [('NIGRAAN archive (own)', raw), ('NIGRAAN station-lake (read only)', os.path.join(root, 'nig', 'station-lake', 'archive', 'synop_ogimet', 'raw')),
               ('AGN data lake (read only)', os.path.join(lake, 'synop', 'raw'))]
    print('==== F3 synop backfill %s  root %s  out %s' % (pkt(), root, out), flush=True)
    counts, files = scan(folders)
    for k, (d, n) in files.items():
        print('  holdings: %-34s %4d raw files  %s' % (k, n, d), flush=True)
    jobs = halves(a.f, a.to); rows, med = held_table(jobs, counts, a.held_share)
    print('  block median reports per day (all held days): ' + ', '.join('%s %d' % (b, med[b]) for b in BLOCKS), flush=True)
    for r in rows:
        print('  %s %s  %2d of %2d days held, %5d reports  -> %s' % (r['block'], r['half'], r['goodDays'], r['days'], r['reports'], 'held' if r['held'] else 'TO FETCH'), flush=True)
    for line in others(lake):
        print('  also: ' + line, flush=True)
    todo = [j for j, r in zip(jobs, rows) if not r['held']]
    print('  to fetch: %d half-month request(s), about %.1f h at one request per %d s' % (len(todo), len(todo) * a.gap / 3600, a.gap), flush=True)
    plan = dict(at=pkt(), out=out, rows=rows, todo=['%s_%s' % (j[0], j[1]) for j in todo], gapS=a.gap)
    if a.plan:
        print(json.dumps(plan, default=str)[:4000]); return 0
    os.makedirs(raw, exist_ok=True); os.makedirs(os.path.join(out, 'logs'), exist_ok=True)
    with open(os.path.join(out, 'README_INTERNAL.txt'), 'w', encoding='utf-8') as fh:
        fh.write('INTERNAL USE (training and verification). Synoptic reports relayed on the WMO GTS by Ogimet.\n'
                 'No station or source name in client outputs.\n'
                 'raw\\<block>_<YYYYMM>a|b.txt: Ogimet getsynop lines as received. synop_ogimet_all.parquet: every held raw file decoded\n'
                 '(this folder, NIGRAAN station-lake archive and the data lake, read only). Made by nigraan-local\\scripts\\synop_f3_backfill.py.\n')
    stopped = None
    if not a.decode_only:
        for i, j in enumerate(todo):
            if i:
                time.sleep(a.gap)
            try:
                n = fetch(j, raw, i)
                print('  %s fetched %s_%s: %d reports' % (pkt(), j[0], j[1], n), flush=True)
            except Exception as e:
                stopped = '%s_%s: %s' % (j[0], j[1], str(e)[:160]); print('  %s STOPPED at %s (run again later; nothing half-written is kept)' % (pkt(), stopped), flush=True); break
    d = decode_all(folders, out)
    print('  decoded: ' + (json.dumps(d) if d else 'nothing held'), flush=True)
    print('==== F3 done %s%s' % (pkt(), ' (stopped early: ' + stopped + ')' if stopped else ''), flush=True)
    return 3 if stopped else 0


if __name__ == '__main__':
    sys.exit(main())
