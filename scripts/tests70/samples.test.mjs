import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.70 · Sprint 1 · "Load sample" completeness and the upload templates (ten since v91.17.266) (s70/CHANGES_samples.md).
   Runs against the local server after the integrator restarts it:  node nigraan-local/scripts/tests70/samples.test.mjs
   Prints PASS/FAIL lines and exits 1 on any FAIL. Drives the served page in Chromium (Playwright) the way a customer does:
   every sample entry point, then the sections that record evidence, then the template panel. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import fs from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const URL0 = BASE + '/analyst?backend=' + encodeURIComponent(BASE + '/px') + '&integration=auto';
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); } };
const done = () => { console.log('\n' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0); };

const chromium = __T.playwrightSync().chromium;   /* v283 WS7: a missing Playwright or browser SKIPs at launch (was a FAIL) */
const exe = process.env.PLAYWRIGHT_CHROMIUM || __agnChrome(__T.chromiumPath());
const browser = await __T.launch(chromium, fs.existsSync(exe) ? { executablePath: exe } : {});
/* NIGRAAN_TEST_HTML=<file> serves a locally patched page in place of the server's (pre-restart checking only) */
const LOCAL = process.env.NIGRAAN_TEST_HTML ? fs.readFileSync(process.env.NIGRAAN_TEST_HTML) : null;

const WARN = /not fully attributable|incomplete envelope|was not recorded as evidence: no asset|evidence not stored/;
async function fresh() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const warns = [], errs = [];
  p.on('console', m => { const t = m.text(); if (WARN.test(t)) warns.push(t.slice(0, 260)); });
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  if (LOCAL) await p.route(u => { const x = new URL(u); return x.pathname === '/' && x.search.indexOf('backend=') >= 0; }, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: LOCAL }));
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.AGN && AGN.journey && AGN.decisionCase && AGN.decisionCase.completeSubject && AGN.templateRegistry && document.getElementById('asmtLoadSample'), null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(12000);
  /* a cold page screens before any sample exists and says so ("no asset is selected"); wait until it has finished
     saying so, so that what is counted after a loader is what the loader caused */
  for (let i = 0; i < 12; i++) { const n = warns.length; await p.waitForTimeout(3000); if (warns.length === n) break; }
  return { p, warns, errs };
}
const sig = p => p.evaluate(() => { const s = AGN.decisionCase.signature() || {}; return { client: s.client_name, asset: s.asset_id, hazard: s.hazard_id, horizon: s.horizon_id, lead: s.lead_hours, id: AGN.decisionCase.id() }; });
const complete = s => !!(s && s.client && s.asset && s.hazard && s.horizon && s.id);

/* the sections that record governed evidence, run through their own controls */
async function runSections(p) {
  const r = {};
  /* screening follows the active asset */
  await p.evaluate(() => { AGN.journey.go('assessments'); try { if (typeof runAssessment === 'function') runAssessment(); } catch (_) {} });
  await p.waitForTimeout(4000);
  /* CMIP6: the live panel when the provider answers; otherwise the same record through the event the panel emits */
  await p.evaluate(() => { const b = document.getElementById('agnV91CmipLoad'); if (b) b.click(); else if (window.AGN && AGN.cmip6) AGN.cmip6.run({ status: document.createElement('div'), rows: document.createElement('tbody') }); });   /* v91.17.277 · the hidden #cmip6Card form is gone; the Forecast card runs the engine */
  let ran = false;
  for (let i = 0; i < 35 && !ran; i++) { await p.waitForTimeout(1000); ran = await p.evaluate(() => !!window.AGN_CMIP6_LAST); }
  if (!ran) await p.evaluate(() => document.dispatchEvent(new CustomEvent('agn:cmip6', { detail: { calculation_id: 'AGN-CMIP6-TEST', created_at: new Date().toISOString(), baseline: '1991-2010', future_window: { start: 2041, end: 2060 }, models_requested: ['T'], temperature_delta_c: { mean: 1.8 }, precipitation_delta_percent: { mean: 6 } } })));
  r.cmip6Live = ran;
  await p.waitForTimeout(1200);
  await p.evaluate(() => { AGN.journey.go('hybridlab'); const b = document.getElementById('cfeRunSweep'); if (b) b.click(); });
  await p.waitForTimeout(4000);
  /* v91.17.78 · the 07 example buttons load nothing into a project any more (s78/CHANGES_cleanup2.md): the test types its own,
     labelled inputs through the form controls, as a customer would */
  const fill = (vals) => p.evaluate((vals) => { for (const [id, v] of vals) { const e = document.getElementById(id); if (!e) continue;
      if (e.tagName === 'SELECT') { const o = [...e.options].find(o => o.value === v || o.textContent.trim().toLowerCase() === String(v).toLowerCase()); if (o) e.value = o.value; } else e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } }, vals);
  /* v91.17.266 · the Financial and Sustainability tabs (financial, financial Monte Carlo, GHG, management records) left NIGRAAN
     (owner decision); the sections that remain record screening, CMIP6, scenario and AI evidence */
  await p.evaluate(() => AGN.aiRecord('What does the recorded evidence support?', { text: 'test answer', sources: ['test'] }, 'deterministic', null));
  await p.waitForTimeout(800);
  await p.evaluate(() => { AGN.journey.go('report'); document.getElementById('asmtGenerateReport').click(); });   /* v91.17.266 · Report has its own tab */
  await p.waitForTimeout(2500);
  r.stores = await p.evaluate(() => { const pr = AGN.project.state(), o = {}; AGN.decisionCase.stores().forEach(d => { const rows = pr[d.store] || []; o[d.store] = { n: rows.length, incomplete: rows.filter(x => x && x.envelope_incomplete && x.envelope_incomplete.length).length }; }); return o; });
  r.toast = await p.evaluate(() => [...document.querySelectorAll('div,span,p')].filter(e => e.children.length === 0 && /not fully attributable/.test(e.textContent)).length);
  return r;
}

