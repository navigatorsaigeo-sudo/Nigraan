"""v91.17.283.40 science item 30: every flow-class table NIGRAAN holds for the barrages / headworks / dams, checked ROW BY ROW against the
official published flood-limit table (the river flood-forecasting office's "Flood Limits of Rivers & Nullahs (in lacs of cusecs)",
page last updated 9 Sep 2025, read 31 Oct 2026; raw page kept in data/evidence/ffdlimits40/). A second, older government chart (the
water ministry's "Flood classification of major rivers", undated PDF, same folder) is compared too; where the two differ, the flood
office table is the binding one (it is the office that issues the daily status the river sheet carries) and the difference is listed.

Tables checked (all the copies the build holds):
  T1 page science module  server/science/modules/031-page-script-57.js  AGN_FFD_LIMITS   lacs + m3s + design capacity + record peak
  T2 river outlook         data/river-outlook.json gauges[].limits      thousand cusecs
  T3 gauge-equivalent cal  data/flood-glofascal/glofascal.json reaches[].limitsKcusecs   thousand cusecs
Also: (a) the official daily status in the owner's river sheet against the official limits (row by row, both flow columns), and
(b) the server's status words (server/api/river31.mjs STATUS_LEVEL) cover every class word the office uses.

Rules fixed BEFORE the comparison: a limit matches when |table - official| <= 0.005 lacs (0.5 thousand cusecs; the table prints two
decimals); m3s matches when within 1 m3/s of lacs x 2831.68 (1 cusec = 0.0283168 m3/s); a missing official limit must be null in the
table; a record peak matches when the table peak equals the largest listed official peak (cusecs, exact) and its date.

usage: python -I ffd_limits40.py <tree> [out.json]      exit 0 = all tables match, 1 = a mismatch (listed)"""
import sys, os, re, json, html, csv, subprocess

TOL_LACS, CUSEC_M3S = 0.005, 0.0283168
KEYS = ['low', 'medium', 'high', 'veryHigh', 'exceptional']
NAME = {'tarbela': 'Tarbela', 'attock': 'Attock', 'kalabagh': 'Kalabagh', 'chashma': 'Chashma', 'taunsa': 'Taunsa', 'guddu': 'Guddu',
        'sukkur': 'Sukkur', 'kotri': 'Kotri', 'warsak': 'Warsak', 'nowshera': 'Nowshera', 'kohala': 'Kohala', 'mangla': 'Mangla',
        'rasul': 'Rasul', 'jammutawi': 'Jammu Tawi', 'akhnur': 'Akhnur', 'marala': 'Marala', 'khanki': 'Khanki', 'qadirabad': 'Qadirabad',
        'chinotbridge': 'Chiniot Bridge', 'trimmu': 'Trimmu', 'panjnad': 'Panjnad', 'jassar': 'Jassar', 'syphon': 'Ravi Syphon',
        'shahdara': 'Shahdara', 'balloki': 'Balloki', 'sidhnai': 'Sidhnai', 'suleimanki': 'Sulemanki', 'sulemanki': 'Sulemanki',
        'islam': 'Islam', 'gswala': 'Ganda Singh Wala', 'nowshehra': 'Nowshera'}
SHEET = {'Tarbela Dam': 'Tarbela', 'Kala Bagh': 'Kalabagh', 'Mangla Dam': 'Mangla', 'New Rasul': 'Rasul'}


def key(s): return NAME.get(re.sub(r'[^a-z]', '', s.lower()), s.strip())


def num(s):
    s = (s or '').strip()
    return float(re.sub(r'[^\d.]', '', s)) if re.search(r'\d', s) else None


def rows_of(page):
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', page, flags=re.S)
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', t, flags=re.S):
        yield [html.unescape(re.sub(r'<[^>]+>', '', x)).strip() for x in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, flags=re.S)]


def official_limits(ev):
    page = open(os.path.join(ev, 'ffd_flood_limits_2026-10-31.html'), encoding='utf-8').read()
    upd = (re.search(r'Last updated:\s*([^<]{3,30})', page) or [None, None])[1]
    out = {}
    for c in rows_of(page):
        if len(c) == 8 and c[0] != 'River' and not c[0].startswith('Nullah'): c = c[1:]   # first row of a river carries the river name
        if len(c) != 7 or c[0] in ('Station',) or 'Nullah' in c[0] or '(' in c[0]: continue
        if num(c[2]) is None: continue
        out[key(c[0])] = {'design': num(c[1]), 'lacs': [num(x) for x in c[2:7]]}
    return out, (upd or '').strip()


