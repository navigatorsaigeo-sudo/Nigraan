import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.104 · the self-check, the shown-level archive and the golden points.
   node nigraan-local/scripts/tests104/v104.test.mjs  (server running) */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { fileURLToPath as __agnF2P } from 'node:url';
const __agnPath = (u) => { const p = __agnF2P(u); return /[\\/]$/.test(u.href) && !/[\\/]$/.test(p) ? p + '/' : p; };   /* v91.17.255 · B-7 · Windows: URL.pathname gave /D:/... */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = __agnPath(new URL('../../', import.meta.url));
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(120000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };

/* golden points: fixed facts with an outside source */
const GP = JSON.parse(readFileSync(ROOT + 'data/golden-points.json', 'utf8'));
const { createPointHeight } = await __agnImp(ROOT + 'server/api/pointheight.mjs');
const PH = createPointHeight(ROOT + 'data');
for (const g of GP.points.filter(p => p.check === 'place_height')) {
  const h = PH.heightAt(g.lat, g.lon);
  ok(h.ok && Math.abs(h.elevM - g.expect_m) <= g.tol_m, 'golden: ' + g.place + ' height ' + (h && h.elevM) + ' m vs ' + g.expect_m + ' m (' + g.source.split(' (')[0] + ')');
}

const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()) });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done && AGN.selfcheck; } catch (_) { return false; } }, null, { timeout: 240000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(8000);

/* the self-check on the live map */
const R = await pg.evaluate(() => { const r = AGN.selfcheck.report(); return { summary: r.summary, units: r.units, ms: r.ms, checks: r.checks.map(c => ({ id: c.id, status: c.status, n: c.n, ex: c.examples.slice(0, 3) })), layers: Object.keys(r.layers) }; });
ok(R.units >= 575 && R.layers.length >= 12, 'self-check covers every unit on every layer (' + R.units + ' units, ' + R.layers.length + ' layers, ' + R.ms + ' ms)');
for (const c of R.checks) {
  if (c.status === 'WARN') console.log('WARN ' + c.id + ' ' + c.n + ' :: ' + c.ex.join(' | '));
  ok(c.status !== 'FAIL', 'invariant ' + c.id + ' holds on today\'s map', c.n + ': ' + c.ex.join(' | '));
}

/* the checks catch what they claim to catch: break the heat mapping and the gate on purpose */
const M = await pg.evaluate(() => { const o = {};
  const f = window.agnUtciAgnScore; window.agnUtciAgnScore = function (u) { return f(u) + 10; };
  try { const r = AGN.selfcheck.run(); o.S3 = r.checks.find(c => c.id === 'S3').status; } finally { window.agnUtciAgnScore = f; }
  const g = AGN.gate.canAlert; const a = window.activeAlerts;
  window.activeAlerts = function () { return [{ name: 'Test', hazard: 'flood', holders: [{ hazard: 'flood' }] }]; };
  try { const r = AGN.selfcheck.run(); o.S7 = r.checks.find(c => c.id === 'S7').status; } finally { window.activeAlerts = a; AGN.gate.canAlert = g; }
  const r2 = AGN.selfcheck.run(); o.after = r2.checks.filter(c => c.status === 'FAIL').map(c => c.id); return o; });
ok(M.S3 === 'FAIL' && M.S7 === 'FAIL' && M.after.length === 0, 'the self-check catches a broken heat mapping (S3) and an alert the gate forbids (S7), and clears when fixed', JSON.stringify(M));

/* golden: seismic zones on the map equal the code table */
const SZ = await pg.evaluate((pts) => pts.map(g => { try { const f = PK_DISTRICTS.features.find(x => x.properties.province === g.province && x.properties.tehsil === g.tehsil); if (!f) return [g.tehsil, g.expect, 'no such unit']; const k = f.properties.key;
  const inp = hzDayInput(k, 'seismic'); const r = aiDistrictRisk(inp, 'seismic', 24, k); return [g.tehsil + ' (' + g.province + ')', g.expect, String((r && r.zone) || '')]; } catch (e) { return [g.tehsil, g.expect, 'err ' + e.message]; } }), GP.points.filter(p => p.check === 'seismic_zone'));
for (const [k, want, got] of SZ) ok(new RegExp('zone ' + want + '\\b').test(got), 'golden: ' + k + ' seismic zone ' + want + ' (BCP-SP 2007) on the map: ' + got);

/* the shown levels and the self-check reached the server */
await pg.waitForTimeout(3000);
const SC = await get('/api/ops/selfcheck'), SCc = await get('/api/ops/selfcheck', { 'x-agn-view': 'customer' });
ok(SC.status === 200 && SC.json && Array.isArray(SC.json.checks) && SCc.status === 403, 'self-check stored on the server, operator-only');
const dir = ROOT + 'data/archive/shown';
const files = existsSync(dir) ? readdirSync(dir).filter(f => /^shown_\d{4}-\d{2}\.jsonl\.gz$/.test(f)) : [];
ok(files.length >= 1, 'shown levels archived (' + files.join(', ') + ')');
if (files.length) { const { gunzipSync } = await import('node:zlib'); const rows = gunzipSync(readFileSync(dir + '/' + files.sort().pop())).toString().split('\n').filter(Boolean).map(l => JSON.parse(l)); const last = rows[rows.length - 1];
  ok(last.layers && last.layers.rain_hz && Object.keys(last.layers.rain_hz.L).length >= 575 && last.gate && last.build, 'a shown record holds every tehsil per layer, with the gate and build (' + rows.length + ' records)'); }
const SS = await get('/api/ops/shown/score'), SSc = await get('/api/ops/shown/score', { 'x-agn-view': 'customer' });
ok(SS.status === 200 && SS.json && SS.json.archive && SS.json.rain && SS.json.heat && SSc.status === 403, 'shown-level scoring answers (rain: ' + ((SS.json && SS.json.rain && (SS.json.rain.text || SS.json.rain.why)) || '') + ')');
const op = await pg.evaluate(async () => { try { AGN.operator && AGN.operator(true); } catch (_) {} document.documentElement.classList.add('agn-operator'); return true; });
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v104: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
