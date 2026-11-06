/* == v91.17.283.34 · SCENARIO LAB · THE REPORT OF ONE TO THREE SAVED SCENARIOS ==========================================================
   POST /api/scenario/report { ids: [id, ...] (1 to 3), shown: { id: { path: value } }, checksums: { id: checksum } }
   The report is written by the server from the KEPT results (scenariostore.mjs): the numbers are the screen's numbers by construction.
   The binding of the place-record reports is reused: each result carries values (by path) and a checksum (placerecord.mjs checksumOf);
   the page sends what it showed and the checksum it holds; any difference refuses the report (409 record_mismatch), never "fixed".
   Every sentence is fixed text filled with the result's own figures; nothing is written by an AI model. */
import { compareShown } from './placerecord.mjs';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const whenPkt = (iso) => { const d = new Date(Date.parse(iso) + 5 * 3600e3); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' PKT'; };
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const n = (x, d = 1) => (isN(x) ? x.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pc = (x) => (isN(x) ? (x * 100 < 1 ? (x * 100).toFixed(2) : (x * 100).toFixed(1)) + ' %' : '—');
const sharePct = (o) => Object.entries(o || {}).filter(([, v]) => v > 0).map(([k, v]) => k.replace('_', ' ') + ' ' + Math.round(v * 100) + ' %').join(', ');

/* one short name for a saved scenario */
export function scenarioName(r) {
  if (r.lab === 'site') { const c = r.inputs.change; return r.name || ('Site ' + r.inputs.areaHa + ' ha: built ' + Math.round(c.built * 100) + ' %' + (c.greenRoof ? ', green roof ' + Math.round(c.greenRoof * 100) + ' %' : '') + (c.permeable ? ', permeable paving ' + Math.round(c.permeable * 100) + ' %' : '') + (c.treesDelta ? ', trees ' + (c.treesDelta > 0 ? '+' : '') + Math.round(c.treesDelta * 100) + ' %' : '') + (r.inputs.pondM3 ? ', storage ' + r.inputs.pondM3 + ' m³' : '')); }
  const s = r.scenario || {}; const p = [];
  if (r.presetLabel) p.push(r.presetLabel); else { if (isN(s.rainMm)) p.push('rain ' + s.rainMm + ' mm'); if (isN(s.dT)) p.push('+' + s.dT + ' °C'); if (isN(s.gustKmh)) p.push('gust ' + s.gustKmh + ' km/h'); if (isN(s.wetPct)) p.push('ground ' + s.wetPct + 'th percentile'); }
  return 'Weather: ' + (p.join(', ') || 'forecast as issued');
}
/* v283.36 item 1: the mean over all draws; bounds when some draws lie outside the trained rain range (share stated) */
export function floodTxt(F) { if (!F || !F.modelled) return esc((F && F.why) || 'not modelled');
  if (F.bounded) return 'between ' + pc(F.bounds[0]) + ' and ' + pc(F.bounds[1]) + ' (' + Math.round((F.outsideShare || 0) * 100) + ' % of draws outside the trained rain range)';
  return pc(F.p) + ' (mean of ' + (F.draws || '') + ' draws; 90 % range ' + pc(F.range90[0]) + ' to ' + pc(F.range90[1]) + '; ' + esc(F.rate || '') + ')'; }
function weatherBlock(r) {
  const P = (r.places || [])[0]; if (!P || !P.ok) return '<p>' + esc((P && P.why) || 'no answer for this place') + '</p>';
  const O = P.outcomes || {}, rows = [];
  for (const d of (O.days || [])) for (const hz of ['heat', 'cold', 'wind']) { const x = d[hz]; if (!x) continue;
    rows.push('<tr><td>' + esc(d.date) + '</td><td>' + hz + '</td><td>' + (x.assessed ? esc(x.word) : x.assumed ? 'set by you' : '—') + '</td><td>' + (x.assessed ? esc(x.rangeWords[0] + ' to ' + x.rangeWords[1]) : esc(x.why || '')) + '</td></tr>'); }
  const S = P.scenario && P.scenario.hazards && P.scenario.hazards.rain; const rc = S && (S.days || []).find((d) => d.assumed);
  const F = O.flood;
  return '<table><tr><th>Day</th><th>Outcome</th><th>Level</th><th>Range (10th–90th percentile member)</th></tr>' + rows.join('') + '</table>'
    + (rc ? '<p><b>Rain class of the assumed amount:</b> ' + esc(rc.word) + ' — ' + esc(rc.basis) + '</p>' : '')
    + (F ? (F.modelled ? '<p><b>Chance of local-rain flooding reported in the district</b> on ' + esc(F.day) + ': ' + floodTxt(F) + '. ' + esc(F.label) + '. Day total: ' + esc(F.dayTotalBasis || '') + '.</p>' : '<p><b>Local-rain flooding:</b> ' + esc(F.why) + '</p>') : '')
    + '<p>Landslide: not modelled yet. Vegetation stress: not modelled yet.</p>'
    + '<p class="small">' + esc(O.members && O.members.ok ? O.members.count + ' ensemble members of the ' + O.members.run + ' run; ' : '') + 'Monte Carlo of the flood model’s uncertainty, fixed seed ' + esc(O.seed || '') + ' (the same inputs give the same answer). ' + esc(r.exposureOnly || '') + '</p>';
}
function siteBlock(r) {
  const I = r.inputs, rows = [];
  for (const [T, x] of Object.entries(r.returnPeriods)) rows.push('<tr><td>' + T + '-year</td><td>' + n(x.before.P_mm) + '</td><td>' + n(x.before.runoff_mm, 2) + ' → ' + n(x.after.runoff_mm, 2) + '</td><td>' + n(x.before.volume_m3) + ' → ' + n(x.after.volume_m3) + '</td></tr>');
  const V = r.vegetation;
  return '<p>Site ' + n(I.areaHa) + ' ha. Now: ' + esc(sharePct(I.before)) + ' (' + esc(I.coverNote || I.beforeBasis || '') + '). After: ' + esc(sharePct(I.after)) + '. Soil: ' + esc(I.hsgBasis || '') + '.</p>'
    + '<table><tr><th>Design rain</th><th>Rain mm (24 h)</th><th>Runoff depth mm before → after</th><th>Runoff volume m³ before → after</th></tr>' + rows.join('') + '</table>'
    + (r.withheld ? '<p class="small">' + esc(r.withheld.charAt(0).toUpperCase() + r.withheld.slice(1)) + '.</p>' : '')
    + '<p><b>Slope:</b> ' + esc(r.slope.text) + (r.slope.why ? ' (' + esc(r.slope.why) + ')' : '') + ' — ' + esc(r.slope.label) + '.</p>'
    + '<p><b>Vegetation index:</b> ' + (V && V.ok ? 'NDVI now ' + n(V.now.ndvi, 2) + ', after ' + (isN(V.after.ndvi.value) ? n(V.after.ndvi.value, 2) : '—') + '; NDMI now ' + n(V.now.ndmi, 2) + ', after ' + (isN(V.after.ndmi.value) ? n(V.after.ndmi.value, 2) : '—') + ' (after: ' + esc(V.after.label) + ').' : esc((V && V.why) || 'not read')) + '</p>'
    + '<p><b>Surface heat:</b> ' + esc(r.surfaceHeat.direction) + ' ' + esc(r.airHeat) + '</p>'
    + '<p class="small">' + esc(r.label)  + ' ' + esc(I.designRainBasis) + '. Methods: ' + esc(r.methods) + '. Valid: ' + esc(r.valid) + '.</p>';
}
export function renderScenarioReport(results, { title } = {}) {
  const head = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title || 'Scenario Lab report') + '</title><style>body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#17202a;max-width:960px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:17px;margin-top:28px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #c9d1d9;padding:5px 7px;text-align:left;font-size:13px}th{background:#f2f5f8}.small{font-size:12px;color:#4a5560}.id{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#4a5560}</style></head><body>';
  let cmp = '';
  if (results.length > 1) {
    const site = results.every((r) => r.lab === 'site'), wx = results.every((r) => r.lab === 'weather');
    if (site) { const Ts = Object.keys(results[0].returnPeriods); cmp = '<h2>Side by side</h2><table><tr><th></th>' + results.map((r, i) => '<th>' + (i + 1) + '. ' + esc(scenarioName(r)) + '</th>').join('') + '</tr>'
      + Ts.map((T) => '<tr><td>' + T + '-year: runoff volume after / extra volume m³</td>' + results.map((r) => { const x = r.returnPeriods[T]; return '<td>' + (x ? n(x.after.volume_m3) + ' / ' + n(x.extra_volume_m3) : '—') + '</td>'; }).join('') + '</tr>').join('')
      + '<tr><td>Slope flag</td>' + results.map((r) => '<td>' + esc(r.slope.text) + '</td>').join('') + '</tr></table>'; }
    else if (wx) { cmp = '<h2>Side by side</h2><table><tr><th></th>' + results.map((r, i) => '<th>' + (i + 1) + '. ' + esc(scenarioName(r)) + '</th>').join('') + '</tr>'
      + ['heat', 'cold', 'wind'].map((hz) => '<tr><td>Highest ' + hz + ' level, days 0–3 (range)</td>' + results.map((r) => { const D = ((r.places || [])[0] || {}).outcomes; const xs = D && D.days ? D.days.map((d) => d[hz]).filter((x) => x && x.assessed) : []; const top = xs.reduce((m, x) => (!m || x.level > m.level ? x : m), null); return '<td>' + (top ? esc(top.word + ' (' + top.rangeWords[0] + ' to ' + top.rangeWords[1] + ')') : '—') + '</td>'; }).join('') + '</tr>').join('')
      + '<tr><td>District chance of local-rain flooding (90 % range)</td>' + results.map((r) => { const F = (((r.places || [])[0] || {}).outcomes || {}).flood; return '<td>' + (F ? floodTxt(F) : '—') + '</td>'; }).join('') + '</tr></table>'; }
    else cmp = '<p class="small">Weather and site scenarios are listed one after the other (they answer different questions).</p>';
  }
  const body = results.map((r, i) => '<h2>' + (i + 1) + '. ' + esc(scenarioName(r)) + '</h2><p class="small">Run ' + esc(whenPkt(r.at)) + '</p>' + (r.lab === 'site' ? siteBlock(r) : weatherBlock(r)) + '<p class="id">Scenario ' + esc(r.id) + ' · checksum ' + esc(r.checksum) + '</p>').join('');
  return head + '<h1>' + esc(title || 'Scenario Lab report') + '</h1><p class="small">AI GEO NIGRAAN · ' + results.length + ' scenario' + (results.length > 1 ? 's' : '') + '. Every sentence is written by fixed rules from the figures shown; nothing is written by an AI model. Scenarios are “what if” answers, not forecasts or warnings.</p>' + cmp + body + '</body></html>';
}
/* check the page's shown values against the kept results; 409 on any difference */
export function scenarioReport(getResult, b) {
  const ids = Array.isArray(b && b.ids) ? b.ids.map(String) : [];
  if (!ids.length || ids.length > 3) return [400, { ok: false, error: 'bad_ids', why: 'one to three saved scenarios' }];
  const R = []; for (const id of ids) { const r = getResult(id); if (!r) return [404, { ok: false, error: 'not_found', why: 'the saved scenario ' + id.slice(0, 40) + ' is not held on this server (run it again)' }]; R.push(r); }
  for (const r of R) { const shown = b.shown && b.shown[r.id], sum = b.checksums && b.checksums[r.id];
    if (shown == null && sum == null) return [409, { ok: false, error: 'record_mismatch', why: 'not issued: the page sent no shown values or checksum for ' + r.id }];
    const C = compareShown(r, shown || null, sum ?? null);
    if (!C.match) return [409, { ok: false, error: 'record_mismatch', why: 'not issued: the report does not match the kept scenario result (' + C.mismatches.map((m) => m.path + ': shown ' + m.shown + ', result ' + m.record).slice(0, 3).join('; ') + ')', mismatches: C.mismatches }]; }
  return [200, { ok: true, ids, html: renderScenarioReport(R, { title: String(b.title || '').slice(0, 120) || null }) }];
}