/* [name, view to open first, the press itself, run every section after it] - the view is opened and allowed to settle
   before the press, so what is counted is what the press caused, not what opening the view did on an empty session */
const LOADERS = [
  /* v91.17.252 · A1 · one sample client, one button (#asmtLoadSample in the Assets kit bar); the Demo Case button is gone */
  ['Load sample client (Assets, the one sample)', 'assessments', () => document.getElementById('asmtLoadSample').click(), true],
  /* v91.17.266 · Operations reads the sites and limits from Assets: its own intake (#assetLoadSample) is gone */
  ['Load sample (Professional Data Contracts panel)', 'assessments', () => document.getElementById('agnV9116Sample').click(), false]
];

for (const [name, view, press, full] of LOADERS) {
  const { p, warns, errs } = await fresh();
  await p.evaluate(v => AGN.journey.go(v), view);
  for (let i = 0; i < 8; i++) { const n = warns.length; await p.waitForTimeout(2500); if (warns.length === n) break; }
  warns.length = 0;
  try { await p.evaluate(press); } catch (e) { ok(false, name + ' · the control exists and can be pressed', e.message); await p.close(); continue; }
  await p.waitForTimeout(5000);
  const s = await sig(p);
  ok(complete(s), name + ' · leaves a complete decision subject (client, asset, hazard, decision time, case id)', JSON.stringify(s));
  const afterLoad = warns.splice(0);
  ok(afterLoad.length === 0, name + ' · no attribution warning or refused screening after loading', afterLoad.slice(0, 2).join(' || '));
  if (full) {
    const r = await runSections(p);
    const inc = Object.entries(r.stores).filter(([, v]) => v.incomplete).map(([k, v]) => k + ':' + v.incomplete);
    ok(warns.length === 0 && r.toast === 0, name + ' · screening, CMIP6' + (r.cmip6Live ? '' : ' (event path)') + ', scenario, AI and report raise no attribution warning', warns.slice(0, 2).join(' || '));
    ok(inc.length === 0, name + ' · every stored record carries a complete envelope', inc.join(', '));
    ok(r.stores.climate_evidence.n >= 1 && r.stores.scenario.n >= 1 && r.stores.ai_decisions.n >= 1 && r.stores.hazard_evidence.n >= 1,
       name + ' · the sections actually recorded (climate, scenario, AI, screening)', JSON.stringify(r.stores));
    ok(!['financial', 'financial_uncertainty', 'management', 'sustainability'].some(k => k in r.stores), name + ' · no financial, management or sustainability store is offered (v91.17.266)', Object.keys(r.stores).join(','));
  } else {
    /* the two records the CEO's screenshot came from */
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('agn:cmip6', { detail: { calculation_id: 'AGN-CMIP6-TEST', created_at: new Date().toISOString(), baseline: '1991-2010', future_window: { start: 2041, end: 2060 }, models_requested: ['T'] } })));
    await p.evaluate(() => { AGN.journey.go('hybridlab'); const b = document.getElementById('cfeRunSweep'); if (b) b.click(); });
    await p.waitForTimeout(4000);
    const last = await p.evaluate(() => { const pr = AGN.project.state(); const L = k => { const a = pr[k] || []; return a.length ? (a[a.length - 1].envelope_incomplete || null) : 'none'; }; return { climate: L('climate_evidence'), scenario: L('scenario') }; });
    ok(warns.length === 0 && last.climate === null && last.scenario === null, name + ' · a CMIP6 record and a scenario sweep after loading are fully attributable', JSON.stringify(last) + ' ' + warns.slice(0, 1).join(''));
  }
  if (/sample client/.test(name)) {
    const c = await p.evaluate(() => (AGN.project.state().company || {}).client_name || '');
    /* v91.17.283.51 (1.0.10.2, owner 3 Nov) · the sample is "Sample sites (example)": no client name, no DEMONSTRATION wording */
    ok(!/Ravi Textile|AJG|DEMONSTRATION/i.test(c) && /^Sample sites \(example\)/.test(c), name + ' · named "Sample sites (example)" (no client name)', c);
  }
  ok(errs.length === 0, name + ' · no page errors', errs.slice(0, 2).join(' | '));
  await p.close();
}

