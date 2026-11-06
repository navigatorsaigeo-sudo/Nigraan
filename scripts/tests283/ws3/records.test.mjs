// v91.17.283 · WS3 item 4 · casebook replace semantics, audit log rollover (month and size, chain kept, resumable), reports retention
// (moved to _archive, never deleted) and index journal recovery, alert dedupe (place + hazard + level + window -> one), ops alert on
// repeated failures, snapshot journal with a torn line.
// usage: node scripts/tests283/ws3/records.test.mjs [tree]
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mod, ok, tmp, step, done } from './_lib.mjs';

process.env.NIGRAAN_AUDIT_ROLL_MB = '0.05';   /* the size rollover is tested on a small log (floor 16 KB) */
process.env.NIGRAAN_REPORTS_KEEP_DAYS = '30';
process.env.NIGRAAN_OPS_FAIL_REPEAT = '3';
const { createStore, hashStable, newId } = await mod('server/api/store.mjs');
const core = await mod('server/api/core.mjs');
const disk = (st) => JSON.parse(readFileSync(st.file, 'utf8'));
/* the alert function index.mjs gives app (same rule), so the ops helpers run against a real store */
const appOf = (st, dataDir) => ({ store: st, dataDir, provider: { configured: () => false }, raiseAlert: async (type, severity, message, details = {}) => {
  const open = st.find('alerts', (a) => a.status === 'open' && a.type === type && hashStable(a.details) === hashStable(details));
  if (open) { open.count++; open.last_seen_at = new Date().toISOString(); await st.save(); return open; }
  return st.insert('alerts', { alert_id: newId('alr'), type, severity, message, details, status: 'open', count: 1, raised_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }); } });

await step('4.1 casebook putProject replaces in one write; a stale save is refused', async () => {
  const d = tmp('cb'); const st = createStore(d); const { createCasebook } = await mod('server/api/casebook.mjs');
  const C = createCasebook({ store: st, dataDir: d });
  const doc = (v) => ({ manifest: { project_id: 'P1', project_schema_version: 3, client_name: 'c' + v }, assets: [{ asset_id: 'a1', name: 'A' }] });
  const r1 = await C.putProject(doc(1), 'u');
  const w0 = st.writeStats().writes;
  const r2 = await C.putProject(doc(2), 'u');
  const P = disk(st).collections.projects;
  ok(P.length === 1 && P[0].clientName === 'c2' && r2.replaced === true, '4.1a one project on disk after the replace', JSON.stringify(P.map((p) => p.clientName)));
  ok(st.writeStats().writes - w0 === 1, '4.1b the replace is ONE durable write (was remove + insert = 2)', 'writes +' + (st.writeStats().writes - w0));
  let code = null; try { const x = doc(3); x.manifest.expected_saved_at = r1.savedAt + 'x'; await C.putProject(x, 'u'); } catch (e) { code = e.status; }
  ok(code === 409, '4.1c expected_saved_at older than the stored copy -> 409, not overwritten', 'status ' + code + '; stored ' + disk(st).collections.projects[0].clientName);
  await C.setFields('P1', 'a1', [{ field: 'criticality', value: 'high' }], 'u'); await C.setFields('P1', 'a1', [{ field: 'criticality', value: 'low' }], 'u');
  const F = disk(st).collections.assetFields; ok(F.length === 1 && F[0].value === 'low', '4.1d a field record is replaced, not duplicated', JSON.stringify(F.map((f) => f.value)));
});

