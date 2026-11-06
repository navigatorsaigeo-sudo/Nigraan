import * as __T from '../lib/testenv.mjs';
/* v91.17.283.18 · THE TWO PAGES ON THE ONE PLACE LAYER (browser):
   G1 each page loads with no page error and no console error (start page '/', analyst '/analyst'; 25 s each); a resource the test
      server answers with 4xx/5xx (the mock provider, data the cloud copy lacks) is listed, not failed: the same routes fail on v283.17
   G2 typing into the search box makes exactly one place search request per debounce: "Sial" (fast keys), a pause, "kot" (fast keys)
      -> 2 requests on each page, both GET /api/geo/search, and no other place route is asked while typing
   G3 the same query selects the same record on both pages: the first suggestion of the start page and of the analyst header search,
      clicked, ask the place bundle (start; v283.19: GET /api/point, its place) / drive the page (analyst) at the point of the server's
      first row, for 5 queries
   usage: node scripts/tests28318/pages.test.mjs [base] */
const BASE = __T.BASE;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const PLACE = /\/api\/geo\/(search|resolve|reverse|near|settlement|towns|place)\b/;
async function open(path) {
  const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } }), pg = await ctx.newPage();
  const errs = [], reqs = [], fails = [];
  pg.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  pg.on('response', (r) => { if (r.status() >= 400) fails.push(r.status() + ' ' + r.url().replace(BASE, '').replace(/\?.*/, '')); });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e).slice(0, 200)));
  pg.on('request', (r) => { const u = r.url(); if (PLACE.test(u) || /\/api\/point\?/.test(u)) reqs.push({ u, t: Date.now() }); });
  /* v91.17.283.19: the start page asks the place bundle (GET /api/point) by the place table id; its point is the answer's place */
  /* v91.17.283.20 (B8): a completion read (&complete=1) is the same place's bundle read once more; the place is its first answer */
  pg.on('response', async (r) => { const u = r.url(); if (!/\/api\/point\?/.test(u) || /[?&]complete=1/.test(u)) return; try { const j = await r.json(); if (j && j.place) reqs.push({ u, t: Date.now(), place: { lat: j.place.lat, lon: j.place.lon } }); } catch (_) {} });
  await pg.goto(BASE + path, { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(25000);
  return { ctx, pg, errs, reqs, fails };
}
const J = async (u) => { const r = await fetch(BASE + u); return r.ok ? r.json() : null; };
const QS = ['Sialkot', 'Lahore', 'F-10', 'Gilgit', 'Murree'];
const want = {}; for (const q of QS) { const s = await J('/api/geo/search?q=' + encodeURIComponent(q) + '&limit=8&suggest=1'); want[q] = s && s.results && s.results[0]; }
const near = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
const ptOf = (u) => { const x = new URL(u); return { lat: +x.searchParams.get('lat'), lon: +x.searchParams.get('lon') }; };

/* ---- start page ---- */
{ const S = await open('/');
  ok(!S.errs.length, 'G1 start page: no console or page error in 25 s' + (S.fails.length ? ' (failed resources: ' + [...new Set(S.fails)].join(', ') + ')' : ''), S.errs.join(' | '));
  const n0 = S.reqs.length;
  await S.pg.click('#q'); await S.pg.keyboard.type('Sial', { delay: 40 }); await S.pg.waitForTimeout(900); await S.pg.keyboard.type('kot', { delay: 40 }); await S.pg.waitForTimeout(1500);
  const typed = S.reqs.slice(n0); const srch = typed.filter((r) => /\/api\/geo\/search\?/.test(r.u));
  ok(srch.length === 2 && typed.length === 2 && /q=Sial&/.test(srch[0].u) && /q=Sialkot&/.test(srch[1].u), 'G2 start page: 2 debounced searches for "Sial" + pause + "kot", nothing else asked (' + typed.map((r) => r.u.replace(BASE, '')).join(', ') + ')');
  const got = {};
  for (const q of QS) { await S.pg.fill('#q', ''); await S.pg.waitForTimeout(300); const m = S.reqs.length;
    await S.pg.type('#q', q, { delay: 20 }); await S.pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 20000 }); await S.pg.waitForTimeout(400); await S.pg.click('#sr button[data-ac="0"]');
    for (let i = 0; i < 80; i++) { const p = S.reqs.slice(m).find((r) => r.place); if (p) { got[q] = p.place; break; } await S.pg.waitForTimeout(250); }
    try { await S.pg.evaluate(() => { const b = document.querySelector('#btnBack, [data-act="back"]'); if (b) b.click(); }); } catch (_) {} }
  const bad = QS.filter((q) => !near(got[q], want[q]));
  ok(!bad.length, 'G3 start page: the first suggestion is the server\'s first row for ' + QS.length + ' queries', bad.map((q) => q + ' got ' + JSON.stringify(got[q]) + ' want ' + (want[q] && want[q].lat + ',' + want[q].lon)).join(' | '));
  await S.ctx.close(); }