/* v91.17.266 · the 07 Financial worked example left with the Financial tab (owner decision): its check is retired */

/* ── the attribution check itself: passes when the fields exist, names the gap when one does not ─────────────────── */
{
  const { p } = await fresh();
  const r = await p.evaluate(() => {
    document.getElementById('asmtLoadSample').click();
    const good = AGN.decisionCase.write('climate_evidence', { kind: 'cmip6_delta', source: 'test · all dimensions present', created_at: new Date().toISOString() });
    const keep = AGN.project.state().company.active_asset_id;
    AGN.project.setActiveAsset(null);
    const bad = AGN.decisionCase.write('climate_evidence', { kind: 'cmip6_delta', source: 'test · no asset', created_at: new Date().toISOString() });
    const toast = [...document.querySelectorAll('div,span,p')].filter(e => e.children.length === 0 && /not fully attributable/.test(e.textContent)).map(e => e.textContent)[0] || '';
    AGN.project.setActiveAsset(keep);
    return { good: good && good.envelope_incomplete, goodId: good && good.decision_case_id, bad: bad && bad.envelope_incomplete, toast };
  });
  ok(r.good == null && !!r.goodId, 'attribution check · a record whose dimensions all exist passes with a case id', JSON.stringify(r));
  ok(Array.isArray(r.bad) && r.bad.indexOf('asset_id') >= 0, 'attribution check · a record with no asset is flagged (control)', JSON.stringify(r.bad));
  ok(/no asset is selected/.test(r.toast) && /active asset/.test(r.toast), 'attribution check · the warning names the missing dimension and the control that supplies it', r.toast);
  await p.close();
}

