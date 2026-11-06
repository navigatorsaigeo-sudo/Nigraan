// audit 15 · section rules for EVERY report kind; kind names normalised ("Site report" -> site_assessment); an unknown kind refused;
// the console sends section (and kind) with the context request and records the section on the report it issues.
import { imp, src, ok, done } from './lib.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const RP = await imp('server/api/report.mjs'); const { createReports } = await imp('server/api/reports.mjs');
const N = RP.normaliseKind || (() => null);
ok(N('Site report') === 'site_assessment' && N('Site climate screening') === 'site_assessment' && N('Portfolio prioritisation') === 'portfolio_screening' && N('Situation report (short edition)') === 'situation_report' && N('72-hour operational readiness brief') === 'readiness_72h' && N('Methodology and assurance pack') === 'assurance_pack' && N('Executive climate risk brief') === 'executive_brief',
  'every kind the console and the start page send normalises to a rule');
ok(Object.values(RP.REPORT_KINDS).length >= 6 && Object.values(RP.REPORT_KINDS).every((k) => Array.isArray(k.sections) && k.sections.length), 'every kind has its sections');
const d = mkdtempSync(join(tmpdir(), 'rk-')); const R = createReports(d);
const send = (res, s, o) => { res.s = s; res.o = o; return true; };
const issue = async (id, kind, section) => { const res = {}; const body = { record: { report_id: id, kind, lat: 31.5204, lon: 74.3587 /* v283.28 S9 */ }, html: '<html>x</html>', title: 't', ...(section ? { section } : {}) };
  const req = { method: 'POST', [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(body)); } };
  await R.route(req, res, '/api/reports/issue', new URL('http://x/api/reports/issue'), { send, client: false, canWrite: true }); return res; };
const a = await issue('site_lbl_001', 'Site report', 'start'), b = await issue('sit_none_001', 'Situation report', null), c = await issue('sit_pf_0001', 'Situation report', 'portfolio'), e = await issue('odd_kind_001', 'Network report', 'operations'), f = await issue('ass_rep_0001', 'Methodology and assurance pack', 'reports');
ok(a.s === 200, '"Site report" from the start page is a site assessment and is issued', JSON.stringify(a.o));
ok(b.s === 400 && b.o.error === 'section_required' && c.s === 400 && c.o.error === 'kind_section_mismatch', 'a situation report needs its section and is refused from Portfolio (v283.7: issued unchecked)', JSON.stringify([b.o, c.o]).slice(0, 300));
ok(e.s === 400 && e.o.error === 'unknown_kind' && f.s === 200, 'an unknown kind is refused; the assurance pack from Reports is issued', JSON.stringify([e.o, f.s]));
rmSync(d, { recursive: true, force: true });
const K = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
ok(/'&section='\+encodeURIComponent\(sec\)\+\(KIND_KEY\[kind\]\?'&kind='/.test(K) && /o\.record\.section=sec/.test(K) && /section:\(r\.record&&\(r\.record\.section/.test(K), 'console: kind= and section= on the context request; the section on the record and in the issue body');
ok(/edition:'main', verdict:rec\.verdict, section:'start'/.test(src('build/start/start.src.html')), 'start page: the site report is issued with section "start"');
done('A15-REPORT-KINDS');