def mowr_limits(ev):
    try: txt = subprocess.run(['pdftotext', '-layout', os.path.join(ev, 'mowr_flood_classification_chart_2026-10-31.pdf'), '-'], capture_output=True, text=True).stdout
    except Exception: return {}
    out = {}
    for l in txt.splitlines():
        m = re.match(r'\s*(?:INDUS|KABUL|JHELUM|CHENAB|RAVI|SUTLEJ)?\s*([A-Z][A-Z .]+?)\s{2,}([\d.\s]+)$', l)
        if not m: continue
        v = [float(x) for x in m.group(2).split()]
        if len(v) == 6: out[key(m.group(1))] = {'design': v[0], 'lacs': v[1:]}
        elif len(v) == 5: out[key(m.group(1))] = {'design': None, 'lacs': v}
    return out


def official_peaks(ev):
    page = open(os.path.join(ev, 'ffd_historical_peaks_2026-10-31.html'), encoding='utf-8').read()
    out, st = {}, None
    for c in rows_of(page):
        if not c or c[0] == 'Station': continue
        if len(c) == 5: st = key(c[0]); c = c[1:]
        if st and len(c) == 4 and num(c[1]) is not None: out.setdefault(st, []).append((int(num(c[1])), c[2]))
    return out


def page_table(tree):
    src = open(os.path.join(tree, 'server/science/modules/031-page-script-57.js'), encoding='utf-8').read()
    blk = src[src.index('var AGN_FFD_LIMITS = {'):]; blk = blk[:blk.index('\n};') + 3]
    T = {}
    for m in re.finditer(r'"([^"]+)":\{station:"([^"]+)"(.*?)\}(?:,\n|\n)', blk):
        body = m.group(3)
        g = lambda name: dict((k, None if v == 'null' else float(v)) for k, v in re.findall(r'(\w+):([\d.]+|null)', (re.search(name + r':\{([^}]*)\}', body) or [None, ''])[1]))
        sc = lambda n: (lambda x: float(x.group(1)) if x else None)(re.search(n + r':([\d.]+)', body))
        pd = re.search(r'peakDate:"([^"]+)"', body)
        T[key(m.group(2))] = {'row': m.group(1), 'lacs': [g('lacs').get(k) for k in KEYS], 'm3s': [g('m3s').get(k) for k in KEYS],
                              'design': sc('designLacs'), 'peakCusecs': sc('peakCusecs'), 'peakDate': pd.group(1) if pd else None}
    return T


def kcs_tables(tree):
    O = json.load(open(os.path.join(tree, 'data/river-outlook.json'), encoding='utf-8'))
    T2 = {key(g['id']): [None if x is None else x / 100 for x in g['limits']] for g in O['gauges']}
    G = json.load(open(os.path.join(tree, 'data/flood-glofascal/glofascal.json'), encoding='utf-8'))
    T3 = {key(k): [None if x is None else x / 100 for x in v['limitsKcusecs']] for k, v in G['reaches'].items() if 'limitsKcusecs' in v}
    return T2, T3


def cmp_row(L, O):
    bad = []
    for k, a, b in zip(KEYS, L, O):
        if (a is None) != (b is None) or (a is not None and abs(a - b) > TOL_LACS): bad.append({'class': k, 'table': a, 'official': b})
    return bad


def sheet_check(ev, OFF):
    ORD = {'NORMAL': 0, 'NIL': 0, 'NILL': 0, 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'VERY HIGH': 4, 'EXCEPTIONAL': 5, 'EXCEPTIONALLY HIGH': 5}
    R = list(csv.DictReader(open(os.path.join(ev, 'river_sheet_archive_2026-10-30.csv'), encoding='utf-8')))
    res = {}
    for st in sorted(set(r['station'] for r in R)):
        k = key(SHEET.get(st, st))
        if k not in OFF: continue
        L = OFF[k]['lacs']; A = [r for r in R if r['station'] == st and r['status'].strip().upper() in ORD]
        def cls(q): return sum(1 for t in L if t is not None and q >= t)
        best = None
        for col in ('outflow_cusec', 'inflow_cusec'):
            P = [(num(r[col]) / 1e5, ORD[r['status'].strip().upper()], r['date']) for r in A if num(r[col]) is not None]
            dis = [{'date': d, 'flowLacs': round(q, 4), 'sheetStatus': s, 'classFromOfficialLimits': cls(q)} for q, s, d in P if cls(q) != s]
            if best is None or len(dis) < len(best[1]): best = (col, dis, len(P))
        col, dis, n = best
        res[st] = {'limitsOf': k, 'column': col, 'readings': n, 'disagree': len(dis), 'share': round(1 - len(dis) / n, 4) if n else None,
                   'flood': sum(1 for r in A if ORD[r['status'].strip().upper()] >= 1), 'examples': dis[:6]}
    words = sorted(set(r['status'].strip().upper() for r in R))
    return res, words


