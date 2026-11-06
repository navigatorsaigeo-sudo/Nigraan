/* v91.17.283.28 · page lane (28328p): shared helpers of the item tests in this folder (not a suite: no *.test.mjs name).
   src(name)        the page file's text (artefact/<name>)
   script(name, id) the text of one inline <script id="..."> block
   T()              { ok, done } counters; done() prints the totals and exits 1 on any FAIL
   browser()        Playwright Chromium (the suite SKIPs when it is not installed)
   open(br, path, o) a page on the running server (argv[2] / NIGRAAN_BASE): { ctx, pg, errs, log }; o.init = init script, o.route(pg) = routes set before the page loads
   consoleReady(pg) waits until the analyst console's store and place intake are up
   place(pg, text)  selects a place by coordinates the way the place search does (AGN.point.goText) and waits for the page to settle
   tab(pg, view)    opens a main tab (#machNav [data-goto]) */
import * as __T from '../lib/testenv.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export const BASE = __T.BASE;
export const ROOT = __T.ROOT;
export const src = (name) => readFileSync(join(ROOT, 'artefact', name), 'utf8');
export const MACH = 'AI_GEO_NIGRAAN_v91_17_MACH.html', START = 'NIGRAAN_START.html', N3 = 'NIGRAAN_3.html';
export function script(s, id) { const a = s.indexOf('<script id="' + id + '"'); if (a < 0) return null; return s.slice(a, s.indexOf('</script>', a)); }
export function T() {
  let pass = 0, fail = 0;
  const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
  const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
  return { ok, done };
}
export async function browser() {
  const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
  return __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
}
export async function open(br, path, o = {}) {
  const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } }); if (o.init) await ctx.addInitScript(o.init);
  const pg = await ctx.newPage(); if (o.route) await o.route(pg); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  const log = []; ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE)) log.push({ u: u.replace(BASE, ''), m: r.method(), t: Date.now() }); });
  await pg.goto(BASE + path, { waitUntil: 'load', timeout: 180000 });
  return { ctx, pg, errs, log };
}
export async function consoleReady(pg, op) {
  await pg.waitForFunction(() => { try { return !!(AGN.point && AGN.engineLevels && AGN.v283 && document.getElementById('agnPtInput')); } catch (_) { return false; } }, null, { timeout: 300000, polling: 1000 });
  if (op) { await pg.evaluate(() => AGN.operator.set(true)); await pg.waitForTimeout(1500); }
}
export async function place(pg, text) {
  await pg.evaluate((t) => AGN.point.goText(t, { quiet: true, label: 'Test place' }), text || '33.69500, 73.03000');
  await pg.waitForFunction(() => { try { const a = AGN.data.activePoint(); const B = a && AGN.pointState.peek(a.lat, a.lon); return !!(B && B.parts && B.parts.levels && !B.parts.levels.pending); } catch (_) { return false; } }, null, { timeout: 120000, polling: 500 }).catch(() => {});
  await pg.waitForTimeout(2500);
}
export async function tab(pg, view, ms) { await pg.click('#machNav [data-goto="' + view + '"]').catch(() => {}); await pg.waitForTimeout(ms || 2500); }
