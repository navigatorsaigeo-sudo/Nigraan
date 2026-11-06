/* v91.17.283.52 · F2 + F3 · the analyst page on load, both views, one Chromium:
   F3  every request that fails (HTTP >= 400 or no answer) while the page loads and settles (25 s), with its initiator; console errors;
   F2  the location line with a 10 km browser position: shown in the page flow (not fixed / absolute), its box overlaps no map, no card
       other than its own place, has a close button, close works, and is not shown again on a reload (once per visit); screenshots.
   usage: node scripts/tests28351fx/net52.mjs <base> <outdir> [tag]       exit 1 on any failed same-origin request or any F2 failure */
import { mkdirSync, writeFileSync } from 'node:fs';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url)); const PW = T.playwrightSync();
const [B, O, TAG = 'after'] = process.argv.slice(2); mkdirSync(O, { recursive: true });
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=1000'] });
const origin = new URL(B).origin; const res = { tag: TAG, failed: [], external: [], console: [], pageErrors: [], c1: {} };
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
async function ctxFor(view, geo) { const o = { viewport: { width: 1440, height: 900 } }; if (geo) { o.geolocation = geo; o.permissions = ['geolocation']; }
  const ctx = await br.newContext(o); await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} }, view === 'operator'); return ctx; }
function watch(pg, where) {
  pg.on('response', (r) => { if (r.status() >= 400) { const u = r.url(); (u.startsWith(origin) ? res.failed : res.external).push({ where, status: r.status(), url: u.replace(origin, ''), type: r.request().resourceType(), init: (r.request().frame() && r.request().frame().url() || '').replace(origin, '') }); } });
  pg.on('requestfailed', (r) => { const u = r.url(); const f = r.failure() && r.failure().errorText; if (/ERR_ABORTED/.test(f || '')) return; (u.startsWith(origin) ? res.failed : res.external).push({ where, status: 'failed ' + f, url: u.replace(origin, ''), type: r.resourceType() }); });
  pg.on('console', (m) => { if (m.type() === 'error') res.console.push(where + ': ' + m.text().slice(0, 240)); });
  pg.on('pageerror', (e) => res.pageErrors.push(where + ': ' + String(e.message).slice(0, 200))); }
for (const view of ['customer', 'operator']) for (const [nm, path] of [['plain', '/analyst'], ['place', '/analyst#agnplace=33.7233,73.0435,E-7&agnview=overview']]) {
  const ctx = await ctxFor(view); const pg = await ctx.newPage(); const where = view + ' ' + nm; watch(pg, where);
  for (let k = 0; k < 2; k++) { try { await pg.goto(B + path, { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(25000); break; } catch (e) { console.log('retry ' + where + ': ' + String(e.message).split('\n')[0]); res.crashes = (res.crashes || 0) + 1; } }
  await ctx.close(); }
/* F2: the coarse location line, both views */
for (const view of ['customer', 'operator']) for (let k = 0; k < 2; k++) { try {
  const ctx = await ctxFor(view, { latitude: 33.70, longitude: 73.05, accuracy: 10000 }); const pg = await ctx.newPage(); watch(pg, 'coarse ' + view);
  await pg.goto(B + '/analyst', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(9000);
  const v = await pg.evaluate(() => { const e = document.getElementById('agnLocNote'); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    const over = []; const boxes = [...document.querySelectorAll('#map, .leaflet-container, .card, section, canvas')].filter((x) => x !== e && !x.contains(e) && x.offsetParent !== null);
    for (const x of boxes) { const q = x.getBoundingClientRect(); if (q.width && q.height && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) over.push((x.id ? '#' + x.id : x.className && String(x.className).slice(0, 40)) || x.tagName); }
    return { shown: !e.hidden && e.offsetParent !== null, text: e.innerText.replace(/\s+/g, ' ').trim(), position: cs.position, parent: e.parentNode && (e.parentNode.className || e.parentNode.tagName), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], over, close: !!e.querySelector('button') && !e.querySelector('button').hidden }; });
  await pg.screenshot({ path: O + '/' + TAG + '_c1_' + view + '.png' });
  const nt = await pg.$('#agnLocNote'); if (nt) { await nt.scrollIntoViewIfNeeded().catch(() => {}); await nt.screenshot({ path: O + '/' + TAG + '_c1_' + view + '_line.png' }).catch(() => {}); }
  const after14 = await pg.waitForTimeout(6000).then(() => pg.evaluate(() => { const e = document.getElementById('agnLocNote'); return !!(e && !e.hidden && e.offsetParent !== null); }));
  if (nt) await pg.click('#agnLocNote button').catch(() => {}); const closed = await pg.evaluate(() => { const e = document.getElementById('agnLocNote'); return !e || e.hidden || e.offsetParent === null; });
  await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(9000); const again = await pg.evaluate(() => { const e = document.getElementById('agnLocNote'); return !!(e && !e.hidden && e.offsetParent !== null); });
  res.c1[view] = { v, after14, closed, again };
  ok(v && v.shown && /Approximate location/.test(v.text), view + ' F2: the coarse line is shown', JSON.stringify(v));
  ok(v && v.position === 'static', view + ' F2: in the page flow (position ' + (v && v.position) + ', under ' + (v && v.parent) + ')');
  ok(v && v.over.length === 0, view + ' F2: covers no map, card or other content', JSON.stringify(v && v.over));
  ok(v && v.close, view + ' F2: close button'); ok(closed, view + ' F2: close hides it'); ok(!again, view + ' F2: not shown again on reload (once per visit)');
  await ctx.close(); break; } catch (e) { console.log('retry coarse ' + view + ': ' + String(e.message).split('\n')[0]); res.crashes = (res.crashes || 0) + 1; } }
await br.close();
const uniq = (a) => [...new Map(a.map((x) => [x.where.split(' ')[0] + ' ' + x.status + ' ' + x.url.split('?')[0], x])).values()];
res.failedUnique = uniq(res.failed); res.externalUnique = uniq(res.external);
writeFileSync(O + '/' + TAG + '_net52.json', JSON.stringify(res, null, 1));
for (const x of res.failedUnique) console.log('FAILED-REQ', x.where, x.status, x.type, x.url.slice(0, 160));
for (const x of res.externalUnique) console.log('EXTERNAL', x.where, x.status, x.type, x.url.slice(0, 160));
console.log('console errors:', res.console.length, [...new Set(res.console.map((c) => c.replace(/^\S+ \S+: /, '')))].slice(0, 12).join(' || '));
/* the basemap tile proxy (/tiles/...) answers 502 when ITS upstream cannot be reached: in the offline test server every non-provider host is
   blocked, so those are the test environment (listed, not counted); OFFLINE_TILES=0 counts them too */
const env = res.failedUnique.filter((x) => process.env.OFFLINE_TILES !== '0' && /^\/tiles\//.test(x.url) && x.status === 502); res.failedUnique = res.failedUnique.filter((x) => !env.includes(x));
console.log('tile proxy 502 (offline test environment, not counted): ' + env.length);
ok(res.failedUnique.length === 0, 'F3: zero failed same-origin requests on load (both views, with and without a place)', res.failedUnique.length + ' distinct');
ok(res.pageErrors.length === 0, 'no page errors', res.pageErrors.slice(0, 3).join(' | '));
console.log('net52: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