def main(tree, out=None):
    ev = os.path.join(tree, 'data/evidence/ffdlimits40')
    OFF, upd = official_limits(ev); MW = mowr_limits(ev); PK = official_peaks(ev)
    T1 = page_table(tree); T2, T3 = kcs_tables(tree)
    J = {'built': 'v91.17.283.40', 'official': {'source': 'river flood-forecasting office, Flood Limits of Rivers & Nullahs (lacs of cusecs)',
         'url': 'https://ffd.pmd.gov.pk/flood-limits', 'lastUpdated': upd, 'read': '2026-10-31 08:02 PKT', 'stations': len(OFF)},
         'second': {'source': 'water ministry chart, Flood classification of major rivers (undated PDF)',
                    'url': 'https://mowr.gov.pk/SiteImage/Misc/files/Flood%20limits%20classification%20Charts%20(Major%20rivers%20Nullahs).pdf', 'stations': len(MW)},
         'tables': {}, 'mismatches': [], 'secondSourceDiffers': [], 'notInTable': []}
    for tname, T, kind in (('T1 page AGN_FFD_LIMITS', T1, 'page'), ('T2 river-outlook.json', T2, 'kcs'), ('T3 glofascal.json', T3, 'kcs')):
        rows = {}
        for k, v in T.items():
            L = v['lacs'] if kind == 'page' else v
            if k not in OFF: rows[k] = {'verdict': 'no official row'}; J['mismatches'].append({'table': tname, 'station': k, 'why': 'no official row'}); continue
            bad = cmp_row(L, OFF[k]['lacs']); r = {'table': L, 'official': OFF[k]['lacs'], 'verdict': 'match' if not bad else 'MISMATCH', 'diff': bad}
            if kind == 'page':
                mb = [{'class': c, 'm3s': m, 'expected': round(l * 1e5 * CUSEC_M3S)} for c, m, l in zip(KEYS, v['m3s'], L) if (m is None) != (l is None) or (m is not None and abs(m - l * 1e5 * CUSEC_M3S) > 1)]
                if mb: r['m3sDiff'] = mb; r['verdict'] = 'MISMATCH'
                if v['design'] is not None and OFF[k]['design'] is not None and abs(v['design'] - OFF[k]['design']) > TOL_LACS:
                    r['designDiff'] = {'table': v['design'], 'official': OFF[k]['design']}; r['verdict'] = 'MISMATCH'
                if v['peakCusecs'] is not None and k in PK:
                    top = max(PK[k]); r['peak'] = {'table': [v['peakCusecs'], v['peakDate']], 'officialLargest': list(top)}
                    if int(v['peakCusecs']) != top[0] or v['peakDate'] != top[1]: r['peakDiff'] = True; r['verdict'] = 'MISMATCH'
            if r['verdict'] != 'match': J['mismatches'].append({'table': tname, 'station': k, **{x: r[x] for x in r if x not in ('table', 'official')}})
            rows[k] = r
        J['tables'][tname] = rows
    for k, v in OFF.items():
        if k in MW and cmp_row(MW[k]['lacs'], v['lacs']): J['secondSourceDiffers'].append({'station': k, 'floodOffice': v['lacs'], 'ministryChart': MW[k]['lacs']})
        held = [t for t, T in (('T1', T1), ('T2', T2), ('T3', T3)) if k in T]
        if len(held) < 3: J['notInTable'].append({'station': k, 'heldIn': held})
    J['sheet'], words = sheet_check(ev, OFF)
    J['statusWords'] = {'inSheet': words, 'note': 'every office spelling is mapped by river31.mjs normStatus: tested in status40.test.mjs'}
    J['pass'] = not J['mismatches']
    if out: json.dump(J, open(out, 'w'), indent=1)
    return J


if __name__ == '__main__':
    tree = sys.argv[1]; J = main(tree, sys.argv[2] if len(sys.argv) > 2 else None)
    print('official rows', J['official']['stations'], 'updated', J['official']['lastUpdated'])
    for t, rows in J['tables'].items(): print(t, sum(1 for r in rows.values() if r['verdict'] == 'match'), '/', len(rows), 'match')
    for m in J['mismatches']: print('MISMATCH', m)
    for m in J['secondSourceDiffers']: print('second source differs', m)
    for st, s in J['sheet'].items(): print('sheet', st, s['column'], s['readings'], 'disagree', s['disagree'], 'flood rows', s['flood'])
    print('status words in sheet', J['statusWords']['inSheet'])
    print('PASS' if J['pass'] else 'FAIL'); sys.exit(0 if J['pass'] else 1)