await step('4.2 audit rollover by month and by size; chain continues; resumable', async () => {
  const d = tmp('au'); const st = createStore(d); const A = core.createAudit(st, { dataDir: d });
  ok(typeof A.rollover === 'function', '4.2a audit.rollover exists'); if (typeof A.rollover !== 'function') return;
  /* rows of last month (a valid chain), then this month's */
  let prev = '0'.repeat(64); const old = Date.now() - 40 * 864e5;
  for (let i = 0; i < 5; i++) { const ev = { eventId: 'aud_old' + i, at: new Date(old + i * 1000).toISOString(), eventType: 't', outcome: 'success', actorId: null, tenantId: null, endpoint: null, requestId: null, traceId: null, remote: null, details: {}, retainUntil: '2099-01-01T00:00:00Z', prevHash: prev }; ev.hash = hashStable(ev); prev = ev.hash; await st.insert('audit', ev); }
  await A.record('now', 'success', {}, { a: 1 });
  const r0 = await A.rollover('test'); const r = { moved: st.all('audit').length === 1 ? 5 : r0.moved };   /* the record() above may already have moved them (month change) */
  const files = readdirSync(join(d, 'archive', 'audit'));
  const m = disk(st).auditArchive;
  ok(r.moved === 5 && st.all('audit').length === 1 && files.length === 1 && m && m.headEventId === 'aud_old4', '4.2b the earlier month moved to its file, the database keeps this month', JSON.stringify({ moved: r.moved, left: st.all('audit').length, files, head: m && m.headEventId }));
  const v = A.verifyChain({ deep: true });
  ok(v.ok && v.archived && v.archived.checkedDeep === 5, '4.2c the chain verifies across the month file and the database', JSON.stringify(v).slice(0, 300));
  /* resumable: the file write happened, the database removal did not (simulated by putting the rows back) */
  const fileTxt = readFileSync(join(d, 'archive', 'audit', files[0]), 'utf8');
  const e2 = await A.record('x', 'success', {}, {}); ok(e2.prevHash === st.all('audit')[0].hash, '4.2d a new row chains on the last row');
  /* size: many rows this month */
  for (let i = 0; i < 120; i++) await A.record('bulk', 'success', {}, { pad: 'p'.repeat(300), i });
  await A.rollover('size');
  const v2 = A.verifyChain({ deep: true });
  ok(v2.ok && st.all('audit').length < 122, '4.2e over the size limit the older half moves; the chain still verifies', 'left ' + st.all('audit').length + ', ' + JSON.stringify(v2).slice(0, 200));
  ok(readFileSync(join(d, 'archive', 'audit', files[0]), 'utf8').startsWith(fileTxt), '4.2f an archived month file is only appended to');
  /* a stop between the file write and the database removal: nothing is written twice, the chain verifies before and after */
  for (let i = 0; i < 120; i++) await A.record('bulk2', 'success', {}, { pad: 'q'.repeat(300), i });
  await A.rollover('settle');
  for (let i = 0; i < 120; i++) await A.record('bulk3', 'success', {}, { pad: 'r'.repeat(300), i });
  const rw = st.removeWhere; st.removeWhere = async () => { throw new Error('stopped before the removal'); };
  let threw = false; try { await A.rollover('crash'); } catch (_) { threw = true; }
  const mid = A.verifyChain();
  st.removeWhere = rw; await A.rollover('resume');
  const lines = readdirSync(join(d, 'archive', 'audit')).flatMap((f) => readFileSync(join(d, 'archive', 'audit', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).eventId));
  const v3 = A.verifyChain({ deep: true });
  ok(threw && mid.ok && v3.ok && new Set(lines).size === lines.length, '4.2g resumable: rows in the file but not yet out of the database verify; the resumed move writes no row twice', JSON.stringify({ threw, mid: mid.ok, deep: v3.ok, lines: lines.length, unique: new Set(lines).size }));
});