/* ── the templates ────────────────────────────────────────────────────────────────────────────────────────── */
{
  const { p, errs } = await fresh();
  const T = await p.evaluate(() => {
    document.getElementById('asmtLoadSample').click();   /* the rows join this project's assets */
    const R = AGN.templateRegistry, out = [];
    R.templates.forEach(t => {
      const rows = R.sample(t.id), v = R.validate(t.id, rows);
      const csv = R.buildCsv(t.id), head = csv.split('\n')[0].split(','), sch = R.buildSchema(t.id);
      const cols = t.columns.map(c => c.name), req = t.columns.filter(c => c.required).map(c => c.name).sort();
      const reqBlank = rows.some(r => t.columns.some(c => c.required && String(r[c.name] == null ? '' : r[c.name]).trim() === ''));
      const rc = t.columns.find(c => c.required && c.name !== 'schema_version' && c.name !== 'template_date');
      const bad = rows.map(x => Object.assign({}, x)); bad[0][rc.name] = '';
      const vb = R.validate(t.id, bad);
      const typeBad = rows.map(x => Object.assign({}, x)); const nc = t.columns.find(c => c.type === 'number' || c.type === 'integer');
      if (nc) typeBad[0][nc.name] = 'not-a-number';
      const vt = nc ? R.validate(t.id, typeBad) : { ok: false };
      const x = R.buildXlsx(t.id);
      out.push({ id: t.id, n: rows.length, ok: v.ok, errs: v.errors.slice(0, 2), reqBlank,
                 headerAgrees: head.join() === cols.join(), schemaAgrees: Object.keys(sch.properties).join() === cols.join() && JSON.stringify(sch.required) === JSON.stringify(req),
                 csvRoundTrip: R.validate(t.id, R.parseCsv(csv)).ok, negRequired: !vb.ok, negType: !vt.ok,
                 importer: v.importer ? { name: v.importer.importer, acc: v.importer.accepted, rej: v.importer.rejected.slice(0, 1) } : null,
                 xlsx: Array.from(x) });
    });
    const assets = new Set(R.sample('master_asset').map(r => r.asset_id)), proj = new Set((AGN.project.state().assets || []).map(a => a.asset_id));
    const geo = new Set(R.sample('spatial_geometry').map(r => r.feature_id));
    let joins = true; const hz = new Set();
    R.templates.forEach(t => R.sample(t.id).forEach(r => { const a = r.asset_id || r.asset_id_or_class; if (a && !assets.has(a)) joins = false; if (r.hazard) hz.add(r.hazard); }));
    const geoOk = R.sample('master_asset').concat(R.sample('critical_routes')).every(r => geo.has(r.geometry_id));
    return { out, joins, geoOk, inProject: [...assets].every(a => proj.has(a)), hazards: [...hz], count: R.templates.length };
  });
  /* v91.17.266 · the five money and emissions templates (financial_bi, insurance_recovery, management_adaptation, ghg, cbam) left with the Financial and Sustainability tabs */
  ok(T.count === 10 && !T.out.some(t => /^(financial_bi|insurance_recovery|management_adaptation|ghg|cbam)$/.test(t.id)), 'templates · the registry holds the 10 templates that remain (no money or emissions template)', T.count + ' · ' + T.out.map(t => t.id).join(','));
  for (const t of T.out) {
    ok(t.ok && !t.reqBlank && t.n >= 2, 'template ' + t.id + ' · the sample (' + t.n + ' rows) fills every required field and passes the registry validator', JSON.stringify(t.errs));
    ok(t.headerAgrees && t.schemaAgrees, 'template ' + t.id + ' · CSV header, JSON Schema properties/required and the registry agree');
    ok(t.csvRoundTrip, 'template ' + t.id + ' · the downloaded CSV parses back and validates');
    ok(t.negRequired && t.negType, 'template ' + t.id + ' · a blanked required field and a non-number are refused (control)');
    if (t.importer) ok(t.importer.acc === t.n && !t.importer.rej.length, 'template ' + t.id + ' · the section importer (' + t.importer.name + ') would accept every sample row', JSON.stringify(t.importer.rej));
    /* the workbook: a stored ZIP whose data sheet carries every column and every sample row */
    const buf = Buffer.from(t.xlsx), txt = buf.toString('latin1');
    const names = ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml'];
    const i1 = txt.indexOf('xl/worksheets/sheet1.xml'), s1 = txt.slice(i1, txt.indexOf('</worksheet>', i1));
    const rowsInSheet = (s1.match(/<row /g) || []).length;
    ok(buf[0] === 0x50 && buf[1] === 0x4b && names.every(n => txt.indexOf(n) >= 0) && rowsInSheet === t.n + 1, 'template ' + t.id + ' · Download XLSX builds a workbook (data, definitions, about) with the header and ' + t.n + ' sample rows', 'rows in data sheet ' + rowsInSheet);
  }
  ok(T.joins && T.geoOk && T.inProject, 'templates · every sample row joins the same two assets and geometry ids, which the sample project holds', JSON.stringify({ joins: T.joins, geo: T.geoOk, inProject: T.inProject }));
  ok(T.hazards.length && T.hazards.every(h => h === 'flood' || h === 'heat'), 'templates · hazard codes are the registry ids flood and heat', T.hazards.join(','));
  /* the panel as a customer sees it */
  await p.evaluate(() => AGN.journey.go('assessments')); await p.waitForTimeout(1500);
  const ui = await p.evaluate(() => {
    const h = document.getElementById('agnV9116Contracts'); if (!h) return null;
    const btn = [...h.querySelectorAll('button,label')].map(b => b.textContent.trim());
    const sel = document.getElementById('agnV9116Template'); sel.value = 'operating_limits';   /* v91.17.266 · a template that has a section importer (the ghg template left) */ sel.dispatchEvent(new Event('change'));
    document.getElementById('agnV9116Sample').click();
    const o = document.getElementById('agnV9116SampleOut');
    return { caveat: /intentionally does not ship|must be generated from this registry by the backend/.test(h.textContent), btn,
             valid: !!o.querySelector('[data-agn-valid="yes"]'), imp: !!o.querySelector('[data-agn-import="yes"]'), rows: o.querySelectorAll('tbody tr').length };
  });
  ok(ui && !ui.caveat, 'templates panel · the XLSX caveat text is gone', ui && ui.caveat);
  ok(ui && ['Load sample', 'Download CSV template', 'Download XLSX template', 'Download JSON Schema'].every(b => ui.btn.indexOf(b) >= 0), 'templates panel · Load sample, CSV, XLSX and JSON Schema controls are present', ui && ui.btn.join(' | '));
  ok(ui && ui.valid && ui.imp && ui.rows === 2, 'templates panel · Load sample shows the validated rows and the importer verdict', JSON.stringify(ui));
  ok(errs.length === 0, 'templates · no page errors', errs.slice(0, 2).join(' | '));
  await p.close();
}
await browser.close();
done();
