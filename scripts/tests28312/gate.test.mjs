import * as __T from '../lib/testenv.mjs';
/* v91.17.283.12 · BUILD-TIME GATE: ONE CALCULATION POINT ON EVERY PAGE (owner rule: one server, no hard coding, no patch layering).
   Static (no server): the code of every script of the analyst page, the start page and Customize (comments removed) may name a forbidden
   address (a weather or hazard value of a point computed outside the point state: /api/point/forecast, /api/v1/forecast/point,
   /api/hyperlocal/*, /api/mos/point, /api/ecmwf010/point, /api/pool/point, /api/state/point, /api/urban/point, /px/v1/*, the provider's
   hosts) only where gate-allow.json lists that script and that kind with its reason (operator-only, not a point value, or a reviewed
   exception). The v283.11 display layer and the wrappers removed in v283.12 must stay removed, and no script may rebind fetch to answer
   a value endpoint. Page-side arithmetic that derives temperature, heat or a level from raw inputs is listed (flagged, not failed).
   Runtime (a server with this release; the mock provider is enough): each page is opened in the CLIENT view and used (a city, an exact
   point, a place, the tabs); every forbidden request it makes must come from a listed script that is not operator-only (CDP initiator
   stacks, async included), the pages must read /api/pointstate, and no visible text may brand model output "MACH" (MACH names AGN's
   stations; a value says "MACH forecast" only where the live MACH layer corrected it, which the mock never does).
   usage: node scripts/tests28312/gate.test.mjs [http://127.0.0.1:8787] [--static] */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, FORBIDDEN, ARITH, codeScripts, blockAt } from './jsscan.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), ART = (f) => join(ROOT, 'artefact', f);
const ALLOW = JSON.parse(readFileSync(join(HERE, 'gate-allow.json'), 'utf8'));
const PAGES = { analyst: 'AI_GEO_NIGRAAN_v91_17_MACH.html', start: 'NIGRAAN_START.html', customize: 'NIGRAAN_3.html' };
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };

/* ---- static ---- */
for (const [pg, file] of Object.entries(PAGES)) {
  const S = scan(ART(file), FORBIDDEN), A = ALLOW.static[file] || {}, bad = [];
  for (const [blk, hits] of Object.entries(S)) for (const k of Object.keys(hits)) if (!(A[blk] && A[blk].kinds.includes(k))) bad.push(blk + ': ' + k + ' x' + hits[k]);
  ok(!bad.length, 'S1 ' + pg + ': every forbidden address in code is a listed exception (' + Object.keys(S).length + ' scripts name one, all reviewed)', bad.join(' | '));
  const stale = Object.keys(A).filter((b) => !S[b]); ok(!stale.length, 'S1 ' + pg + ': no listed script stopped naming one (v283.15: a stale entry fails, so the list only shrinks): ' + (stale.join(', ') || 'none'));
}
const con = readFileSync(ART(PAGES.analyst), 'utf8'), st = readFileSync(ART(PAGES.start), 'utf8'), n3 = readFileSync(ART(PAGES.customize), 'utf8');
ok(!/id="agn-v28311-ps-js"/.test(con), 'S2 the v283.11 display layer (agn-v28311-ps-js) is gone');
ok(!/G\.fetch\s*=\s*function\s*\(\s*input\s*,\s*init\s*\)\s*\{\s*try\s*\{\s*var u=typeof input/.test(con) && !/\/api\/point\/forecast'\)\{\s*var la=/.test(con), 'S2 no script rebinds fetch to answer a value endpoint');
const wr = (re) => (con.match(re) || []).length;
ok(wr(/G\.heatRiskLabel\s*=(?!=)/g) === 0 && wr(/G\.asOfLineHTML\s*=(?!=)/g) === 0 && wr(/G\.popHtml\s*=(?!=)/g) === 0 && wr(/G\.pinMeasure\s*=(?!=)/g) === 0 && wr(/G\.fetchHourlyForecast\s*=(?!=)/g) === 0 && wr(/window\.fetchLiveStations\s*=(?!=)/g) === 0 && wr(/window\.AGNConditions\.getConditions\s*=(?!=)\s*async/g) === 0 && wr(/function pointTiles\(/g) === 0,
  'S2 the wrappers on the rewired values are gone (heatRiskLabel, asOfLineHTML, popHtml, pinMeasure, fetchHourlyForecast, fetchLiveStations, getConditions, pointTiles)');
ok(/G\.AGN\.pointState=\{/.test(con) && /G\.AGN\.nowAt=\{peek:peek,get:get\}/.test(con), 'S3 the point-state library sits at the source of AGN.nowAt (agn-v122-now)');
/* v91.17.283.19: each page reads ONE place bundle per place (GET /api/point); the single point-state and near routes are retired */
ok(/function pointUrl\(p,fresh\)\{ return '\/api\/point\?'/.test(st) && !/\/api\/pointstate\?/.test(st) && !/function acIndex\(/.test(st), 'S3 the start page reads the place bundle (/api/point) and has no polygon index of its own');
ok(/api\('\/api\/point\?lat='/.test(n3) && !/\/api\/pointstate(\?|\/near)/.test(n3), 'S3 Customize reads the place bundle (/api/point), no /api/pointstate or /api/pointstate/near');
const flags = []; for (const [pg, file] of Object.entries(PAGES)) { const F = scan(ART(file), ARITH); for (const [b, h] of Object.entries(F)) flags.push(pg + ' ' + b + ' ' + Object.entries(h).map(([k, v]) => k + 'x' + v).join(',')); }
console.log('FLAG page-side arithmetic from raw inputs (reviewed, not failed): ' + (flags.join(' | ') || 'none'));

if (process.argv.includes('--static')) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

/* ---- runtime ---- */
const BASE = __T.BASE;
const PW = __T.playwrightSync(); if (PW.__missing) { console.log('\n' + pass + ' passed, ' + fail + ' failed (runtime skipped: ' + PW.__missing + ')'); process.exit(fail ? 1 : 0); }
const exe = __T.chromiumPath();
const KIND = (u) => { for (const [k, re] of FORBIDDEN) { re.lastIndex = 0; if (re.test(u)) return k; } return null; };
const TRANSPORT = new Set(['#14', '#16', 'agn-operator-js', 'agn-p75-ai']);   /* the transport (AGN.api, the view header) and an observer of AGN.api.fetch: they carry requests, start none */
const br = await __T.launch(PW.chromium, { executablePath: exe, args: ['--no-sandbox'] });
async function run(pg, path, act) {
  const file = ART(PAGES[pg]), A = ALLOW.static[PAGES[pg]] || {};
  const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Debugger.enable'); await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
  const seen = [], ps = { n: 0 }, errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  cdp.on('Network.requestWillBeSent', (e) => { const u = e.request.url; if (/\/api\/point(\?|\/batch\?)/.test(u)) ps.n++; const k = KIND(u); if (!k) return;
    const blocks = new Set(); let s = e.initiator && e.initiator.stack;
    while (s) { for (const f of s.callFrames || []) { if (!f.url || !f.url.startsWith(BASE) || /\.m?js(\?|$)/.test(f.url)) continue; const b = blockAt(file, f.lineNumber, f.columnNumber); if (b && !TRANSPORT.has(b)) blocks.add(b); } s = s.parent; }
    seen.push({ u: u.replace(BASE, '').slice(0, 110), k, blocks: [...blocks] }); });
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await act(page);
  const txt = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('.leaflet-popup-content,[title]')].map((e) => e.getAttribute('title') || '').join(' '));
  const isOp = await page.evaluate(() => document.documentElement.classList.contains('agn-operator'));
  await ctx.close();
  const fam = (k) => (k === 'px-provider' ? 'provider-host' : k), has = (b, k) => A[b] && A[b].kinds.some((x) => fam(x) === fam(k));   /* /px/v1/* is the provider through the server proxy */
  const bad = seen.filter((r) => !r.blocks.some((b) => has(b, r.k) && A[b].class !== 'operator'));
  ok(!isOp, 'R0 ' + pg + ' opened in the client view (no operator opt-in)');
  ok(!bad.length, 'R1 ' + pg + ': ' + seen.length + ' forbidden-kind requests, each from a listed non-operator script', JSON.stringify(bad.map((r) => ({ u: r.u.slice(0, 70), b: r.blocks }))).slice(0, 1500));
  ok(ps.n > 0, 'R2 ' + pg + ' read the place bundle (' + ps.n + ' requests to /api/point or /api/point/batch)');
  const brand = (txt.match(/MACH (forecast|model|best[- ]match|multi-model|hourly|Forecast API|Air Quality|Historical)|via MACH\b|· MACH ·|LIVE · MACH/g) || []);
  ok(!brand.length, 'R3 ' + pg + ': no model output branded MACH on screen (the mock never applies the live layer)', [...new Set(brand)].join(' | '));
  const kinds = {}; seen.forEach((r) => { const k = r.blocks[0] || '?'; kinds[k] = (kinds[k] || 0) + 1; }); console.log('INFO ' + pg + ' forbidden-kind requests by script: ' + JSON.stringify(kinds));
  if (errs.length) console.log('INFO ' + pg + ' page errors: ' + errs.slice(0, 3).join(' | '));
}
await run('analyst', '/analyst', async (p) => { await p.waitForTimeout(30000); await p.evaluate(() => { try { selectCity('lhr', true); } catch (_) {} }); await p.waitForTimeout(8000);
  try { await p.fill('#agnPtInput', '28.28187, 68.43761'); await p.waitForTimeout(2500); const b = await p.$('#agnPtRes button'); if (b) await b.click(); } catch (_) {}
  await p.waitForTimeout(15000); });
await run('start', '/', async (p) => { await p.waitForTimeout(8000); await p.evaluate(() => AGNSTART.select({ lat: 31.558, lon: 74.35071, name: 'Lahore' })); await p.waitForTimeout(12000);
  for (const t of ['fc', 'hz', 'place']) { try { await p.evaluate((x) => AGNSTART.goTab && AGNSTART.goTab(x), t); } catch (_) {} await p.waitForTimeout(2500); } });
await run('customize', '/customize#agnplace=27.70323,68.85889,Sukkur', async (p) => { await p.waitForTimeout(15000);
  for (const t of ['outlook', 'sites', 'proof', 'overview']) { try { await p.click('[data-s="' + t + '"]', { timeout: 3000 }); } catch (_) {} await p.waitForTimeout(6000); } });
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
