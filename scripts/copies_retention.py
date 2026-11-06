#!/usr/bin/env python3
"""v91.17.270 (16 Oct 2026) - OPS A4 - growth of NIGRAAN's copies folder (D:\\NIGRAAN\\nig\\copies) and a retention rule for the owner.

The copy-not-fetch module (server/api/copies.mjs, v269) copies LAMHA's files (v91.17.283.25: LAMHA only; the files copied from the
data lake before 27 Oct match no dataset any more and are never moved) into nig\\copies every 15 minutes and
never removes anything (no-hard-delete rule). Day files (MACH database days, PMD-EWS raw days, IMERG days, lake MACH days) therefore pile
up; month files and fixed files are overwritten in place and do not grow beyond one file per month.

  python scripts\\copies_retention.py                       REPORT (read only): size per dataset, per month, growth per month, projection
  python scripts\\copies_retention.py --keep-days 45        PLAN (read only): which dated files fall outside the rule, and their size
  python scripts\\copies_retention.py --keep-days 45 --apply   MOVE them (owner's decision only): to D:\\NIGRAAN\\_admin\\archive\\copies\\
                                                          <same relative path>; never deleted, never touched under LAMHA or the lake

The rule (proposal, owner decides keepDays): a dated file is kept while its date is within (the window its consumer reads, from
data/copy-sources.json: MACH 2 days, PMD-EWS 14 days, IMERG 17 days, month files 2 months) + keepDays. The consumers never read older
files, and the originals stay in LAMHA and the data lake, so nothing served changes. Files the server is copying right now (modified in the
last 30 minutes) are never moved. Paths: --copies (default: the server's own rule: NIGRAAN_COPIES_DIR, else nig\\copies), --archive.
"""
import argparse, json, os, re, shutil, sys, time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..'))


def templates(cfg):
    """(dataset, source, regex over the path relative to copies/<source>, kind 'day'|'month', window in days)"""
    out = []
    for ds, v in cfg['datasets'].items():
        for f in v.get('files', []):
            for alt in f['path'].split('|'):
                if '{' not in alt:
                    continue
                kind = 'day' if '{D}' in alt else 'month'
                rx, seen = '', set()   # first {Y}/{M}/{D} a named group, a repeat a back-reference (imerg_hh/late/{Y}/imerg_late_{Y}{M}{D}.nc)
                for part in re.split(r'(\{[YMD]\})', alt):
                    k = part[1:-1] if re.fullmatch(r'\{[YMD]\}', part) else None
                    if not k:
                        rx += re.escape(part)
                    elif k in seen:
                        rx += '(?P=%s)' % k
                    else:
                        seen.add(k); rx += '(?P<%s>\\d{%d})' % (k, 4 if k == 'Y' else 2)
                win = (max(abs(x) for x in f.get('days', [0])) + 1) if kind == 'day' else 31 * (max(abs(x) for x in f.get('months', [0])) + 1)
                out.append((ds, v['source'], re.compile('^' + rx + '$'), kind, win))
    return out


