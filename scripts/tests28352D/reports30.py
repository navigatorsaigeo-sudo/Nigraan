#!/usr/bin/env python3
"""v91.17.283.52 D · every single-place report kind, both views, on 30 places (tests28351g3/places30.json) through POST /api/report/generate on a
real-data server: each report 200 and linted by the server (the linter refuses a failing report), and these set-D checks on the drawn text:
  plain place name (no "Near ", no "km from", no bearing) · no "between <date> to" · no internal ids (SLI-nnnn, YYYY-Wnn, Place answer,
  Analysis snapshot, Data digest) in the customer view · no "primed" · no "on alert" for a Low area · the gauge caption inside its card
  (linter L13) · no page holding only the Evidence table · page 1 of situation / 72-hour / executive differ from each other by >= 5 lines ·
  the executive "In brief" names air quality when an air-quality tile is shown.
usage: python3 reports30.py <base> <places30.json> <out dir>"""
import json, sys, re, os, urllib.request, concurrent.futures as cf
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests28351g3'))
from rtxt import text
B, PF, OUT = sys.argv[1:4]; os.makedirs(OUT, exist_ok=True)
P = json.load(open(PF)); KINDS = ['site_assessment', 'situation_report', 'readiness_72h', 'executive_brief', 'assurance_pack', 'weather_impact', 'data_gap', 'engineering_note']
def req(path, body=None, view='customer'):
    h = {'x-agn-view': view, 'sec-fetch-site': 'same-origin'}
    if body is not None: h['content-type'] = 'application/json'
    r = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=900) as x: return x.status, x.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
fails = []; passes = 0; page1 = {}
def one(p, k, view):
    st, b = req('/api/report/generate', {'lat': p['lat'], 'lon': p['lon'], 'kind': k, 'section': 'test'}, view)
    try: j = json.loads(b)
    except Exception: j = {}
    if st != 200 or not j.get('ok'): return (p['id'], k, view, ['generate ' + str(st) + ' ' + json.dumps(j)[:400]], None)
    st2, h = req(j['html'] + ('?view=operator' if view == 'operator' else ''), None, view); T = text(h.decode('utf-8', 'replace'))
    open(os.path.join(OUT, p['id'] + '.' + k + '.' + view + '.txt'), 'w').write(T)
    bad = []; flat = T.replace('\n', ' ')
    pages = re.split(r'--- page \d+\n', T)[1:]
    p1 = pages[0] if pages else ''
    title = p1.split('\n')[2] if p1.count('\n') > 2 else ''
    if re.match(r'^(Near |\d+(\.\d+)? km )', title) or ' km from ' in p1.split('\n')[4] if p1.count('\n') > 4 else False: bad.append('place name not plain: ' + title)
    if re.search(r'between \d{1,2} \w{3} to ', flat): bad.append('"between ... to"')
    if re.search(r'\b[A-Z]{2,5}-\d{3,6}\b', flat.replace(j['id'], '').replace('SHA-256', '')): bad.append('internal id: ' + re.search(r'\b[A-Z]{2,5}-\d{3,6}\b', flat.replace(j['id'], '').replace('SHA-256', '')).group(0))
    if re.search(r'\b20\d\d-W\d\d\b', flat): bad.append('ISO week id')
    if view == 'customer' and re.search(r'Place answer|Analysis snapshot|Data digest', flat): bad.append('internal evidence ids in customer view')
    if re.search(r'\bprimed\b', flat): bad.append('"primed"')
    m = re.search(r'(\d+) areas? on alert[^.]*?\((?:[^)]*· )?Low\)', flat)
    if m: bad.append('Low area called on alert')
    for pg in pages[1:]:
        body = [l for l in pg.split('\n') if l.strip() and not l.startswith('AI GEO NIGRAAN ·')]
        if body and body[0].startswith('Item Value') and len(body) <= 12: bad.append('a page holds only the rest of the Evidence table')
    if k == 'executive_brief' and 'Air quality' in p1 and 'AQI' in p1:
        ib = re.search(r'In brief:(.*?)\n(?:Key messages|Heat stress today)', p1, re.S)
        if ib and 'air quality' not in ib.group(1).lower(): bad.append('In brief omits air quality')
    if j.get('customerPages', 0) > 2: bad.append('customer part ' + str(j.get('customerPages')) + ' pages')
    return (p['id'], k, view, bad, p1)
jobs = [(p, k, v) for p in P for v in ('customer', 'operator') for k in KINDS]
with cf.ThreadPoolExecutor(3) as ex:
    for pid, k, v, bad, p1 in ex.map(lambda a: one(*a), jobs):
        if bad: fails.append((pid, k, v, bad)); print('FAIL', pid, k, v, bad, flush=True)
        else: passes += 1
        if p1 is not None: page1[(pid, k, v)] = p1
# page 1 of the three briefing kinds differs
for p in P:
    for v in ('customer', 'operator'):
        S = [set(l for l in page1.get((p['id'], k, v), '').split('\n')[6:] if l.strip()) for k in ('situation_report', 'readiness_72h', 'executive_brief')]
        if all(S):
            for i, j2 in ((0, 1), (0, 2), (1, 2)):
                d = len(S[i] ^ S[j2])
                if d < 10: fails.append((p['id'], 'page1', v, ['page 1 of two kinds differs by only %d lines' % d])); print('FAIL page1', p['id'], v, d)
                else: passes += 1
print('reports30: %d pass, %d fail' % (passes, len(fails))); sys.exit(1 if fails else 0)
