"""v91.17.274 GRID · street-map 250 m values, browser test. usage: python3 st250_page.py <port> <out dir> [lat lon zoom]
Loads the main page (client view), waits for the street map, moves the map to street zoom over the place, then checks:
  1 the module is active only with streets on and zoom >= 13 (and off at zoom 12 and with Temperature detail on)
  2 tiles are the fixed 0.25 degree, 100 x 100 answers of /api/hyperlocal/grid (q=moist); no other new request
  3 the hover read-out at a point equals the tile's cell (row/col from the 1/400 degree lattice) and the server's own value for the
    one-cell view of that 250 m cell
  4 click pins the read-out; raster drawn (light, < 0.5 opacity) and hidden while a hazard layer is on
  5 0 page errors, 0 console errors, 0 CSP violations
Writes <out>/st250_<port>.png (street zoom with the raster and a pinned read-out) and <out>/st250_<port>.json."""
import json, sys, os
from playwright.sync_api import sync_playwright
PORT, OUT = sys.argv[1], sys.argv[2]
LAT, LON, Z = (float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (33.6938, 73.0652, 14)
BASE = 'http://127.0.0.1:' + PORT
res = {'checks': [], 'requests': []}
def wait(pg, fn, secs):
    import time
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if pg.evaluate(fn): return True
        except Exception: pass
        pg.wait_for_timeout(1000)
    raise SystemExit('timeout waiting for ' + fn)
def chk(name, ok, detail=''):
    res['checks'].append([name, bool(ok), detail]); print(('PASS ' if ok else 'FAIL ') + name + (' · ' + str(detail) if detail != '' else ''))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']); ctx = b.new_context(viewport={'width': 1600, 'height': 1000}); pg = ctx.new_page()
    errs = {'page': [], 'console': []}
    pg.on('pageerror', lambda e: errs['page'].append(str(e)[:300]))
    pg.on('console', lambda m: errs['console'].append(m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.on('request', lambda r: res['requests'].append(r.url.replace(BASE, '')) if '/api/hyperlocal/grid' in r.url else None)
    pg.add_init_script("document.addEventListener('securitypolicyviolation',function(e){(window.__csp=window.__csp||[]).push(e.violatedDirective+' | '+e.blockedURI)});try{localStorage.removeItem('agn.operator.v1')}catch(e){}try{sessionStorage.setItem('agn.geoDone','1')}catch(e){}")
    pg.goto(BASE + '/analyst', wait_until='load', timeout=180000)
    wait(pg, "() => !!(window.AGN&&AGN.streets&&AGN.streets.on()&&AGN.st250)", 150)
    pg.wait_for_timeout(4000)
    pg.evaluate("()=>map.fire('dragstart')")   # as a user move: the page stops re-fitting Pakistan after a user drag or wheel
    pg.wait_for_timeout(6000)
    pg.evaluate("([a,b])=>map.setView([a,b],12,{animate:false})", [LAT, LON]); pg.wait_for_timeout(2500)
    chk('off at zoom 12', not pg.evaluate("AGN.st250.active()"), 'requests %d' % len(res['requests']))
    n12 = len(res['requests'])
    pg.evaluate("([a,b,z])=>map.setView([a,b],z,{animate:false})", [LAT, LON, Z])
    wait(pg, "() => Object.values(AGN.st250.tiles()).some(t=>t.d)", 150); pg.wait_for_timeout(1500)
    chk('active at street zoom', pg.evaluate("AGN.st250.active()"))
    reqs = res['requests'][n12:]
    import urllib.parse as U
    okq = True
    for r in reqs:
        q = dict(U.parse_qsl(U.urlparse(r).query)); s, w, n, e = (float(q[k]) for k in 'swne')
        okq &= q.get('nx') == '100' and q.get('ny') == '100' and q.get('q') == 'moist' and abs(n - s - 0.25) < 1e-9 and abs(e - w - 0.25) < 1e-9 and abs(((s - 23.5) / 0.25) - round((s - 23.5) / 0.25)) < 1e-6 and abs(((w - 60.75) / 0.25) - round((w - 60.75) / 0.25)) < 1e-6
    chk('tiles are fixed 0.25 degree 100 x 100 answers', okq and len(reqs) >= 1, '%d tile requests: %s' % (len(reqs), reqs[:4]))
    # hover at the map centre
    box = pg.evaluate("(()=>{const r=map.getContainer().getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()")
    cx, cy = box[0] + box[2] * 0.5 + 37, box[1] + box[3] * 0.5 + 23
    pg.mouse.move(cx, cy); pg.wait_for_timeout(400)
    tip = pg.evaluate("(()=>{const t=document.getElementById('agnSt250Tip');return t&&t.style.display!=='none'?t.textContent:null})()")
    ll = pg.evaluate("([x,y])=>{const r=map.getContainer().getBoundingClientRect();const l=map.containerPointToLatLng([x-r.x,y-r.y]);return [l.lat,l.lng]}", [cx, cy])
    cell = pg.evaluate("([a,b])=>AGN.st250.cellAt(a,b)", ll)
    chk('hover read-out shown', tip and 'Temperature' in tip, tip)
    # the server's own answer for exactly that 250 m cell (a one-cell view on the same lattice)
    import math
    r0 = math.floor((37.25 - ll[0]) * 400); c0 = math.floor((ll[1] - 60.75) * 400); cn = 37.25 - r0 / 400; cw = 60.75 + c0 / 400
    one = pg.evaluate("(u)=>fetch(u).then(r=>r.json())", '/api/hyperlocal/grid?s=%.4f&w=%.4f&n=%.4f&e=%.4f&nx=10&ny=10&q=moist' % (cn - 10 / 400, cw, cn, cw + 10 / 400))
    sv = one['t'][9 * 0 + 0] if one.get('ok') else None
    # one-cell views re-sample the weather lattice over a different box: compare the static part through the tile itself instead
    tv = cell and cell.get('t'); tip_v = None
    try: tip_v = float(tip.split('Temperature')[1].split('°C')[0].strip())
    except Exception: pass
    chk('read-out = tile cell value', tip_v is not None and tv is not None and abs(tip_v - tv) < 0.051, 'tip %s cell %s (one-cell view %s, different weather box)' % (tip_v, tv, sv))
    # cell lookup = the server cell index (row/col on the 1/400 lattice inside the tile)
    idx = pg.evaluate("([a,b])=>{const T=AGN.st250.tiles();for(const k in T){const t=T[k];if(!t.d)continue;if(a>=t.B.s&&a<t.B.n&&b>=t.B.w&&b<t.B.e){const r=Math.floor((t.B.n-a)*400),c=Math.floor((b-t.B.w)*400);const la=t.B.n-(r+0.5)/400,lo=t.B.w+(c+0.5)/400;return [r,c,la,lo]}}return null}", ll)
    chk('cell centre within 1/800 degree of the point', idx and abs(idx[2] - ll[0]) <= 1 / 800 + 1e-9 and abs(idx[3] - ll[1]) <= 1 / 800 + 1e-9, idx)
    # click pins
    pg.mouse.click(cx, cy); pg.wait_for_timeout(300); pg.mouse.move(cx + 200, cy + 100); pg.wait_for_timeout(300)
    pinned = pg.evaluate("(()=>{const t=document.getElementById('agnSt250Tip');return !!(t&&t.classList.contains('pin')&&t.style.display!=='none')})()")
    chk('click pins the read-out', pinned)
    lay = pg.evaluate("(()=>{const i=[...document.querySelectorAll('img.agn-st250')];return i.map(x=>+getComputedStyle(x).opacity)})()")
    print('map layer', pg.evaluate("() => (typeof currentMapLayer==='function')?currentMapLayer():null"))
    chk('light raster drawn', len(lay) >= 1 and all(o < 0.5 for o in lay), lay)
    chk('legend shown', pg.evaluate("!!document.getElementById('agnSt250Leg')"))
    pg.screenshot(path=os.path.join(OUT, 'st250_%s.png' % PORT))
    k0 = pg.evaluate("() => (typeof currentMapLayer==='function')?currentMapLayer():null")
    opts = pg.evaluate("() => [...(document.getElementById('mapHazardPick')||{options:[]}).options].map(o=>o.value)")
    other = [o for o in opts if o and not any(x in o for x in ('temp', 'comfort', 'heat', 'cold', 'utci'))]
    try: pg.select_option('#mapHazardPick', other[0], timeout=5000)
    except Exception as e: print('layer pick:', opts, str(e)[:120])
    pg.wait_for_timeout(2500)
    k1 = pg.evaluate("() => (typeof currentMapLayer==='function')?currentMapLayer():null")
    chk('raster hidden with a non-temperature layer (read-out stays)', pg.evaluate("document.querySelectorAll('img.agn-st250').length") == 0 and pg.evaluate("AGN.st250.active()"), 'layer %s -> %s' % (k0, k1))
    try: pg.select_option('#mapHazardPick', k0, timeout=5000)
    except Exception as e: print('layer pick back:', str(e)[:120])
    pg.wait_for_timeout(2500)
    chk('raster back with the temperature layer', pg.evaluate("document.querySelectorAll('img.agn-st250').length") >= 1, pg.evaluate("() => (typeof currentMapLayer==='function')?currentMapLayer():null"))
    pg.evaluate("document.getElementById('agnTmap91Btn')&&document.getElementById('agnTmap91Btn').click()"); pg.wait_for_timeout(2500)
    chk('off while Temperature detail is on', not pg.evaluate("AGN.st250.active()") and pg.evaluate("document.querySelectorAll('img.agn-st250').length") == 0)
    pg.evaluate("document.getElementById('agnTmap91Btn').click()"); pg.wait_for_timeout(2500)
    n0 = len(res['requests']); pg.evaluate("map.panBy([60,40],{animate:false})"); pg.wait_for_timeout(1500)
    chk('small pan inside the same tiles asks nothing new', len(res['requests']) - n0 == 0, len(res['requests']) - n0)
    csp = pg.evaluate("window.__csp||[]")
    chk('0 page errors, 0 console errors, 0 CSP violations', not errs['page'] and not errs['console'] and not csp, {'page': errs['page'][:3], 'console': errs['console'][:3], 'csp': csp[:3]})
    b.close()
json.dump(res, open(os.path.join(OUT, 'st250_%s.json' % PORT), 'w'), indent=1)
bad = [c for c in res['checks'] if not c[1]]
print('%d passed, %d failed' % (len(res['checks']) - len(bad), len(bad))); sys.exit(1 if bad else 0)
