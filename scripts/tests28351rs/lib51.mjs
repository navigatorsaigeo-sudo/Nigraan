import { statSync } from 'node:fs';
/* v91.17.283.51 · shared by outlook51 / scn51 / port51 (customer ?operator=0 and operator views). usage: node <suite> <base url> [out dir]
   The browser clock follows a test server started with a shifted clock when NIGRAAN_SIM_START (epoch ms at the server's start) and
   NIGRAAN_SIM_PIDFILE (a file written at the server's start) are set; otherwise the real clock. */
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href);
export const PW = T.playwrightSync();
export const BASE = (process.argv.slice(2).find((a) => /^https?:/.test(a)) || process.env.NIGRAAN_BASE || process.env.BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
export const OUT = (process.argv.slice(2).find((a) => !/^https?:/.test(a)) || process.env.OUT || '/dev/shm/tests28351rs') + '/'; (await import('node:fs')).mkdirSync(OUT, { recursive: true });
/* the browser clock = the test server's shifted clock (SIM_START at the server's start) */
export function serverNow() { const S = Number(process.env.NIGRAAN_SIM_START || 0), F = process.env.NIGRAAN_SIM_PIDFILE; if (!S || !F) return Date.now(); return S + (Date.now() - statSync(F).mtimeMs); }
export async function launch() { return T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=900'] }); }
export async function page(br, view, { place = [33.6686, 73.0752, 'Islamabad I-8/3'], w = 1440, h = 900 } = {}) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, geolocation: { latitude: 33.6686, longitude: 73.0752, accuracy: 20 }, permissions: ['geolocation'] });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } else { localStorage.removeItem('agn.operator'); localStorage.removeItem('agn.operator.v2'); } } catch (_) {} }, view === 'operator');
  const off = serverNow() - Date.now();
  await ctx.addInitScript((off) => { const RD = Date; class SD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } } window.Date = SD; }, off);
  const pg = await ctx.newPage(); const errs = [], cons = [];
  pg.on('pageerror', (e) => errs.push(e.message.slice(0, 200))); pg.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 200)); }); pg.on('response', (r) => { if (r.status() >= 400) cons.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 160)); });
  await pg.goto(BASE + '/analyst' + (view === 'operator' ? '?operator=1' : '?operator=0'), { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(20000);
  if (place) { await pg.evaluate((p) => { if (window.driveFromPoint) window.driveFromPoint(p[0], p[1], p[2], true); }, place); await pg.waitForTimeout(8000); }
  return { ctx, pg, errs, cons };
}
export function tally() { let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } }; return { ok, res: () => ({ pass, fail }) }; }
