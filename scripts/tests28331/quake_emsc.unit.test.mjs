/* v91.17.283.31 · owner request · the second earthquake source (EMSC) in server/api/quake.mjs, against mocks of both services on 127.0.0.1:
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
let usgsDown = false, emscDown = false, emscQuery = null;
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/usgs')) { if (usgsDown) { res.writeHead(503); return res.end('down'); }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'FeatureCollection', metadata: { generated: now }, features: [
      usgsF('us1', T0, 33.0, 73.0, 5.2),                 /* EMSC reports it 40 s later and 30 km away: same event */
      usgsF('us2', T0 + 3600e3, 30.0, 67.0, 4.8),        /* EMSC reports one 120 s apart nearby: different events */
      usgsF('us3', T0 + 7200e3, 35.5, 71.5, 4.6) ] })); }   /* USGS only */
  if (req.url.startsWith('/emsc')) { emscQuery = req.url; if (emscDown) { res.writeHead(503); return res.end('down'); }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'FeatureCollection', metadata: {}, features: [
      emscF('20261029_0000001', T0 + 40e3, 33.2, 73.2, 5.0),
      emscF('20261029_0000002', T0 + 3600e3 + 120e3, 30.05, 67.05, 4.9),
      emscF('20261029_0000003', T0 + 1800e3, 28.0, 64.0, 4.4),   /* EMSC only */
      emscF('20261029_0000004', T0, 50.0, 10.0, 6.0) ] })); }    /* outside the Pakistan box: dropped */
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port;
const TD = mkdtempSync(join(tmpdir(), 'q31_')); const dataDir = join(TD, 'data'); mkdirSync(dataDir, { recursive: true });
copyFileSync(join(APP, 'data', 'pk-tehsils.json'), join(dataDir, 'pk-tehsils.json'));
writeFileSync(join(dataDir, 'seismic-felt-rule.json'), JSON.stringify({ version: 'test-q31', magMin: 4, retainDays: 7,
  ipe: { coeffs: { c0: 2.085, c1: 1.428, c2: -1.402, c4: 0.078, m1: -0.209, m2: 2.042 }, validity: { mwMin: 5.0, mwMax: 7.9, distanceKmMax: 300 } },
  levels: [{ level: 'Low', mmiMin: 4, shaking: 'Light' }, { level: 'Moderate', mmiMin: 5, shaking: 'Moderate' }, { level: 'High', mmiMin: 6, shaking: 'Strong' }, { level: 'Severe', mmiMin: 7, shaking: 'Very strong' }],
  region: { pakistanBbox: [60, 23, 78, 37], bufferKm: 100 }, poll: { feeds: [B + '/usgs/feed'], feedSeconds: 60, revisionSeconds: 3600, timeoutSeconds: 10 } }));
process.env.NIGRAAN_EMSC_URL = B + '/emsc/query'; process.env.NIGRAAN_USGS_FDSN_URL = B + '/usgs/fdsn'; delete process.env.NIGRAAN_EMSC;
try {
  const { createQuake } = await import(pathToFileURL(join(APP, 'server', 'api', 'quake.mjs')).href);
  const Q = createQuake({}, dataDir, { timers: false });
  await Q.poll(); const r = await Q.pollEmsc();
  ok(!r.error, 'the EMSC service is read (format=json)', r);
  ok(/format=json/.test(emscQuery) && /minmagnitude=4/.test(emscQuery) && /minlatitude=/.test(emscQuery), 'asked with the USGS magnitude floor and the buffered Pakistan box', emscQuery);
  const M = Q.merged(); const by = (id) => M.find((e) => e.id === id || (e.sources || []).some((s) => s.id === id));
  const m1 = by('us1');
  ok(m1 && m1.source === 'USGS + EMSC' && m1.sources.length === 2, 'same event (40 s, ~30 km) merged into one, both sources listed', m1 && { s: m1.source, n: m1.sources.length });
  ok(m1 && m1.sources.find((s) => s.source === 'EMSC').mag === 5.0 && m1.sources.find((s) => s.source === 'USGS').mag === 5.2, 'each source keeps its own magnitude and location', m1 && m1.sources);
  ok(m1 && Number.isFinite(m1.firstKnownAt), 'merged event carries first known at', m1);
  const m2 = by('us2'), e2 = M.find((e) => e.source === 'EMSC' && e.emscId === '20261029_0000002');
  ok(m2 && m2.source === 'USGS' && e2, '120 s apart: two events, not merged', { m2: m2 && m2.source, e2: !!e2 });
  ok(by('us3') && by('us3').source === 'USGS', 'a USGS-only event is kept and labelled USGS');
  const e3 = M.find((e) => e.emscId === '20261029_0000003');
  ok(e3 && e3.source === 'EMSC' && Array.isArray(e3.flags), 'an EMSC-only event is kept, labelled EMSC, scored by the equation', e3 && { s: e3.source });
  ok(!M.some((e) => e.emscId === '20261029_0000004'), 'an EMSC event outside the Pakistan box is dropped');
  ok(M.length === 5, 'five events after the merge (3 USGS + 2 EMSC-only)', M.length);
  /* first known at: the earlier of the two sources */
  const usgsSeen = m1.sources.find((s) => s.source === 'USGS').firstSeen, emscSeen = m1.sources.find((s) => s.source === 'EMSC').firstSeen;
  ok(m1.firstKnownAt === Math.min(Date.parse(usgsSeen), Date.parse(emscSeen)), 'first known at = the earliest report of either source', { fk: m1.firstKnownAt, usgsSeen, emscSeen });
  const L = await Q.live();
  ok(L.events.some((e) => e.source === 'USGS + EMSC') && L.events.some((e) => e.source === 'EMSC'), '/api/quake/live serves the merged list with sources', L.events.map((e) => e.source));
  const st = Q.status(); ok(st.emsc && st.emsc.on && st.emsc.lastPollOk && st.emsc.periodSeconds === 60 && st.mergeRule.seconds === 60 && st.mergeRule.km === 100, 'status names EMSC, its period (the USGS feed period) and the merge rule', st.emsc);
  /* one source down */
  emscDown = true; const r2 = await Q.pollEmsc();
  ok(r2.error && Q.status().emsc.lastError, 'EMSC down: the error is recorded', r2);
  ok(Q.merged().filter((e) => e.source !== 'EMSC').length === 3, 'EMSC down: the USGS events are still served', Q.merged().length);
  emscDown = false; usgsDown = true; await Q.poll();
  ok(Q.merged().some((e) => e.source === 'EMSC'), 'USGS down: the EMSC events are still served');
  /* the persisted state carries the EMSC events (a restart keeps them) */
  const Q2 = createQuake({}, dataDir, { timers: false }); ok(Q2.merged().some((e) => e.source === 'EMSC' || e.source === 'USGS + EMSC'), 'a restart keeps the EMSC events (state file)');
  /* the credit line */
  const OF = JSON.parse(readFileSync(join(APP, 'data', 'open-feeds.json'), 'utf8'));
  ok(OF.licence.some((x) => x.id === 'emsc' && /EMSC/.test(x.attribution) && x.customer === true) && OF.licence.some((x) => x.id === 'usgs'), '/api/sources credits EMSC and USGS (data/open-feeds.json)');
} catch (e) { ok(false, 'crashed: ' + (e && e.stack || e)); }
finally { srv.close(); try { rmSync(TD, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
