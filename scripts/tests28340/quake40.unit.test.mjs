/* v91.17.283.40 item 31 (wide pass of the merge rule; base harness copied from tests28331/quake_emsc) · v91.17.283.31 · owner request · the second earthquake source (EMSC) in server/api/quake.mjs, against mocks of both services on 127.0.0.1:
   the EMSC response shape (fdsnws format=json: properties.unid, time, mag, magtype, lat, lon, depth, flynn_region, lastupdate), the merge
   rule (same event: origin within 60 s AND epicentre within 100 km), both sources listed on a merged event, the earliest report as
   "first known at", single-source events kept and labelled, one source down, the status and the /api/sources credit.
   node scripts/tests28331/quake_emsc.unit.test.mjs */
import http from 'node:http'; import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const APP = join(HERE, '..', '..');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 400))); if (!c) f++; };
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const usgsF = (id, ms, lat, lon, mag) => ({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lon, lat, 15] }, properties: { time: ms, updated: ms + 1000, mag, magType: 'mb', place: 'x', status: 'reviewed', type: 'earthquake', types: ',origin,' } });
const emscF = (unid, ms, lat, lon, mag) => ({ type: 'Feature', id: unid, geometry: { type: 'Point', coordinates: [lon, lat, -12] }, properties: { unid, source_id: '1', source_catalog: 'EMSC-RTS', time: iso(ms), lastupdate: iso(ms + 5000), lat, lon, depth: 12, mag, magtype: 'mb', flynn_region: 'PAKISTAN', evtype: 'ke', auth: 'EMSC' } });
const T0 = now - 3 * 3600e3;
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/usgs')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'FeatureCollection', metadata: { generated: now }, features: [
      usgsF('us6000u4y8', T0, 25.8377, 67.9886, 4.3),             /* the 26 Oct 2026 Sann case: EMSC (regional authority) 19.8 s, 136.6 km away */
      usgsF('usA', T0 + 3600e3, 30.0, 67.0, 4.6),                 /* two USGS events 30 s apart ... */
      usgsF('usB', T0 + 3600e3 + 30e3, 31.2, 67.4, 4.5),          /* ... and one EMSC candidate 150 km from both: ambiguous, not merged */
      usgsF('usC', T0 + 7200e3, 33.0, 73.0, 5.1),                 /* ordinary pair (20 s, ~15 km): first pass */
      usgsF('usD', T0 + 9000e3, 34.0, 70.0, 4.4) ] })); }         /* EMSC one 350 km away (beyond the buffer): not merged */
  if (req.url.startsWith('/emsc')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'FeatureCollection', metadata: {}, features: [
      emscF('20261026_0000083', T0 + 19.8e3, 26.849, 68.767, 4.2),
      emscF('20261029_000000A', T0 + 3600e3 + 15e3, 30.6, 68.5, 4.5),
      emscF('20261029_000000C', T0 + 7200e3 + 20e3, 33.1, 73.1, 5.0),
      emscF('20261029_000000D', T0 + 9000e3 + 10e3, 34.0, 73.8, 4.4) ] })); }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port;
const TD = mkdtempSync(join(tmpdir(), 'q40_')); const dataDir = join(TD, 'data'); mkdirSync(dataDir, { recursive: true });
copyFileSync(join(APP, 'data', 'pk-tehsils.json'), join(dataDir, 'pk-tehsils.json'));
const rule = (buf) => JSON.stringify({ version: 'test-q40', magMin: 4, retainDays: 7,
  ipe: { coeffs: { c0: 2.085, c1: 1.428, c2: -1.402, c4: 0.078, m1: -0.209, m2: 2.042 }, validity: { mwMin: 5.0, mwMax: 7.9, distanceKmMax: 300 } },
  levels: [{ level: 'Low', mmiMin: 4, shaking: 'Light' }, { level: 'Moderate', mmiMin: 5, shaking: 'Moderate' }, { level: 'High', mmiMin: 6, shaking: 'Strong' }, { level: 'Severe', mmiMin: 7, shaking: 'Very strong' }],
  region: { pakistanBbox: [60.75, 23.5, 77.9, 37.25], bufferKm: buf }, poll: { feeds: [B + '/usgs/feed'], feedSeconds: 60, revisionSeconds: 3600, timeoutSeconds: 10 } });
writeFileSync(join(dataDir, 'seismic-felt-rule.json'), rule(300));
process.env.NIGRAAN_EMSC_URL = B + '/emsc/query'; process.env.NIGRAAN_USGS_FDSN_URL = B + '/usgs/fdsn'; delete process.env.NIGRAAN_EMSC;
try {
  const { createQuake } = await import(pathToFileURL(join(APP, 'server', 'api', 'quake.mjs')).href);
  const Q = createQuake({}, dataDir, { timers: false });
  await Q.poll(); await Q.pollEmsc();
  const M = Q.merged(); const by = (id) => M.find((e) => e.id === id);
  const s = by('us6000u4y8');
  ok(s && s.source === 'USGS + EMSC' && s.matchWide === true && s.matchKm > 130 && s.matchKm < 140, 'Sann case: one event (wide pass, 137 km), was two', s && { src: s.source, km: s.matchKm, wide: s.matchWide });
  ok(s && s.lat === 25.8377 && s.sources.find((x) => x.source === 'EMSC').lat === 26.849, 'merged event keeps the USGS epicentre, lists the EMSC one', s && s.sources);
  ok(!M.some((e) => e.source === 'EMSC' && e.emscId === '20261026_0000083'), 'no separate EMSC copy of the Sann event');
  ok(by('usA').source === 'USGS' && by('usB').source === 'USGS' && M.some((e) => e.emscId === '20261029_000000A' && e.source === 'EMSC'), 'ambiguous (two USGS candidates): not merged', [by('usA').source, by('usB').source]);
  const c = by('usC'); ok(c.source === 'USGS + EMSC' && !c.matchWide, 'ordinary pair merged by the first pass (no wide flag)', c && { s: c.source, w: c.matchWide });
  ok(by('usD').source === 'USGS' && M.some((e) => e.emscId === '20261029_000000D'), 'beyond the region buffer (~350 km): not merged');
  ok(M.length === 7, 'event count 7 (5 USGS + 2 EMSC-only)', M.length);
  const st = Q.status(); ok(st.mergeRule.wideKm === 300 && st.mergeRule.km === 100, 'status states both radii', st.mergeRule);
  writeFileSync(join(dataDir, 'seismic-felt-rule.json'), rule(100)); await new Promise((r) => setTimeout(r, 30));
  const M2 = Q.merged(); ok(M2.find((e) => e.id === 'us6000u4y8').source === 'USGS', 'buffer <= 100 km: wide pass off (the 283.31 behaviour)');
} finally { srv.close(); rmSync(TD, { recursive: true, force: true }); }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
