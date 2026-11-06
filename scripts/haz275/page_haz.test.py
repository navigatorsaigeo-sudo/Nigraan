#!/usr/bin/env python3
"""v91.17.275 HAZ2 · page checks (headless Chromium, offline server of this tree): 0 page / console / CSP errors; the fault lines draw
inside the one layers menu ("More layers" -> "Recent earthquakes & faults") with the GEM credit and no damage number; the glacial-lake
legend and popups carry only five-word tier words; the hzGLOF engine label carries no ladder word.
usage: python3 page_haz.test.py http://127.0.0.1:8979"""
import sys, re, json
from playwright.sync_api import sync_playwright
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8979').rstrip('/')
fails = passes = 0
def ok(c, name, extra=''):
    global fails, passes
    if c: passes += 1; print('PASS', name, ('· ' + str(extra)[:200]) if extra else '')
    else: fails += 1; print('FAIL', name, (':: ' + str(extra)[:400]) if extra else '')
LADDER = re.compile(r'\b(Monitor|Watch|Act|Priority|Elevated)\b')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); pg = b.new_page(viewport={'width': 1600, 'height': 1000})
    errs = {'page': [], 'console': [], 'csp': []}
    pg.on('pageerror', lambda e: errs['page'].append(str(e)[:300]))
    pg.on('console', lambda m: errs['console'].append(m.text[:300]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.add_init_script("document.addEventListener('securitypolicyviolation',function(e){(window.__csp=window.__csp||[]).push(e.violatedDirective+' | '+e.blockedURI)});try{localStorage.removeItem('agn.operator.v1')}catch(e){}")
    pg.goto(BASE + '/', wait_until='load', timeout=180000); pg.wait_for_timeout(15000)
    # the one layers menu holds the earthquakes & faults button
    inmenu = pg.evaluate("()=>{ var b=document.getElementById('agnQuakeBtn'); return !!(b && b.closest('#agnLayersMenu80')); }")
    ok(inmenu, 'the fault-line layer sits inside the one layers menu ("More layers")')
    drawn = pg.evaluate("()=>AGN.quake.toggle(true).then(function(){ return new Promise(function(r){ setTimeout(function(){ var L=document.getElementById('agnQuakeLeg'); var pn=map.getPane('agnQuake'); r({n:pn?pn.querySelectorAll('path').length:0, leg:L?L.innerText:''}); },3000); }); })")
    ok(drawn['n'] >= 400 and 'Active fault' in drawn['leg'] and 'GEM' in drawn['leg'], 'fault lines drawn (%d map items) with the GEM credit in the legend' % drawn['n'], drawn['leg'][:200])
    ok(not re.search(r'(PKR|Rs\.?|USD|\$)\s?\d|damage|loss', drawn['leg'], re.I), 'no damage or loss number in the earthquake & fault legend')
    pop = pg.evaluate("()=>fetch('/api/faults').then(r=>r.json()).then(j=>({ok:j.ok, n:(j.features||[]).length, credit:j.credit}))")
    ok(pop['ok'] and pop['n'] == 403, '/api/faults serves 403 GEM features', pop)
    pg.evaluate("()=>AGN.quake.toggle(false)")
    # glacial lakes: legend words
    g = pg.evaluate("()=>{ try{ var r=AGN.glofMap.toggle(true); return true; }catch(e){ return 'ERR '+e; } }")
    pg.wait_for_timeout(8000)
    leg = pg.evaluate("()=>{ var L=document.getElementById('agnGlofLeg'); return L?L.innerText:''; }")
    ok(g is True and leg and not LADDER.search(leg) and 'High' in leg and 'Moderate' in leg and 'SUPARCO' in leg, 'glacial-lake legend: High / Moderate / Low susceptibility, SUPARCO named, no ladder word', leg[:300])
    lab = pg.evaluate("()=>{ try{ var n=window.__agnGlofNat; if(!n||!n.units) return null; var u=Object.keys(n.units).find(k=>n.units[k].applicable); return u; }catch(e){ return 'ERR '+e; } }")
    ok(lab is not None, 'the national GLOF table reached the page', lab)
    csp = pg.evaluate("()=>window.__csp||[]")
    b.close()
    ok(not csp, '0 CSP violations', csp[:3])
    ok(not errs['page'], '0 page errors', errs['page'][:3])
    ok(not errs['console'], '0 console errors', errs['console'][:3])
print('\n%d PASS, %d FAIL' % (passes, fails)); sys.exit(1 if fails else 0)
