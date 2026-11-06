"""v91.17.283.13 · build stamp only: the console's AGN_BUILD.patch and the start page's agn-version / version line say 91.17.283.13 (so the page
and package.json name the same build), CSP resealed by the same rule as build/v28312/apply28312.py, artefact/MANIFEST.json updated, the
science re-extracted, jscheck of the two pages. No other page change. Idempotent. usage: python3 scripts/v28313/stamp28313.py <tree>"""
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
s = rd(P); a, b = "G.AGN_BUILD.patch='91.17.283.12';", "G.AGN_BUILD.patch='91.17.283.13';"
if b not in s: assert s.count(a) == 1; s = reseal(s.replace(a, b)); open(P, 'w', encoding='utf-8', newline='').write(s); log.append('console: build stamp 91.17.283.13, CSP resealed')
VER = [('<meta content="91.17.283.12" name="agn-version"/>', '<meta content="91.17.283.13" name="agn-version"/>'), ("NIGRAAN v91.17.283.12');", "NIGRAAN v91.17.283.13');")]
for path, seal in ((PS, True), (SRC, False)):
    st = rd(path); ch = False
    for x, y in VER:
        if y in st: continue
        assert st.count(x) == 1, (path, x); st = st.replace(x, y); ch = True
    if ch:
        if seal: st = reseal(st)
        open(path, 'w', encoding='utf-8', newline='').write(st); log.append(os.path.basename(path) + ': version 91.17.283.13')
MF = os.path.join(T, 'artefact', 'MANIFEST.json'); mf = json.load(open(MF))
CH = {NAME: 'v91.17.283.13 (24 Oct 2026, hazard science on the server): build stamp 91.17.283.13 only; the issued hazard levels come from the server (hazsci.mjs).',
      START: 'v91.17.283.13 (24 Oct 2026): version 91.17.283.13, CSP resealed.'}
for k, txt in CH.items():
    bb = open(os.path.join(T, 'artefact', k), 'rb').read(); e = mf[k]; prev = e.get('change', '')
    e['bytes'] = len(bb); e['sha256'] = hashlib.sha256(bb).hexdigest()
    if not prev.startswith('v91.17.283.13'): e['change'] = txt + ' Previous: ' + prev
json.dump(mf, open(MF, 'w'), indent=2)
for k, v in mf.items():
    bb = open(os.path.join(T, 'artefact', k), 'rb').read(); assert hashlib.sha256(bb).hexdigest() == v['sha256'] and len(bb) == v['bytes'], k
log.append('MANIFEST matches %d files' % len(mf))
r = subprocess.run(['node', 'scripts/tests283/ws8/extract.mjs', 'artefact/' + NAME, 'scripts/tests283/ws8/keep.json'], cwd=T, capture_output=True, text=True)
assert r.returncode == 0, r.stdout + r.stderr; log.append('science re-extracted')
for pg in (NAME, START):
    r = subprocess.run(['node', 'build/v283/jscheck.mjs', 'artefact/' + pg], cwd=T, capture_output=True, text=True)
    assert r.returncode == 0 and ' 0 do not parse' in r.stdout, r.stdout + r.stderr; log.append('jscheck %s ok' % pg)
print('\n'.join(log))