/* ---- analyst ---- */
{ const A = await open('/analyst');
  ok(!A.errs.length, 'G1 analyst page: no console or page error in 25 s' + (A.fails.length ? ' (failed resources: ' + [...new Set(A.fails)].join(', ') + ')' : ''), A.errs.join(' | '));
  await A.pg.evaluate(() => { const c = document.getElementById('citysel'); if (c) c.classList.add('open'); });
  const n0 = A.reqs.length;
  await A.pg.click('#hdrPlaceInput'); await A.pg.keyboard.type('Sial', { delay: 40 }); await A.pg.waitForTimeout(900); await A.pg.keyboard.type('kot', { delay: 40 }); await A.pg.waitForTimeout(1500);
  const typed = A.reqs.slice(n0).filter((r) => PLACE.test(r.u)); const srch = typed.filter((r) => /\/api\/geo\/search\?/.test(r.u));
  ok(srch.length === 2 && typed.length === 2 && /q=Sial&/.test(srch[0].u) && /q=Sialkot&/.test(srch[1].u), 'G2 analyst header search: 2 debounced searches for "Sial" + pause + "kot", no other place route (' + typed.map((r) => r.u.replace(BASE, '')).join(', ') + ')');
  const got = {};
  for (const q of QS) { await A.pg.evaluate(() => { const c = document.getElementById('citysel'); if (c) c.classList.add('open'); });
    await A.pg.fill('#hdrPlaceInput', ''); await A.pg.waitForTimeout(300);
    await A.pg.type('#hdrPlaceInput', q, { delay: 20 }); await A.pg.waitForSelector('#hdrPlaceResults button[data-i="0"]', { timeout: 20000 }); await A.pg.waitForTimeout(500);
    const m = A.reqs.length; await A.pg.click('#hdrPlaceResults button[data-i="0"]');
    for (let i = 0; i < 80; i++) {   /* the page's active point (the store keys its records at 0.01 degree; the active point is exact) */
      const ap = await A.pg.evaluate(() => { try { const a = window.AGN && AGN.data && AGN.data.activePoint && AGN.data.activePoint(); return a && isFinite(a.lat) ? { lat: +a.lat, lon: +a.lon } : null; } catch (_) { return null; } });
      got[q] = ap; if (ap && near(ap, want[q])) break; await A.pg.waitForTimeout(250); } }
  const bad = QS.filter((q) => !near(got[q], want[q]));
  ok(!bad.length, 'G3 analyst page: the first header suggestion drives the page at the server\'s first row for ' + QS.length + ' queries (the same record as the start page)', bad.map((q) => q + ' got ' + JSON.stringify(got[q]) + ' want ' + (want[q] && want[q].lat + ',' + want[q].lon)).join(' | '));
  await A.ctx.close(); }
await br.close();
console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
