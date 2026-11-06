import * as __T from '../lib/testenv.mjs';
/* v91.17.283.12 · ONE PLACE RESOLUTION, 50 NAMES ON BOTH PAGES. For each name: the server's place search (GET /api/geo/search, its first
   result after the one place rule, server/api/placerule.mjs) and GET /api/geo/resolve give the same point; a town name resolves to the
   settlement, an explicit "X tehsil" / "X district" to that unit's main settlement with a label saying so. Then the start page (the search
   box: Check, or the first row it lists) and Customize (the search box, its first row) each ask the place bundle for exactly that point
   (v283.19: the place of their /api/point answer), so the same query shows the same point everywhere.
   usage: node scripts/tests28312/place50.test.mjs [http://127.0.0.1:8787] */
const BASE = __T.BASE;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } };
const NAMES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Peshawar', 'Quetta', 'Multan', 'Faisalabad', 'Hyderabad', 'Sukkur', 'Jacobabad', 'Larkana',
  'Muzaffarabad', 'Mirpur', 'Kotli', 'Gilgit', 'Skardu', 'Hunza', 'Chitral', 'Murree', 'Abbottabad', 'Mansehra', 'Mardan', 'Kohat', 'Bannu',
  'Dera Ghazi Khan', 'Bahawalpur', 'Sialkot', 'Gujranwala', 'Sargodha', 'Jhelum', 'Chakwal', 'Attock', 'Mianwali', 'Gwadar', 'Turbat', 'Khuzdar',
  'Zhob', 'Sibi', 'Thatta', 'Badin', 'Mithi', 'Nawabshah', 'Taxila',
  'Murree tehsil', 'Kahuta tehsil', 'Muzaffarabad tehsil', 'Hunza district', 'Kotli district', 'Sukkur district'];
const J = async (u) => { const r = await fetch(BASE + u, { headers: { 'x-agn-view': 'customer' } }); return r.ok ? r.json() : null; };
const same = (a, b, dp) => a && b && Math.abs(a.lat - b.lat) < Math.pow(10, -dp) / 2 + 1e-9 && Math.abs(a.lon - b.lon) < Math.pow(10, -dp) / 2 + 1e-9;
const R = {};
for (const q of NAMES) {
  const s = await J('/api/geo/search?q=' + encodeURIComponent(q) + '&limit=8'), r = await J('/api/geo/resolve?q=' + encodeURIComponent(q));
  const top = s && s.results && s.results[0];
  R[q] = r && r.ok ? { lat: r.lat, lon: r.lon, label: r.label, rule: r.rule, level: r.level } : null;
  const explicit = /\b(tehsil|district)\b/i.test(q);
  ok(top && R[q] && same({ lat: top.lat, lon: top.lon }, R[q], 5) && (explicit ? /main settlement/.test(R[q].rule || '') && /main settlement/.test(R[q].label || '') : (/settlement/.test(R[q].rule || ''))),
    'P1 "' + q + '": search and resolve give ' + (R[q] ? R[q].lat + ', ' + R[q].lon + ' (' + R[q].label + '; ' + R[q].rule + ')' : 'nothing'), JSON.stringify({ top: top && [top.name, top.level, top.lat, top.lon], r: R[q] }));
}
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
async function onPage(path, pick) {
  const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } }), pg = await ctx.newPage(); let last = null;
  /* v91.17.283.19: the page asks its place bundle (GET /api/point, by the place table id or the point); the point is the bundle's place */
  /* v91.17.283.20 (B8): a completion read (&complete=1) is the same place's bundle read once more; the place is its first answer */
  pg.on('response', async (rs) => { const u = rs.url(); if (!/\/api\/point\?/.test(u) || /[?&]complete=1/.test(u)) return; try { const j = await rs.json(); if (j && j.place && Number.isFinite(j.place.lat)) last = { lat: j.place.lat, lon: j.place.lon }; } catch (_) {} });
  await pg.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 }); await pg.waitForTimeout(9000);
  const out = {};
  for (const q of NAMES) { last = null; try { await pick(pg, q); } catch (e) { out[q] = { err: String(e).slice(0, 80) }; continue; }
    for (let i = 0; i < 60 && !last; i++) await pg.waitForTimeout(250);
    /* Customize keeps an answer 10 min per address, so a place it already holds is not asked again: its point is then the page's own S.p */
    if (!last) last = await pg.evaluate(() => (window.NIGRAAN3 && NIGRAAN3.state && NIGRAAN3.state.p) ? { lat: NIGRAAN3.state.p.lat, lon: NIGRAAN3.state.p.lon, held: true } : null);
    out[q] = last; }
  await ctx.close(); return out;
}
const searched = (pg, q) => pg.waitForResponse((r) => /\/api\/geo\/search\?q=/.test(r.url()) && decodeURIComponent(new URL(r.url()).searchParams.get('q') || '') === q, { timeout: 30000 });
const START = await onPage('/', async (pg, q) => { await pg.fill('#q', q); const w = searched(pg, q);
  await pg.evaluate(() => { document.getElementById('sform').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); });
  await w; await pg.waitForTimeout(700); const b = await pg.$('#sr button[data-i="0"]'); if (b) await b.click(); });
const CUST = await onPage('/customize', async (pg, q) => { await pg.fill('#q', ''); await pg.waitForTimeout(300); const w = searched(pg, q); await pg.type('#q', q, { delay: 5 });
  await w; await pg.waitForSelector('#results [data-i="0"]', { timeout: 15000 }); await pg.waitForTimeout(400); await pg.click('#results [data-i="0"]'); });
let sAll = 0, cAll = 0; const sBad = [], cBad = [];
for (const q of NAMES) { const r = R[q]; if (!r) continue;
  if (same(START[q], r, 4)) sAll++; else sBad.push(q + ' -> ' + JSON.stringify(START[q]) + ' want ' + r.lat + ',' + r.lon);
  if (same(CUST[q], r, 4)) cAll++; else cBad.push(q + ' -> ' + JSON.stringify(CUST[q]) + ' want ' + r.lat + ',' + r.lon); }
ok(sAll === NAMES.length, 'P2 start page: ' + sAll + ' of ' + NAMES.length + ' names ask the place bundle for the resolved point', sBad.join(' | '));
ok(cAll === NAMES.length, 'P3 Customize: ' + cAll + ' of ' + NAMES.length + ' names ask the place bundle for the resolved point', cBad.join(' | '));
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
