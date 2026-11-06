"""v91.17.283.19 · build stamp and reseal (copied from scripts/v28318/stamp28318.py; version and change lines): the console's AGN_BUILD.patch and the start page's agn-version / version line say 91.17.283.19 (whatever 91.17.283.x
they said before), package.json 91.17.283.19, CSP resealed by the same rule as build/v28312/apply28312.py
(the stamp changes an inline script), artefact/MANIFEST.json updated (all three pages), the science re-extracted, jscheck of the
pages. Idempotent. usage: python3 scripts/v28319/stamp28319.py <tree>"""
import sys, os, re, json, hashlib, base64, subprocess
T = sys.argv[1]
NAME = 'AI_GEO_NIGRAAN_v91_17_MACH.html'; START = 'NIGRAAN_START.html'
P = os.path.join(T, 'artefact', NAME); PS = os.path.join(T, 'artefact', START); SRC = os.path.join(T, 'build', 'start', 'start.src.html')
rd = lambda p: open(p, encoding='utf-8', newline='').read()
CSP_RE = re.compile(r'<meta content="([^"]*)" http-equiv="Content-Security-Policy"/>')
BLOCK = re.compile(r'(<(script|style)((?:(?!>)[^\n])*?)>)(.*?)(</\2>)', re.S)
h = lambda t: "'sha256-" + base64.b64encode(hashlib.sha256(t.encode('utf-8')).digest()).decode() + "'"
def inline_hashes(doc):
    return [(m.group(2), h(m.group(4))) for m in BLOCK.finditer(doc) if not (m.group(2) == 'script' and re.search(r'\bsrc\s*=', m.group(3)))]
def reseal(doc):
    m = CSP_RE.search(doc); assert m and len(CSP_RE.findall(doc)) == 1
    csp = m.group(1); want = {'script': [], 'style': []}
    for kind, hh in inline_hashes(doc):
        if hh not in want[kind]: want[kind].append(hh)
    out = []
    for dd in csp.split(';'):
        parts = dd.split()
        if parts and parts[0] in ('script-src', 'style-src'):
            kind = parts[0][:-4]; keep = [p for p in parts[1:] if not p.startswith("'sha256-")]
            dd = (' ' if dd.startswith(' ') else '') + ' '.join([parts[0]] + keep + want[kind])
        out.append(dd)
    new = ';'.join(out); strip = lambda c: re.sub(r" 'sha256-[^']+'", '', c); assert strip(new) == strip(csp)
    doc = doc[:m.start(1)] + new + doc[m.end(1):]
    w = CSP_RE.search(doc).group(1); assert not [x for x in inline_hashes(doc) if x[1] not in w]
    return doc
log = []
V = '91.17.283.19'
s = rd(P); s2 = re.sub(r"G\.AGN_BUILD\.patch='91\.17\.283\.\d+';", "G.AGN_BUILD.patch='" + V + "';", s); assert s2.count("G.AGN_BUILD.patch='" + V + "';") == 1
s2 = reseal(s2)
if s2 != s: open(P, 'w', encoding='utf-8', newline='').write(s2); log.append('console: build stamp ' + V + ', CSP resealed')
for path, seal in ((PS, True), (SRC, False)):
    st = rd(path); n = re.sub(r'<meta content="91\.17\.283\.\d+" name="agn-version"/>', '<meta content="' + V + '" name="agn-version"/>', st)
    n = re.sub(r"NIGRAAN v91\.17\.283\.\d+'\);", "NIGRAAN v" + V + "');", n)
    assert n.count('content="' + V + '" name="agn-version"') == 1, path
    if seal: n = reseal(n)
    if n != st: open(path, 'w', encoding='utf-8', newline='').write(n); log.append(os.path.basename(path) + ': version ' + V + (', CSP resealed' if seal else ''))
P3 = os.path.join(T, 'artefact', 'NIGRAAN_3.html')   # v91.17.283.19: Customize's inline scripts changed: its CSP is resealed by the same rule
if os.path.exists(P3):
    s3 = rd(P3)
    if CSP_RE.search(s3):
        n3 = reseal(s3)
        if n3 != s3: open(P3, 'w', encoding='utf-8', newline='').write(n3); log.append('NIGRAAN_3.html: CSP resealed')
PJ = os.path.join(T, 'package.json'); pj = open(PJ, encoding='utf-8').read(); pj2 = re.sub(r'"version": "91\.17\.283\.\d+"', '"version": "' + V + '"', pj)
if pj2 != pj: open(PJ, 'w', encoding='utf-8').write(pj2); log.append('package.json ' + V)
MF = os.path.join(T, 'artefact', 'MANIFEST.json'); mf = json.load(open(MF))
CH = {NAME: 'v91.17.283.19 (25 Oct 2026): one server call drives the page: one in-page store reads GET /api/point once per place (the place bundle: place record, corrected now / hours / days, the one nearest station, levels, outlook, smog, site screening and risk, river link, lakes upstream, climatology, past 30 days, report context, frozen run, facts, places nearby, land inputs, models side by side, AI local term, chance of rain) and GET /api/point/batch for other points; every section reads it; no provider forecast request from the page; national items once per page load; build stamp 91.17.283.19, CSP resealed.',
      START: 'v91.17.283.19 (25 Oct 2026): one request per place (GET /api/point); Now shows dew point, gusts, pressure, cloud, UV and the chance of rain, the nearest station on its own line; the handoff carries the bundle; version 91.17.283.19, CSP resealed.',
      'NIGRAAN_3.html': 'v91.17.283.19 (25 Oct 2026): one request per place (GET /api/point) for the point, its station, levels, outlook, report context, past 30 days, frozen run and site screening; CSP resealed.'}
for k, txt in CH.items():
    if k == 'NIGRAAN_3.html' and not os.path.exists(os.path.join(T, 'artefact', k)): continue
    bb = open(os.path.join(T, 'artefact', k), 'rb').read(); e = mf[k]; prev = e.get('change', '')
    e['bytes'] = len(bb); e['sha256'] = hashlib.sha256(bb).hexdigest()
    if not prev.startswith('v91.17.283.19'): e['change'] = txt + ' Previous: ' + prev
json.dump(mf, open(MF, 'w'), indent=2)
for k, v in mf.items():
    bb = open(os.path.join(T, 'artefact', k), 'rb').read(); assert hashlib.sha256(bb).hexdigest() == v['sha256'] and len(bb) == v['bytes'], k
log.append('MANIFEST matches %d files' % len(mf))
r = subprocess.run(['node', 'scripts/tests283/ws8/extract.mjs', 'artefact/' + NAME, 'scripts/tests283/ws8/keep.json'], cwd=T, capture_output=True, text=True)
assert r.returncode == 0, r.stdout + r.stderr; log.append('science re-extracted')
for pg in (NAME, START, 'NIGRAAN_3.html'):
    r = subprocess.run(['node', 'build/v283/jscheck.mjs', 'artefact/' + pg], cwd=T, capture_output=True, text=True)
    assert r.returncode == 0 and ' 0 do not parse' in r.stdout, r.stdout + r.stderr; log.append('jscheck %s ok' % pg)
print('\n'.join(log))