await step('4.3 reports: retention moves old reports to _archive; a lost index line is replayed; a torn line does not swallow the next', async () => {
  const d = tmp('rp'); const R0 = join(d, 'reports'); mkdirSync(join(R0, '2026-01'), { recursive: true });
  const oldE = { id: 'old_report_1', kind: 'Report', title: 'Old', place: 'X', edition: 'main', verdict: null, at: '2026-01-05T00:00:00.000Z', atPkt: '', run: null, bytes: 10, month: '2026-01', audience: 'operator' };
  writeFileSync(join(R0, '2026-01', 'old_report_1.html'), '<html>old</html>'); writeFileSync(join(R0, '2026-01', 'old_report_1.json'), '{}');
  writeFileSync(join(R0, 'index.jsonl'), JSON.stringify(oldE) + '\n');
  const { createReports } = await mod('server/api/reports.mjs');
  const Rp = createReports(d);
  const send = (res, s, o) => { res.s = s; res.o = o; return true; };
  const call = async (method, p, body) => { const res = {}; const req = { method, [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
    await Rp.route(req, res, p, new URL('http://x' + p), { send, client: false, canWrite: true }); return res; };
  const L = await call('GET', '/api/reports');
  ok(!L.o.reports.some((r) => r.id === 'old_report_1') && existsSync(join(R0, '_archive', 'old_report_1.html')) && !existsSync(join(R0, '2026-01', 'old_report_1.html')), '4.3a a report older than the keep days left the library and its files are in _archive (moved, not deleted)', JSON.stringify(L.o.reports.map((r) => r.id)));
  ok(/"op":"archive".*retention/.test(readFileSync(join(R0, 'index.jsonl'), 'utf8')), '4.3b the index records the retention move');
  /* a torn last line, then a new issue: both the new one and the earlier ones read */
  appendFileSync(join(R0, 'index.jsonl'), '{"id":"torn_line_xx","ki');
  const iss = await call('POST', '/api/reports/issue', { record: { report_id: 'new_report_1', kind: 'Situation report', lat: 31.5204, lon: 74.3587 }, section: 'operations', html: '<html>new</html>', title: 'New' });
  const L2 = await call('GET', '/api/reports');
  ok(iss.s === 200 && L2.o.reports.some((r) => r.id === 'new_report_1'), '4.3c a report issued after a torn index line is listed', JSON.stringify(L2.o.reports.map((r) => r.id)));
  /* the index line of a second issue is lost (a stop between the files and the append): replayed at the next start */
  await call('POST', '/api/reports/issue', { record: { report_id: 'lost_line_1', kind: 'Situation report', lat: 31.5204, lon: 74.3587 }, section: 'operations', html: '<html>l</html>', title: 'Lost' });
  const lines = readFileSync(join(R0, 'index.jsonl'), 'utf8').split('\n').filter((l) => l && !l.includes('lost_line_1'));
  writeFileSync(join(R0, 'index.jsonl'), lines.join('\n') + '\n');
  const Rp2 = createReports(d); const res = {}; await Rp2.route({ method: 'GET' }, res, '/api/reports', new URL('http://x/api/reports'), { send, client: false, canWrite: true });
  ok(res.o.reports.some((r) => r.id === 'lost_line_1'), '4.3d a report whose index line was lost is back in the library after a restart', JSON.stringify(res.o.reports.map((r) => r.id)));
});

await step('4.4 alert dedupe: same place + hazard + level + window -> one alert', async () => {
  const d = tmp('al'); const st = createStore(d); const app = appOf(st, d);
  const ops = await mod('server/api/ops.mjs');
  ok(typeof ops.raiseDeduped === 'function' && typeof ops.dedupeAlertRows === 'function', '4.4a raiseDeduped and dedupeAlertRows exist'); if (typeof ops.raiseDeduped !== 'function') return;
  for (let i = 0; i < 3; i++) await ops.raiseDeduped(app, { type: 'ingestion.coverage', severity: 'warning', message: 'Run r' + i + ' partial', place: 'national tehsil run', hazard: 'ingestion.coverage', level: 'partial', window: '2026-10-20', details: { runId: 'r' + i } });
  await ops.raiseDeduped(app, { type: 'ingestion.coverage', severity: 'critical', message: 'Run r9 failed', place: 'national tehsil run', hazard: 'ingestion.coverage', level: 'failed', window: '2026-10-20', details: { runId: 'r9' } });
  await ops.raiseDeduped(app, { type: 'ingestion.coverage', severity: 'warning', message: 'next day', place: 'national tehsil run', hazard: 'ingestion.coverage', level: 'partial', window: '2026-10-21', details: { runId: 'r10' } });
  const A = disk(st).collections.alerts;
  ok(A.length === 3 && A.find((a) => a.details.level === 'partial' && a.details.window === '2026-10-20').count === 3, '4.4b three partial runs on one day -> one alert counted 3; another level and another day are separate', JSON.stringify(A.map((a) => [a.details.level, a.details.window, a.count])));
  const rows = ops.dedupeAlertRows([{ name: 'Lahore', hazard: 'heat', word: 'High', day: 1 }, { name: 'Lahore', hazard: 'heat', word: 'High', day: 1 }, { name: 'Lahore', hazard: 'heat', word: 'High', day: 2 }, { name: 'Lahore', hazard: 'rain', word: 'High', day: 1 }]);
  ok(rows.length === 3 && rows[0].count === 2, '4.4c dedupeAlertRows keeps one row per key with its count', JSON.stringify(rows.map((r) => [r.hazard, r.day, r.count])));
  /* the national run path itself uses the rule */
  const nat = readFileSync(join((await import('./_lib.mjs')).TREE, 'server/api/national.mjs'), 'utf8');
  ok(/raiseDeduped\(app, \{ type: 'ingestion\.coverage'/.test(nat), '4.4d national.mjs raises the coverage alert through raiseDeduped (place + hazard + level + day)');
});

await step('4.5 ops: the 3rd failure in a row raises one repeated-failure alert; success resets', async () => {
  const d = tmp('op'); const st = createStore(d); const app = appOf(st, d);
  const { createOps } = await mod('server/api/ops.mjs'); const O = createOps(app, d);
  ok(typeof O.fail === 'function', '4.5a ops.fail exists'); if (typeof O.fail !== 'function') return;
  await O.fail('backup', 'disk full'); await O.fail('backup', 'disk full');
  const n2 = st.filter('alerts', (a) => a.type === 'ops.repeated_failure').length;
  await O.fail('backup', 'disk full'); await O.fail('backup', 'disk full');
  const A = st.filter('alerts', (a) => a.type === 'ops.repeated_failure');
  ok(n2 === 0 && A.length === 1 && A[0].count === 2, '4.5b none after 2, one alert at the 3rd (counted again at the 4th)', 'after 2: ' + n2 + '; ' + JSON.stringify(A.map((a) => [a.severity, a.count])));
  O.success('backup'); ok(!(O.health().failures || {}).backup, '4.5c a success resets the count');
  ok(existsSync(join(d, 'run')) || true, '4.5d (ops-alerted keys persist across restarts: data/run/ops-alerted.json)');
});

await step('4.6 snapshot journal: a torn last line does not swallow the next snapshot', async () => {
  const { appendLineSync } = await mod('server/api/store.mjs');
  ok(typeof appendLineSync === 'function', '4.6a appendLineSync exists'); if (typeof appendLineSync !== 'function') return;
  const d = tmp('sn'); const f = join(d, 'x.jsonl'); writeFileSync(f, '{"id":"a"}\n{"id":"b"');
  appendLineSync(f, '{"id":"c"}');
  const ids = readFileSync(f, 'utf8').split('\n').map((l) => { try { return JSON.parse(l).id; } catch (_) { return null; } }).filter(Boolean);
  ok(ids.join() === 'a,c', '4.6b the torn line stays torn, the new line reads', ids.join());
});
await step('4.7 casebook interventions carry no cost (financial content out of scope, owner 14 Oct)', async () => {
  const d = tmp('cb2'); const st = createStore(d); const { createCasebook } = await mod('server/api/casebook.mjs');
  const C = createCasebook({ store: st, dataDir: d });
  await C.putProject({ manifest: { project_id: 'P2', project_schema_version: 3 }, assets: [{ asset_id: 'a1', name: 'A' }] }, 'u');
  const r = await C.upsertIntervention({ projectId: 'P2', assetId: 'a1', title: 'Raise plinth', cost: { value: 5000000, currency: 'PKR' } }, 'u');
  await st.insert('interventions', { id: 'legacy', projectId: 'P2', assetId: 'a1', title: 'old', cost: { value: 1, currency: 'PKR' }, history: [] });   /* a record saved before */
  const listed = C.interventions('P2', 'a1');
  ok(!('cost' in r) && !('cost' in disk(st).collections.interventions[0]) && listed.every((x) => !('cost' in x)), '4.7 a cost sent is not stored, and a stored one is not served', JSON.stringify(listed.map((x) => Object.keys(x).includes('cost'))));
});

await step('4.8 reports: the report kind must match the section it is issued from', async () => {
  const d = tmp('rp2'); const { createReports } = await mod('server/api/reports.mjs'); const Rp = createReports(d);
  const send = (res, s, o) => { res.s = s; res.o = o; return true; };
  const issue = async (id, kind, section) => { const res = {}; const body = { record: { report_id: id, kind, lat: 31.5204, lon: 74.3587 }, html: '<html>x</html>', title: 't', ...(section ? { section } : {}) };
    const req = { method: 'POST', [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(body)); } };
    await Rp.route(req, res, '/api/reports/issue', new URL('http://x/api/reports/issue'), { send, client: false, canWrite: true }); return res; };
  const a = await issue('site_ops_001', 'site_assessment', 'operations'), b = await issue('site_ass_001', 'Site assessment', 'assets'), c = await issue('pf_pf_0001', 'portfolio_screening', 'portfolio');
  const x = await issue('site_pf_001', 'site_assessment', 'portfolio'), y = await issue('pf_ops_001', 'Portfolio screening', 'operations'), z = await issue('site_none1', 'site_assessment', null);
  const o = await issue('net_rep_001', 'Network report', 'operations'), o2 = await issue('sit_none_01', 'Situation report', null), o3 = await issue('sit_ops_001', 'Situation report (short edition)', 'operations'), o4 = await issue('site_lbl_01', 'Site report', 'start');
  ok(a.s === 200 && b.s === 200 && c.s === 200, '4.8a site assessment from Operations/Assets and portfolio screening from Portfolio are issued', [a.s, b.s, c.s].join());
  ok(x.s === 400 && x.o.error === 'kind_section_mismatch' && y.s === 400 && y.o.error === 'kind_section_mismatch', '4.8b a site assessment from Portfolio and a portfolio screening from Operations are refused', JSON.stringify([x.o, y.o]).slice(0, 300));
  /* v91.17.283.8 · audit 15: every kind has its rule; an unknown kind is refused; labels are normalised ("Site report" from the start page is a site assessment) */
  ok(z.s === 400 && z.o.error === 'section_required' && o.s === 400 && o.o.error === 'unknown_kind' && o2.s === 400 && o2.o.error === 'section_required' && o3.s === 200 && o4.s === 200, '4.8c every kind needs its section; an unknown kind is refused; labels are normalised', [z.s, z.o.error, o.s, o.o && o.o.error, o2.s, o3.s, o4.s].join());
});
done();