def scan(copies, T):
    rows = []
    for dp, dn, fn in os.walk(copies):
        for n in fn:
            p = os.path.join(dp, n); rel = os.path.relpath(p, copies).replace('\\', '/')
            src, _, inner = rel.partition('/')
            try:
                st = os.stat(p)
            except OSError:
                continue
            hit = None
            for ds, s, rx, kind, win in T:
                if s != src:
                    continue
                m = rx.match(inner)
                if m:
                    g = m.groupdict(); d = date(int(g['Y']), int(g['M']), int(g.get('D') or 1)); hit = (ds, kind, win, d); break
            rows.append(dict(rel=rel, bytes=st.st_size, mtime=st.st_mtime, dataset=hit[0] if hit else '(fixed or other)', kind=hit[1] if hit else 'fixed',
                             window=hit[2] if hit else None, date=hit[3] if hit else None))
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description='growth of nig\\copies and the retention rule (moves only, owner decides)')
    ap.add_argument('--copies', default=None); ap.add_argument('--archive', default=None); ap.add_argument('--config', default=os.path.join(APP, 'data', 'copy-sources.json'))
    ap.add_argument('--keep-days', type=int, default=None); ap.add_argument('--apply', action='store_true'); ap.add_argument('--today', default=None)
    a = ap.parse_args(argv)
    cfg = json.load(open(a.config, encoding='utf-8'))
    copies = a.copies or os.environ.get('NIGRAAN_COPIES_DIR') or os.path.abspath(os.path.join(APP, *cfg.get('copies', {}).get('default', ['..', 'copies'])))
    archive = a.archive or os.path.abspath(os.path.join(APP, '..', '..', '_admin', 'archive', 'copies'))
    today = date.fromisoformat(a.today) if a.today else (datetime.now(timezone.utc) + timedelta(hours=5)).date()
    if not os.path.isdir(copies):
        print('no copies folder at ' + copies); return 1
    rows = scan(copies, templates(cfg)); tot = sum(r['bytes'] for r in rows)
    print('==== copies %s  (%d files, %.1f MB)  today %s PKT' % (copies, len(rows), tot / 1e6, today))
    by = defaultdict(lambda: defaultdict(int)); cnt = defaultdict(int)
    for r in rows:
        mk = r['date'].strftime('%Y-%m') if r['date'] else '-'
        by[r['dataset']][mk] += r['bytes']; cnt[r['dataset']] += 1
    months = sorted({m for d in by.values() for m in d if m != '-'})
    for ds in sorted(by):
        s = sum(by[ds].values()); line = ', '.join('%s %.1f MB' % (m, by[ds][m] / 1e6) for m in months if by[ds].get(m))
        print('  %-24s %5d files %8.1f MB   %s' % (ds, cnt[ds], s / 1e6, line or '(fixed files, overwritten in place)'))
    # growth: per dataset with day files, the median day file (a part-day file does not pull it down) x 30.4 days; month files: one a month
    dated = [r for r in rows if r['date']]
    gday = defaultdict(list); gmon = defaultdict(list)
    for r in dated: (gday if r['kind'] == 'day' else gmon)[r['dataset']].append(r['bytes'])
    med = lambda v: sorted(v)[len(v) // 2]
    perday = {k: med(v) for k, v in gday.items()}; permon = {k: max(v) for k, v in gmon.items()}
    for k in sorted(perday): print('  growth %-22s %.2f MB per day (median of %d day files) -> %.0f MB/month' % (k, perday[k] / 1e6, len(gday[k]), perday[k] * 30.4 / 1e6))
    for k in sorted(permon): print('  growth %-22s one month file, up to %.1f MB -> %.1f MB/month' % (k, permon[k] / 1e6, permon[k] / 1e6))
    if dated:
        m = sum(perday.values()) * 30.4 + sum(permon.values())
        print('  growth: about %.0f MB/month, %.2f GB/year (datasets seen in this folder only)' % (m / 1e6, m * 12 / 1e9))
    if a.keep_days is None:
        print('  (report only; --keep-days N shows what the rule would move)'); return 0
    old = [r for r in dated if r['date'] < today - timedelta(days=r['window'] + a.keep_days) and time.time() - r['mtime'] > 1800]
    mb = sum(r['bytes'] for r in old) / 1e6
    print('  rule keepDays=%d: %d dated files outside (consumer window + %d days), %.1f MB -> %s' % (a.keep_days, len(old), a.keep_days, mb, archive))
    for r in old[:20]:
        print('    ' + r['rel'])
    if len(old) > 20:
        print('    ... %d more' % (len(old) - 20))
    if not a.apply:
        print('  (plan only: nothing moved; --apply moves them, after the owner has decided keepDays)'); return 0
    moved = 0
    for r in old:
        src = os.path.join(copies, r['rel']); dst = os.path.join(archive, r['rel'])
        if os.path.exists(dst):
            print('    kept (already in the archive): ' + r['rel']); continue
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.move(src, dst); moved += 1
    os.makedirs(archive, exist_ok=True)   # v91.17.273.1 · the archive folder may not exist yet (nothing moved, or a first run): FileNotFoundError on MOVED.txt
    with open(os.path.join(archive, 'MOVED.txt'), 'a', encoding='utf-8') as fh:
        fh.write('%s PKT  keepDays=%d  moved %d files (%.1f MB) from %s\n' % ((datetime.now(timezone.utc) + timedelta(hours=5)).strftime('%Y-%m-%d %H:%M'), a.keep_days, moved, mb, copies))
    print('  moved %d files to %s (nothing deleted)' % (moved, archive)); return 0


if __name__ == '__main__':
    sys.exit(main())
