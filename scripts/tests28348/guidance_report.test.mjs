// v91.17.283.48 · AC10 on the issue path: an issued site report gets the server-written "What to do" section after the decision values,
// and <id>.guidance.json records the library version and item ids; with GUIDANCE_PANEL off the issued report is exactly as before.
// No server: reports.mjs createReports with a stub app (complete place record, the guidance selection from the real library).
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { createReports } = await imp('server/api/reports.mjs'); const G = await imp('server/api/guidance.mjs');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 500) : '')); } };
const L = G.loadLibrary(join(ROOT, 'data'));
const sel = (view) => { const o = G.selectGuidance(L, { province: 'punjab', district: 'Lahore', audience: 'business', view, hazards: { flood: { level: { word: 'High', i: 3 }, applicability: { state: 'value' } }, heat: { level: { word: 'Low', i: 1 }, applicability: { state: 'value' } }, landslide: { level: { word: null, state: 'not_applicable' }, applicability: { state: 'not_applicable', text: 'cannot happen here' } }, glof: { level: { word: null }, applicability: { state: 'not_applicable', text: 'cannot happen here' } } }, facts: {} });
  o.place = { tehsil: 'Lahore City', district: 'Lahore', province: 'Punjab' }; return o; };
const app = { report: { placeFor: async (q) => ({ complete: true, lat: q.lat, lon: q.lon, unitId: 'Punjab|Lahore|Lahore City', record: { checksum: 'abc', values: {} }, siteLevels: { hazards: {} } }) },
  guidance: { forPlace: async (q, o) => sel(o.view) } };
const send = (res, s, o) => { res.s = s; res.o = o; return true; };
async function issue(R, id) { const res = {}; const body = { record: { report_id: id, kind: 'Site report', lat: 31.5204, lon: 74.3587, recordChecksum: 'abc' }, html: '<html><body><h1>Site</h1></body></html>', title: 't', section: 'operations' };
  const req = { method: 'POST', [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(body)); } };
  await R.route(req, res, '/api/reports/issue', new URL('http://x/api/reports/issue'), { send, client: true, canWrite: true }); return res; }
const find = (d0, id, ext) => { const d = join(d0, 'reports'); if (!existsSync(d)) return null; for (const m of readdirSync(d)) { const p = join(d, m, id + ext); if (existsSync(p)) return p; } return null; };
const prev = process.env.GUIDANCE_PANEL;
try {
  const d1 = mkdtempSync(join(tmpdir(), 'g48-')); process.env.GUIDANCE_PANEL = '1';
  const r1 = await issue(createReports(d1, app), 'site_g48_on1'); const h1 = find(d1, 'site_g48_on1', '.html'), j1 = find(d1, 'site_g48_on1', '.guidance.json');
  const html = h1 ? readFileSync(h1, 'utf8') : '', gj = j1 ? JSON.parse(readFileSync(j1, 'utf8')) : null, exp = sel('customer');
  ok(r1.s === 200 && /data-agn-decision="server"/.test(html) && html.indexOf('data-agn-guidance') > html.indexOf('data-agn-decision') && html.indexOf('data-agn-guidance') < html.indexOf('<h1>Site'), 'flag ON: the issued site report holds the "What to do" section right after the decision values', r1.s + ' ' + JSON.stringify(r1.o));
  ok(exp.provenance.itemIds.filter((i) => /^flood-business-/.test(i)).every((i) => html.includes(i)) && /River flooding|not relevant here/.test(html) && html.includes('library 1.0.0'), 'the section lists every selected action with its id, the "not relevant" lines and the library version');
  ok(gj && gj.places[0].provenance.libraryVersion === '1.0.0' && JSON.stringify(gj.places[0].provenance.itemIds) === JSON.stringify(exp.provenance.itemIds), 'AC10 <id>.guidance.json records the library version and the item ids of the section', JSON.stringify(gj).slice(0, 300));
  ok(!html.includes('pbfp-rule') && !html.includes('ndm-rule'), 'a customer-issued report carries only customer-visible items');
  rmSync(d1, { recursive: true, force: true });
  const d2 = mkdtempSync(join(tmpdir(), 'g48-')); delete process.env.GUIDANCE_PANEL;
  const r2 = await issue(createReports(d2, app), 'site_g48_off1'); const h2 = find(d2, 'site_g48_off1', '.html');
  const { bindDecision } = await imp('server/api/reports.mjs');
  ok(r2.s === 200 && h2 && readFileSync(h2, 'utf8') === bindDecision('<html><body><h1>Site</h1></body></html>', [{ lat: 31.5204, lon: 74.3587, unitId: 'Punjab|Lahore|Lahore City', checksum: 'abc', record: { checksum: 'abc', values: {} }, siteLevels: { hazards: {} } }]) && !find(d2, 'site_g48_off1', '.guidance.json'),
    'flag OFF: the issued report is byte for byte the decision-bound report of before; no guidance file');
  rmSync(d2, { recursive: true, force: true });
} finally { if (prev == null) delete process.env.GUIDANCE_PANEL; else process.env.GUIDANCE_PANEL = prev; }
console.log(`\nGUIDANCE-REPORT ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
