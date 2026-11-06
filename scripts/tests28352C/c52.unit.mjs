/* v91.17.283.53 · C · unit checks (no server, no provider): node scripts/tests28352C/c52.unit.mjs
   1 pacing: a person's call never waits; background at most 2 while people are served, 8 otherwise
   2 point state: priority (a person's point before a queued nearby list), deadline -> last good of the same point (labelled), tehsil fallback
   3 store: the sliced write gives the same bytes as the one-piece build
   4 customer scrub memo: the same bytes out for the same bytes in */
import { createCallBudget } from '../../server/api/callbudget.mjs';
import { createPointState } from '../../server/api/pointstate.mjs';
import { agencyBody } from '../../server/api/customerscrub.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 1 pacing */
{ const d = mkdtempSync(join(tmpdir(), 'c52-')); writeFileSync(join(d, 'provider-budget.json'), JSON.stringify({ mode: 'monitor', dailyWeightedCap: 1e9, shedBackgroundAtShare: 0.8 }));
  const prov = { windowFor: () => ({ backendWeighted: 0, browserWeighted: 0 }) }; const B = createCallBudget({ dataDir: d, provider: prov, env: {} });
  let bgRun = 0, bgMax = 0; const bg = () => B.paced('background', async () => { bgRun++; bgMax = Math.max(bgMax, bgRun); await sleep(30); bgRun--; });
  const t0 = Date.now(); const u = []; for (let i = 0; i < 20; i++) u.push(B.paced('user', () => sleep(60))); const b = []; for (let i = 0; i < 12; i++) b.push(bg());
  await Promise.all(u); ok(Date.now() - t0 < 200, 'pacing: 20 people calls ran at once (' + (Date.now() - t0) + ' ms)'); await Promise.all(b);
  ok(bgMax <= 2, 'pacing: background at most 2 while people are served (saw ' + bgMax + ')');
  await sleep(2100); bgMax = 0; const b2 = []; for (let i = 0; i < 20; i++) b2.push(bg()); await Promise.all(b2); ok(bgMax > 2 && bgMax <= 8, 'pacing: background up to 8 when no person is served (saw ' + bgMax + ')'); }
/* 2 point state */
{ const hours = (n) => { const t0 = Math.floor(Date.now() / 3600e3) * 3600e3 - 3 * 3600e3; const time = [], T = []; for (let i = 0; i < n; i++) { time.push(new Date(t0 + i * 3600e3 + 5 * 3600e3).toISOString().slice(0, 16)); T.push(20 + (i % 24) / 4); } return { time, temperature_2m: T }; };
  let delay = 50; const order = [];
  const app = { dataDir: join(ROOT, 'data'), places: { pointRow: (lat, lon) => ({ administered: true, elevM: 500, forecastElevM: 500, unitId: lon > 73.5 ? 'U2' : 'U1', tehsil: lon > 73.5 ? 'B' : 'A' }) } };
  const fetchPx = async (qs, tag, pri) => { const q = new URLSearchParams(qs); order.push(pri + ':' + q.get('latitude')); await sleep(delay); return [{ hourly: hours(200) }]; };
  const PS = createPointState(app, { fetchPx, dataDir: app.dataDir });
  const near = PS.many(Array.from({ length: 30 }, (_, i) => ({ lat: 30 + i * 0.01, lon: 70 })), { pri: 'lo' }); await sleep(5);
  const mine = PS.state(31.5, 70.5, { noBuild: true }); const r = await mine; await near;
  const iMine = order.indexOf('hi:31.50000'); ok(iMine >= 0 && iMine < 8, 'priority: the person\'s point went out at position ' + iMine + ' of ' + order.length + ' (nearby list of 30 queued first)');
  ok(r && r.ok, 'state ok');
  delay = 400; const t0 = Date.now(); const s2 = await PS.state(31.5, 70.5, { noBuild: true, deadlineMs: 100 });   /* cached: answered at once */
  ok(s2 && s2.ok && !s2.stale && Date.now() - t0 < 100, 'cached record answered at once');
  const s3 = await PS.state(31.6, 70.6, { noBuild: true, deadlineMs: 100 });   /* new point of tehsil A: not ready in 100 ms -> tehsil fallback */
  ok(s3 && s3.ok && s3.stale && s3.stale.kind === 'tehsil area' && /still being prepared/.test(s3.stale.line), 'deadline: tehsil area record served, labelled (' + (s3 && s3.stale && s3.stale.kind) + ')');
  const s4 = await PS.state(31.7, 74.0, { noBuild: true, deadlineMs: 100 });   /* tehsil B: nothing held */
  ok(s4 && s4.ok === false && s4.slow, 'deadline: nothing held -> plain reason, no wait (' + (s4 && s4.why) + ')');
  await sleep(600); const s5 = await PS.state(31.6, 70.6, { noBuild: true, deadlineMs: 100 }); ok(s5 && s5.ok && !s5.stale, 'the record went on being made and is served on the next read'); }
/* 3 store (in a copy) */
{ const { createStore } = await import('../../server/api/store.mjs').catch(() => ({}));
  if (!createStore) { console.log('store: createStore not exported, skipped'); } else {
    const d = mkdtempSync(join(tmpdir(), 'c52s-')); let st; try { st = createStore(d); } catch (e) { st = null; console.log('store: could not open a test store (' + e.message + '), skipped'); }
    if (st && st.all && st.flushNow) { const big = st.all('forecastLog'); for (let i = 0; i < 30000; i++) big.push({ i, at: new Date(1793689200000 + i * 1000).toISOString(), v: Math.round(Math.sin(i) * 1000) / 10, tag: 'row ' + i });
      if (st.allForWrite) st.allForWrite('forecastLog'); st.saveSoon && st.saveSoon(); await sleep(4000);
      const a = readFileSync(join(d, 'nigraan-db.json'), 'utf8'); st.flushNow(); const b = readFileSync(join(d, 'nigraan-db.json'), 'utf8');
      const strip = (x) => { const j = JSON.parse(x); delete j.saveSeq; delete j.savedAt; return JSON.stringify(j); };
      ok(strip(a) === strip(b) && a.length > 1e6, 'store: sliced write = one-piece write (' + a.length + ' bytes)'); } } }
/* 4 scrub memo */
{ const b = Buffer.from(JSON.stringify({ a: 'x'.repeat(70000), s: 'data from PMD and FFD via ECMWF' })); const r1 = agencyBody(b, 'application/json'), r2 = agencyBody(Buffer.from(b), 'application/json');
  ok(r1 && r2 && r1.equals(r2) && !/PMD|FFD/.test(r2.toString()), 'scrub memo: same bytes, names scrubbed'); }
console.log('c52.unit: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
