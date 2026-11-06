#!/usr/bin/env python3
"""v91.17.283.46 · same-value test of the dashboard reports. usage: python3 -I samevalue46.py BASE REPORT.html [REPORT.html ...]
For each downloaded report (the reader's Download HTML: the same document that is printed, issued and packed) it checks that
  1. the dashboard tile strip shows, for every hazard and day, the same level word as the report's own "levels by day" table;
  2. the same words as the served tehsil levels (GET /api/levels/unit?unit=<the report's tehsil>);
  3. the air-quality bars show the served index (GET /api/smog/unit) day by day;
  4. the dashboard report id is the id in the report's foot;
  5. every chart is present, and a chart that is not drawn says "Not available here" with a reason (never an empty frame).
Exit 0 when every check passes."""
import sys, re, json, urllib.request, urllib.parse
from bs4 import BeautifulSoup
BASE = sys.argv[1].rstrip('/'); FILES = sys.argv[2:]
def get(p):
    rq = urllib.request.Request(BASE + p, headers={'x-agn-view': 'customer'})
    with urllib.request.urlopen(rq, timeout=90) as r: return json.loads(r.read().decode('utf8'))
MON = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])}
NAMES = {'Heat stress': 'heat', 'Cold stress (UTCI)': 'cold', 'Cold stress': 'cold', 'Heavy rain': 'rain_hz', 'Landslide': 'landslide', 'Drought': 'drought', 'Wind and gusts': 'wind', 'Flood': 'flood', 'River flood': 'flood', 'Glacial lake outburst flood (GLOF)': 'glof', 'GLOF': 'glof'}
WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe']
fails = 0; checks = 0
def ok(c, msg):
    global fails, checks; checks += 1
    if not c: fails += 1
    print(('PASS ' if c else 'FAIL ') + msg)
for F in FILES:
    b = BeautifulSoup(open(F, encoding='utf8').read(), 'lxml'); name = F.split('/')[-1]
    rk = b.select_one('[data-rk46]'); ok(rk is not None, name + ': the report carries the dashboard')
    if rk is None: continue
    dash = b.select_one('[data-rk46=dashboard]'); ok(dash is not None, name + ': page 1 is the dashboard')
    tiles = {}
    for d in dash.select('[data-v]') if dash else []:
        v = d.get('data-v', '')
        if '@' in v and '=' in v:
            for kv in v.split(';'):
                m = re.match(r'([a-z_]+)@(\d{4}-\d\d-\d\d)=(\w+)', kv)
                if m: tiles[(m.group(1), m.group(2))] = m.group(3)
    ok(bool(tiles), name + ': the tile strip holds levels (%d hazard-days)' % len(tiles))
    # 1 · the report's own table
    yr = min((k[1][:4] for k in tiles), default='2026')
    tab = None
    for h in b.find_all('h3'):
        if re.search(r'levels by day', h.get_text(), re.I): tab = h.find_next('table'); break
    n1 = bad1 = 0
    if tab:
        rows = tab.find_all('tr'); hd = [c.get_text(' ', strip=True) for c in rows[0].find_all(['th', 'td'])]
        dates = []
        for x in hd[1:]:
            m = re.search(r'(\d{1,2}) (\w{3})', x); dates.append('%s-%02d-%02d' % (yr, MON[m.group(2)], int(m.group(1))) if m and m.group(2) in MON else None)
        for r in rows[1:]:
            c = [x.get_text(' ', strip=True) for x in r.find_all(['th', 'td'])]; k = NAMES.get(c[0])
            if not k: continue
            for i, dd in enumerate(dates):
                if not dd or i + 1 >= len(c): continue
                w = c[i + 1].split(' ')[0]
                if w in WORDS and (k, dd) in tiles: n1 += 1; bad1 += tiles[(k, dd)] != w
                elif w in WORDS: n1 += 1; bad1 += 1; print('   missing tile', k, dd, w)
    if tab is None: print('SKIP ' + name + ': this edition prints no levels-by-day table')
    else: ok(n1 > 0 and bad1 == 0, name + ': tile strip = the report\'s levels-by-day table (%d cells, %d differ)' % (n1, bad1))
    # 2 · served levels
    lat = lon = None
    m = re.search(r'(\d{2}\.\d{3,5}), (\d{2}\.\d{3,5})', b.get_text(' '))
    pts = b.select_one('[data-rk46-place]')
    if pts: lat, lon = pts['data-rk46-place'].split(',')
    if lat:
        U = get('/api/outlook/unit?lat=%s&lon=%s' % (lat, lon)); uid = U['unit']['unitId']
        L = get('/api/levels/unit?unit=' + urllib.parse.quote(uid)); n2 = bad2 = 0
        for d in L.get('days', []):
            for k, lay in (d.get('layers') or {}).items():
                if not isinstance(lay, dict): continue
                lv = lay.get('level'); w = WORDS[lv] if isinstance(lv, int) and 0 <= lv <= 4 else (lay.get('word') if lay.get('word') in WORDS else None)
                if w and (k, d['date']) in tiles: n2 += 1; bad2 += tiles[(k, d['date'])] != w
        ok(n2 > 0 and bad2 == 0, name + ': tile strip = served /api/levels/unit for %s (%d cells, %d differ)' % (uid, n2, bad2))
        aq = [x for x in b.select('[data-v]') if x['data-v'].startswith('aqi:')]
        if aq:
            S = get('/api/smog/unit?lat=%s&lon=%s' % (lat, lon)); served = {d['date']: d.get('aqi') for d in S.get('days', [])}
            got = dict(kv.split('=') for kv in aq[0]['data-v'][4:].split(';') if '=' in kv)
            ok(all(str(served.get(k)) == v for k, v in got.items()) and got, name + ': air-quality bars = served /api/smog/unit (%d days)' % len(got))
    else: ok(False, name + ': the report point was not found in the dashboard')
    # 4 · id
    idv = [x['data-v'][3:] for x in b.select('[data-v]') if x['data-v'].startswith('id=')]
    foot = b.select_one('.rk-foot'); ok(bool(idv) and foot is not None and idv[0] in foot.get_text(' '), name + ': dashboard id = foot id (%s)' % (idv[0] if idv else '-'))
    # 5 · charts present or honestly not available
    figs = b.select('figure[data-rk46]'); empty = [f['data-rk46'] for f in figs if not f.select('svg') and 'Not available here' not in f.get_text()]
    ok(len(figs) >= (1 if dash is not None and "short" in (rk.get("data-rk46-edition") or name) else 5) and not empty, name + ': %d charts, none empty (%s)' % (len(figs), ', '.join(f['data-rk46'] for f in figs)))
print('RESULT %d checks, %d failed' % (checks, fails)); sys.exit(1 if fails else 0)
