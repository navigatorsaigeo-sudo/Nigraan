/* ══ v91.17.283.51 · NIGRAAN 1.0.10.2 · EVERY REPORT ON THE ENGINE: THE KINDS AND THE MULTI-SITE LAYOUT ══════════════════════════════════
   Owner (3 Nov 2026, 11:54 PKT): "1.0.10 reports design we will adopt for all." The 1.0.10 engine (repengine.mjs: page-1 dashboard, page-2
   charts, appendix behind a divider, Tier 1 / Tier 2, the linter) made the site report; the situation, 72-hour, executive and assurance
   kinds differed only in their title and chart order. Here each kind gets its OWN content, drawn with the engine's pieces (one look), from
   the one served place answer (placeanswer.mjs) and nothing else:
     situation_report   Pakistan today (the served national alert list; when the list is stale, the last good list with its time), the
                        next 24 hours at the place, the alerts at this place
     readiness_72h      the next 72 hours in six 12-hour blocks (temperature, feels-like, rain, rain chance, gust, levels), what is due by
                        when; appendix: hour by hour every 3 hours
     executive_brief    key messages (worst level, temperatures, rain, air, the weeks and season ahead, rare events at the site), the
                        horizons first (weeks / season, days 5-15); appendix: the hazard profile
     assurance_pack     what the report rests on (every input with its time and age), the tier, product type and alert rule of every
                        hazard; appendix: every level by day with its state and reason, the forecast checks
     weather_impact     the operational day table (values and levels per day) for the Assets operator documents
     data_gap           what is missing, stale or not assessed at the place, and why (Assets operator documents)
     engineering_note   site screening and return levels, the ground, lakes and river (Assets operator documents)
     scenario           a saved Scenario Lab result: its inputs, the what-if levels against the served levels, the Monte Carlo
     portfolio, network several sites: page 1 summary map + counts by level + ranked table; one compact block per site; appendix
   Every sentence is fixed text filled with served figures; nothing is written by an AI model; no threshold is set here (levels are the
   served levels, values the served values). */
import { KIND_TITLES, placeName, clean, PAL, RAMP, Doc, footers, table, tagPill, frame, chartTitle, caption, meteogram, days415, ahead, airChart, screening, groundPanel,
  glofPanel, riverPanel, tehsils, UNAV_NAME, tileRows, H } from './repengine.mjs';
import { scenarioName } from './scenarioreport.mjs';

const { fin, n1, n0, dObj, dayLab, pkt, pktShort, cap, WORDS, MON, WD } = H;
const SINGLE = ['site_assessment', 'situation_report', 'readiness_72h', 'executive_brief', 'assurance_pack', 'weather_impact', 'data_gap', 'engineering_note'];
export const MULTI = ['portfolio', 'network'];
export const ALL_KINDS = [...SINGLE, 'scenario', ...MULTI];
const ALIAS = { site: 'site_assessment', site_report: 'site_assessment', situation: 'situation_report', readiness: 'readiness_72h', readiness72: 'readiness_72h', '72h': 'readiness_72h',
  executive: 'executive_brief', board: 'executive_brief', caseboard: 'executive_brief', assurance: 'assurance_pack', portfolio_screening: 'portfolio', caseportfolio: 'portfolio',
  weatherimpact: 'weather_impact', datagap: 'data_gap', engineering: 'engineering_note', caseasset: 'site_assessment', scenario_report: 'scenario', network_report: 'network' };
/* a kind key, alias or the Assets report-type value -> the engine kind, or null */
export function kindKey(k) { const t = String(k || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); if (!t) return null; if (ALL_KINDS.includes(t)) return t; return ALIAS[t] || ALIAS[t.replace(/_/g, '')] || null; }

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const hhmm = (t) => String(t || '').slice(11, 16);
/* a small table inside a panel at (x, y): header row, wrapped cells; returns its height (no page break: panels are measured first) */
function mini(D, x, y, w, cols, rows, o = {}) {
  const c = D.cv, size = o.size || 7.6, ws = cols.map((k) => k.w * w), pad = 3.5; let yy = y;
  c.rect(x, yy, w, 13, { fill: PAL.seaL }); let xx = x; cols.forEach((k, i) => { D.wrap(k.t, ws[i] - 2 * pad, 7.2, true).slice(0, 1).forEach((l) => c.text(xx + pad, yy + 9.5, l, { size: 7.2, b: true, fill: PAL.seaD })); xx += ws[i]; }); yy += 13;
  rows.forEach((r, ri) => { const cells = r.map((v, i) => D.wrap(v == null ? '' : String(v), ws[i] - 2 * pad, size, !!cols[i].b));
    const h = Math.max(1, ...cells.map((l) => l.length)) * size * 1.22 + 5; if (ri % 2) c.rect(x, yy, w, h, { fill: PAL.panel });
    let x2 = x; cells.forEach((ls, i) => { ls.forEach((l, k) => c.text(x2 + pad, yy + 2.5 + size + k * size * 1.22, l, { size, b: !!cols[i].b, fill: cols[i].mute ? PAL.mute : PAL.ink })); x2 += ws[i]; });
    c.line(x, yy + h, x + w, yy + h, { stroke: PAL.line, lw: 0.4 }); yy += h; });
  D.tables.push({ title: o.title || cols.map((k) => k.t).join('|'), sig: JSON.stringify(rows) });
  return yy - y;
}
/* a panel: title (+ tier pill), an optional lead line, a mini table, an optional caption; returns the height used */
function panel(D, x, y, w, title, tag, lead, cols, rows, cap0, o = {}) {
  chartTitle(D, x + 2, y + 11, title, tag); let yy = y + 17;
  if (lead) yy += D.para(x + 2, yy, w - 4, lead, { size: 7.8, fill: PAL.mute }) + 3;
  if (rows && rows.length) yy += mini(D, x, yy, w, cols, rows, { title: o.tableTitle || title, size: o.size });
  if (cap0) yy += 2 + caption(D, x + 2, yy + 1, w - 4, cap0);
  return yy - y + 6;
}
const lvWord = (lv) => (lv != null && lv >= 0 ? WORDS[lv] : null);
/* the levels of the place by date: the hazards (not air) at Low or above on that date, worst first */
function raisedOn(A, date) { const out = []; for (const h of (A.levels && A.levels.hazards) || []) { if (h.cannot || h.key === 'air') continue; const d = h.days.find((z) => z.date === date); if (d && d.level != null && d.level >= 1) out.push({ name: h.name, level: d.level, tier: h.tier }); }
  return out.sort((a, b) => b.level - a.level); }
const raisedText = (L) => (L.length ? L.map((r) => r.name + ' ' + WORDS[r.level] + (r.tier === 2 ? ' (indicative)' : '')).join(', ') : 'none above Normal');
function hoursOf(A) { return (A.hours || []).filter((h) => h && h.time); }
function block(Hs) { const T = Hs.map((h) => h.tempC).filter(isN), F = Hs.map((h) => h.feelsC).filter(isN), R = Hs.map((h) => h.rainMm).filter(isN), P = Hs.map((h) => h.rainProb).filter(isN), G = Hs.map((h) => h.gustKmh).filter(isN);
  return { tmin: T.length ? Math.min(...T) : null, tmax: T.length ? Math.max(...T) : null, fmax: F.length ? Math.max(...F) : null, rain: R.length ? R.reduce((s, v) => s + v, 0) : null, pmax: P.length ? Math.max(...P) : null, gmax: G.length ? Math.max(...G) : null, n: Hs.length }; }
const t1 = (x) => (isN(x) ? (Math.round(x * 10) / 10).toFixed(1) : '');

/* ── situation report ── */
function nationalPanel(D, A, x, y, w, maxRows = 10) {
  const N = A.national; if (!N) return 0;
  const rows = (N.rows || []).slice(0, maxRows).map((r) => [clean(r.name), clean(String(r.alert || '').split(' · ')[0] || r.hazard), clean(r.band || '')]);
  /* v91.17.283.52 D · #150: an area is on alert at Moderate or above (the map's rule: Low is never an alert); Low areas are counted apart */
  const lead = (N.stale ? 'The current national list is still being made: this is the last good list, issued ' + (pkt(N.at) || 'earlier') + '. ' : 'Issued ' + (pkt(N.at) || 'with this issue') + '. ')
    + (N.count ? N.count + ' area' + (N.count === 1 ? '' : 's') + ' on alert (Moderate or above)' + (N.count > rows.length ? ', the first ' + rows.length + ' shown' : '') + '.' : 'No area in Pakistan is on alert (Moderate or above) today.')
    + (N.watch ? ' ' + N.watch + ' area' + (N.watch === 1 ? ' is' : 's are') + ' at Low (watch, not an alert).' : '');
  return panel(D, x, y, w, 'Pakistan today: the national alert list', 'Tier 1', lead, rows.length ? [{ t: 'Area', w: 0.42, b: true }, { t: 'Hazard', w: 0.38 }, { t: 'Level', w: 0.2 }] : null, rows, null, { tableTitle: 'National alert list' });
}
function next24Line(A) { const Hs = hoursOf(A).slice(0, 24); if (Hs.length < 6) return null; const b = block(Hs);
  return 'Next 24 hours here: ' + t1(b.tmin) + ' to ' + t1(b.tmax) + ' °C' + (isN(b.fmax) ? ', feels like up to ' + t1(b.fmax) + ' °C' : '') + '; ' + (isN(b.rain) && b.rain >= 0.5 ? n1(b.rain) + ' mm of rain' : 'no rain of note') + (isN(b.pmax) ? ' (highest hourly chance ' + n0(b.pmax) + ' %)' : '') + (isN(b.gmax) ? '; gusts up to ' + n0(b.gmax) + ' km/h' : '') + '.'; }
function oneLine(D, label, text) { if (!text) return; const bw = D.measure(label, 8.6, true); D.cv.text(D.M, D.y + 9.5, label, { size: 8.6, b: true, fill: PAL.seaD }); D.y += D.para(D.M + bw, D.y + 1, D.cw - bw, text, { size: 8.6 }) + 5; }
const SITUATION = {
  /* v91.17.283.52 D · #148: page 1 of the situation report is the NATIONAL PICTURE and the place: the national alert list as a panel, the next
     24 hours here, the map and the gauges, the levels; no action cards (those are the 72-hour and executive briefs' page 1) */
  ownNational: true, noActions: true,
  page1(D, A, man) {
    if (A.national && !A.national.stale) { D.y += nationalPanel(D, A, D.M, D.y, D.cw, 6) + 2; man.national = { count: A.national.count, watch: A.national.watch || 0 }; }
    /* the engine prints "Pakistan today" from a current list; a stale list is named with its time (owner: never an internal status) */
    if (A.national && A.national.stale) { const N = A.national, rows = N.rows || [];
      oneLine(D, 'Pakistan today: ', (rows.length ? N.count + ' area' + (N.count === 1 ? '' : 's') + ' on alert in the last good list (' + (pktShort(N.at) || 'earlier') + '): ' + rows.slice(0, 5).map((r) => clean(r.name) + ' (' + clean(r.alert) + ')').join(', ') + (N.count > 5 ? ' and ' + (N.count - 5) + ' more' : '') : 'no area on alert in the last good list (' + (pktShort(N.at) || 'earlier') + ')') + '.');
      man.national = { count: N.count, stale: true, at: N.at }; }
    oneLine(D, 'Here: ', (next24Line(A) || '').replace(/^Next 24 hours here: /, 'next 24 hours ')); },
  plan: [meteogram, airChart, riverPanel, glofPanel, days415],
  appendix(D, A, man, ensure) { const al = (A.levels && A.levels.alerts) || [];
    ensure(60); D.section('Alerts at this place', 'appendix').items = 1;
    if (!al.length) { D.y += D.para(D.M, D.y, D.cw, 'No alert is issued for this place in the current list.', { size: 8.6 }) + 8; return; }
    table(D, [{ t: 'Hazard', w: 0.3, b: true }, { t: 'Level', w: 0.2 }, { t: 'Area', w: 0.5 }], al.slice(0, 20).map((r) => [clean(r.hazardName || r.hazard || ''), clean(r.band || r.level || ''), clean(r.name || '')]), { title: 'Alerts at this place', part: 'appendix' }); D.y += 10; } };

/* ── 72-hour readiness ── */
function blocks72(D, A, x, y, w) {
  const Hs = hoursOf(A).slice(0, 72); if (Hs.length < 24) return 0; const B = []; for (let i = 0; i < Hs.length && B.length < 6; i += 12) B.push(Hs.slice(i, i + 12));
  const lab = (b) => { const a = b[0].time, z = b[b.length - 1].time, d = dObj(a.slice(0, 10)); return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + hhmm(a) + '–' + hhmm(z); };
  const S = B.map(block), cols = [{ t: '', w: 0.19, b: true }].concat(B.map((b) => ({ t: lab(b), w: 0.81 / B.length })));
  const rows = [['Temperature °C'].concat(S.map((s) => t1(s.tmin) + ' – ' + t1(s.tmax))), ['Feels like, highest °C'].concat(S.map((s) => t1(s.fmax))), ['Rain mm'].concat(S.map((s) => isN(s.rain) ? n1(s.rain) : '')),
    ['Rain chance, highest %'].concat(S.map((s) => isN(s.pmax) ? n0(s.pmax) : '')), ['Gust, strongest km/h'].concat(S.map((s) => isN(s.gmax) ? n0(s.gmax) : '')),
    ['Levels that day'].concat(B.map((b) => raisedText(raisedOn(A, b[0].time.slice(0, 10))).replace('none above Normal', 'Normal')))];
  return panel(D, x, y, w, 'The next 72 hours in 12-hour blocks', 'Tier 1', 'From the place forecast, hour by hour, summed or taken at the extreme of each block (times PKT). Levels are the served levels of the day.', cols, rows, null, { size: 7.2, tableTitle: '72 hours in blocks' });
}
function dueLine(A) { const acts = (A.actions || []).filter((a) => a.action); if (!acts.length) return 'no action is triggered by the forecast in the next 72 hours.';
  const w = acts.filter((a) => a.when).sort((a, b) => String(a.when).localeCompare(String(b.when)))[0];
  return acts.length + ' action' + (acts.length === 1 ? '' : 's') + ' triggered by the forecast' + (w && H.dueText(w.when) ? '; the first is due ' + H.dueText(w.when) + ' (' + clean(w.hazard) + ')' : '') + '. The first three are below.'; }
const READINESS = {
  /* v91.17.283.52 D · #148: page 1 of the 72-hour brief is HOUR-BY-HOUR READINESS: what is due, the next 72 hours in six 12-hour blocks in place
     of the map, then the levels and the actions with their ready-by times */
  page1(D, A) { oneLine(D, 'Due: ', dueLine(A)); },
  p1Main: blocks72, p1MainMax: 230, actionsTitle: 'Actions and when to be ready',
  plan: [meteogram, airChart, screening, groundPanel, glofPanel, riverPanel],
  appendix(D, A, man, ensure) { const Hs = hoursOf(A).slice(0, 72).filter((h, i) => i % 3 === 0); if (!Hs.length) return;
    ensure(80); D.section('Hour by hour, every 3 hours', 'appendix').items = Hs.length;
    table(D, [{ t: 'Time (PKT)', w: 0.18, b: true }, { t: 'Temp °C', w: 0.11 }, { t: 'Feels °C', w: 0.11 }, { t: 'Rain mm', w: 0.11 }, { t: 'Chance %', w: 0.11 }, { t: 'Gust km/h', w: 0.13 }, { t: 'Wind km/h', w: 0.13 }, { t: 'RH %', w: 0.12 }],
      Hs.map((h) => [dayLab(h.time.slice(0, 10)) + ' ' + hhmm(h.time), t1(h.tempC), t1(h.feelsC), isN(h.rainMm) ? n1(h.rainMm) : '', isN(h.rainProb) ? n0(h.rainProb) : '', isN(h.gustKmh) ? n0(h.gustKmh) : '', isN(h.windKmh) ? n0(h.windKmh) : '', isN(h.rh) ? n0(h.rh) : '']),
      { title: 'Hour by hour', part: 'appendix', size: 7.8 }); D.y += 10; } };

/* ── executive brief ── */
function keyMessages(A) {
  const T = tileRows(A), out = [], days = A.days || [];
  let worst = null; for (const h of T.rows) for (const d of h.days) if (d.level != null && d.level >= 1 && (!worst || d.level > worst.level)) worst = { name: h.name, level: d.level, date: d.date, tier: h.tier };
  out.push(worst ? 'Highest level in the next 7 days: ' + worst.name.toLowerCase() + ' ' + WORDS[worst.level] + (worst.tier === 2 ? ' (indicative)' : '') + ' on ' + dayLab(worst.date) + '.' : 'No hazard above Normal on the days with issued levels.');
  const tx = days.filter((d) => fin(d.tmaxC)), tn = days.filter((d) => fin(d.tminC));
  if (tx.length) out.push('Temperatures ' + n1(Math.min(...tn.map((d) => +d.tminC))) + ' to ' + n1(Math.max(...tx.map((d) => +d.tmaxC))) + ' °C over ' + days.length + ' days.');
  const rn = days.filter((d) => fin(d.rainMm)), tot = rn.reduce((s, d) => s + +d.rainMm, 0); if (rn.length) out.push(tot >= 1 ? n0(tot) + ' mm of rain expected in ' + rn.length + ' days.' : 'Dry: no rain of note in ' + rn.length + ' days.');
  const ord = ['good', 'moderate', 'unhealthy for sensitive groups', 'unhealthy', 'very unhealthy', 'hazardous'];
  /* v91.17.283.52 D · N15: air quality is the second message (the brief's "In brief" line carries the first three; it left AQI 222 out) */
  const aq = (A.air && A.air.days || []).filter((d) => d.category && days.some((x) => x.date === d.date)); if (aq.length) { const ci = (d) => ord.indexOf(String(d.category).toLowerCase()), m = aq.reduce((a, d) => (ci(d) > ci(a) || (ci(d) === ci(a) && (d.aqi ?? -1) > (a.aqi ?? -1)) ? d : a));   /* v91.17.283.52 D: the worst class, and within it the highest AQI (the summary's "AQI up to") */ out.splice(1, 0, 'Air quality up to ' + String(m.category).toLowerCase() + (isN(m.aqi) ? ' (AQI ' + m.aqi + ')' : '') + ', on ' + dayLab(m.date) + '.'); }
  const wk = (A.outlook && A.outlook.weeks && A.outlook.weeks.weeks || []).filter((r) => fin(r.tAnom)); if (wk.length) out.push('Weeks ahead: ' + (wk[0].tAnom > 0 ? '+' : '') + n1(wk[0].tAnom) + ' °C against normal in the first week' + (wk.length > 1 ? ', ' + (wk[wk.length - 1].tAnom > 0 ? '+' : '') + n1(wk[wk.length - 1].tAnom) + ' °C by week ' + wk.length : '') + ' (Tier 2).');
  const ss = (A.siteScreening && A.siteScreening.rows || []).filter((r) => r.values); if (ss.length) out.push('Site screening: ' + ss.length + ' rare-event check' + (ss.length === 1 ? '' : 's') + ' at this point' + (ss.some((r) => r.reached) ? ', ' + ss.filter((r) => r.reached).length + ' reached in the forecast' : ', none reached in the forecast') + ' (Tier 2).');
  return out;
}
function keyPanel(D, A, x, y, w) { const M = keyMessages(A); if (!M.length) return 0; chartTitle(D, x + 2, y + 11, 'Key messages', null); let yy = y + 18;
  for (const m of M) yy += D.para(x + 10, yy, w - 14, '• ' + m, { size: 8.8 }) + 2; D.tables.push({ title: 'Key messages', sig: JSON.stringify(M) }); return yy - y + 6; }
function hazardProfileRows(A) { const out = [];
  for (const h of (A.levels && A.levels.hazards) || []) { if (h.cannot) continue; const lv = h.days.filter((d) => d.level != null); const mx = lv.reduce((m, d) => Math.max(m, d.level), -1);
    const pt = (h.days.find((d) => d.productType) || {}).productType; out.push([h.name, mx >= 0 ? WORDS[mx] + (mx >= 1 ? ' on ' + lv.filter((d) => d.level === mx).length + ' day' + (lv.filter((d) => d.level === mx).length === 1 ? '' : 's') : '') : 'not assessed', h.tier === 1 ? 'Tier 1' : 'Tier 2', clean(pt || (h.tier === 1 ? 'Forecast' : 'Indicative'))]); }
  return out; }
const EXECUTIVE = {
  /* v91.17.283.52 D · #148: page 1 of the executive brief is the DECISIONS SUMMARY: the key messages in place of the map, the levels, and the
     decisions (the first three actions) */
  p1Main: keyPanel, p1MainMax: 200, actionsTitle: 'Decisions for the coming days',
  page1(D, A) { const k = keyMessages(A); oneLine(D, 'In brief: ', k[0] ? k[0].replace(/\.$/, '') + (k.length > 1 ? '; ' + k.slice(1, 3).map((s) => s.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())).join('; ') : '') + '.' : null); },
  plan: [ahead, days415, screening, groundPanel, glofPanel, riverPanel, meteogram],
  appendix(D, A, man, ensure) { const r = hazardProfileRows(A); if (!r.length) return; ensure(60); D.section('Hazard profile of the place', 'appendix').items = r.length;
    table(D, [{ t: 'Hazard', w: 0.28, b: true }, { t: 'Highest level, 7 days', w: 0.32 }, { t: 'Tier', w: 0.14 }, { t: 'Product', w: 0.26 }], r, { title: 'Hazard profile', part: 'appendix' }); D.y += 10; } };

/* ── assurance pack ── */
const age = (iso, ref) => { const a = Date.parse(iso), b = Date.parse(ref); if (!isN(a) || !isN(b)) return ''; const h = (b - a) / 3600e3; return h < 1 ? Math.max(0, Math.round(h * 60)) + ' min' : h < 48 ? n1(h) + ' h' : n0(h / 24) + ' days'; };
function freshness(A) { const ref = A.issuedAt, rows = [];
  rows.push(['Place forecast', pkt(A.issuedAt) || 'not available', 'this report']);
  if (A.run) rows.push(['Forecast model run', String(A.run).split('~')[0].replace('T', ' ') + ' UTC', age(String(A.run).split('~')[0] + ':00Z', ref)]);
  rows.push(['Hazard levels', A.levelsAt ? pkt(A.levelsAt) : 'not available', A.levelsAt ? age(A.levelsAt, ref) : '']);
  if (A.levelsValidUntil) rows.push(['Levels valid until', pkt(A.levelsValidUntil), '']);
  if (A.air) rows.push(['Air quality forecast', A.air.at ? pkt(A.air.at) : 'not available', A.air.at ? age(A.air.at, ref) + (A.air.stale ? ', not current' : '') : '']);
  const ens = A.outlook && A.outlook.ensemble, ue = (A.unavailable || []).find((u) => u.part === 'ensemble');
  rows.push(['15-day ensemble', ens && ens.at ? pkt(ens.at) : ue && ue.lastGood ? 'not current (last good ' + pkt(ue.lastGood) + ')' : 'not available', ens && ens.at ? age(ens.at, ref) : ue && ue.lastGood ? age(ue.lastGood, ref) : '']);
  const wk = A.outlook && A.outlook.weeks; if (wk && wk.at) rows.push(['Weeks-ahead outlook', pkt(wk.at), age(wk.at, ref)]);
  const SH = A.shown || {}, m = SH.now && SH.now.kind === 'measured' ? SH.now : SH.measured && SH.measured.value != null ? SH.measured : null;
  rows.push(['Live measurement', clean((m && m.label) || (SH.measured && SH.measured.label) || 'none used'), m && m.observedAt ? age(m.observedAt, ref) : '']);   /* v91.17.283.51 fix · owner 3 Nov 18:54: no station name or distance in reports */
  return rows; }
function freshPanel(D, A, x, y, w) { return panel(D, x, y, w, 'What this report rests on', null, 'Every input of pages 1 and 2 with the time it was made and its age when this report was issued.', [{ t: 'Input', w: 0.32, b: true }, { t: 'Made (PKT unless marked)', w: 0.48 }, { t: 'Age', w: 0.2 }], freshness(A), null, { tableTitle: 'Inputs and their age' }); }
function tierRows(A) { return ((A.levels && A.levels.hazards) || []).filter((h) => !h.cannot).map((h) => { const lv = h.days.filter((d) => d.level != null), ca = h.days.some((d) => d.canAlert);
  const pt = (h.days.find((d) => d.productType) || {}).productType; return [h.name, h.tier === 1 ? 'Tier 1' : 'Tier 2', clean(pt || (h.tier === 1 ? 'Forecast' : 'Indicative')), ca ? 'yes' : 'no', lv.length + ' of ' + h.days.length]; }); }
function tierPanel(D, A, x, y, w) { const r = tierRows(A); if (!r.length) return 0;
  return panel(D, x, y, w, 'How each level is made and used', null, 'Tier 1: passed its event test against measured outcomes and may raise an alert. Tier 2: context or indicative, never an alert by itself.', [{ t: 'Hazard', w: 0.28, b: true }, { t: 'Tier', w: 0.12 }, { t: 'Product', w: 0.22 }, { t: 'May raise an alert', w: 0.18 }, { t: 'Days with a level', w: 0.2 }], r, null, { tableTitle: 'Tiers and products' }); }
const ASSURANCE = {
  page1(D, A) { const r = freshness(A); oneLine(D, 'Rests on: ', r.slice(0, 3).map((x) => x[0].toLowerCase() + ' ' + x[1]).join('; ') + '.'); },
  plan: [freshPanel, tierPanel, meteogram],
  appendix(D, A, man, ensure) {
    const rows = []; for (const h of (A.levels && A.levels.hazards) || []) { if (h.cannot) continue; for (const d of h.days) rows.push([h.name, dayLab(d.date), d.level != null ? WORDS[d.level] : cap(clean(d.word || 'not assessed')), cap(clean(d.level != null ? (d.valueBasis || (d.value != null ? n1(d.value) + (d.unit ? ' ' + d.unit : '') : '') || '') : (d.why || '')))]); }
    if (rows.length) { ensure(60); D.section('Every level by day', 'appendix').items = rows.length; table(D, [{ t: 'Hazard', w: 0.2, b: true }, { t: 'Day', w: 0.14 }, { t: 'Level', w: 0.16 }, { t: 'Basis or reason', w: 0.5, mute: true }], rows, { title: 'Every level by day', part: 'appendix', size: 7.8 }); D.y += 10; }
    const sk = []; for (const [k, v] of Object.entries((A.skill && A.skill.measured) || {})) if (Array.isArray(v)) for (const l of v.slice(0, 3)) sk.push([cap(k), cap(clean(l))]);
    if (sk.length) { ensure(60); D.section('Forecast checks against AGN stations', 'appendix').items = sk.length; table(D, [{ t: 'Value', w: 0.18, b: true }, { t: 'Measured error', w: 0.82 }], sk, { title: 'Forecast checks', part: 'appendix', size: 7.8 }); D.y += 10; } } };

/* ── Assets operator documents: weather impact, data gap, engineering note ── */
function dayTable(D, A, x, y, w) { const days = (A.days || []).slice(0, 7); if (!days.length) return 0;
  const rows = days.map((d) => [dayLab(d.date), fin(d.tmaxC) ? t1(+d.tmaxC) + ' / ' + (fin(d.tminC) ? t1(+d.tminC) : '') : '', fin(d.feelsMaxC) ? t1(+d.feelsMaxC) : '', fin(d.rainMm) ? n1(d.rainMm) + (fin(d.rainProbMax) ? ' (' + n0(d.rainProbMax) + ' %)' : '') : '', fin(d.gustMaxKmh) ? n0(d.gustMaxKmh) : '', raisedText(raisedOn(A, d.date))]);
  return panel(D, x, y, w, 'Day by day at the site', 'Tier 1', 'The served values of each day and the levels at Low or above that day (no other threshold is applied).', [{ t: 'Day', w: 0.15, b: true }, { t: 'Max / min °C', w: 0.15 }, { t: 'Feels max °C', w: 0.12 }, { t: 'Rain mm (chance)', w: 0.15 }, { t: 'Gust km/h', w: 0.1 }, { t: 'Levels', w: 0.33 }], rows, null, { tableTitle: 'Day by day' }); }
const WEATHER_IMPACT = { page1(D, A) { oneLine(D, 'Operations: ', dueLine(A)); }, plan: [dayTable, meteogram, airChart, riverPanel, glofPanel] };
function gapRows(A) { const out = [];
  for (const u of A.unavailable || []) out.push([UNAV_NAME[u.part] || cap(u.part), 'Not current or not available', cap(clean(u.why || '')) + (u.lastGood ? ' (last good ' + pkt(u.lastGood) + ')' : '')]);
  for (const r of tileRows(A).notAssessed) out.push([r.name, 'Not assessed', cap(clean(r.why || 'no level issued for these days'))]);
  const SH = A.shown || {}; if (SH.measured && SH.measured.value == null && !(SH.now && SH.now.kind === 'measured')) out.push(['AGN station reading', 'None used', cap(clean(SH.measured.label || ''))]);
  for (const r of (A.siteScreening && A.siteScreening.rows || []).filter((r) => !r.values && (r.state || r.valuesWhy))) out.push(['Site screening: ' + clean(r.parameter), 'Input required', cap(clean(r.valuesWhy || r.state || ''))]);
  return out; }
function gapPanel(D, A, x, y, w) { const r = gapRows(A);
  return panel(D, x, y, w, 'What is missing, stale or not assessed here', null, r.length ? r.length + ' item' + (r.length === 1 ? '' : 's') + ' below; each with its reason. Values and levels on page 1 are unaffected by the items listed unless named there.' : 'Every input of this report was current and every hazard that can happen here was assessed.', [{ t: 'Input', w: 0.3, b: true }, { t: 'State', w: 0.2 }, { t: 'Reason', w: 0.5, mute: true }], r.slice(0, 14), null, { tableTitle: 'Data gaps' }) || 30; }
const DATA_GAP = { page1(D, A) { const r = gapRows(A); oneLine(D, 'Data gaps: ', r.length ? r.length + ' input' + (r.length === 1 ? '' : 's') + ' missing, stale or not assessed (page 2).' : 'none at this place now.'); }, plan: [gapPanel, freshPanel, meteogram] };
function screenAll(D, A, x, y, w) { const S = (A.siteScreening && A.siteScreening.rows || []).filter((r) => r.parameter); if (!S.length) return 0;
  return panel(D, x, y, w, 'Site screening and return levels', 'Tier 2', 'Return levels and rare-event checks at this point, as the site screening serves them; an input that is not held is named, never estimated.', [{ t: 'Check', w: 0.24, b: true }, { t: 'Values', w: 0.4 }, { t: 'State', w: 0.36, mute: true }],
    S.slice(0, 8).map((r) => [clean(r.parameter), cap(clean(r.values || r.valuesWhy || 'not held')), cap(clean(r.verdict || r.state || ''))]), null, { tableTitle: 'Site screening and return levels', size: 7.4 }); }
const ENGINEERING = { page1(D, A) { const P = A.place; oneLine(D, 'Site: ', [fin(P.elevM) ? n0(P.elevM) + ' m above sea level' : null, P.zone ? clean(P.zone) + ' zone' : null, P.tehsil ? P.tehsil + ' tehsil' : null].filter(Boolean).join(', ') + '. Engineering inputs on page 2.'); },
  plan: [screenAll, groundPanel, glofPanel, riverPanel, ahead] };

/* ── scenario ── */
const HZ_SC = [['heat', 'Heat'], ['cold', 'Cold'], ['wind', 'Wind'], ['rain', 'Heavy rain'], ['flood', 'Flooding'], ['landslide', 'Landslide'], ['drought', 'Drought']];
const pc = (x) => (isN(x) ? (x * 100 < 1 ? (x * 100).toFixed(2) : (x * 100).toFixed(1)) + ' %' : '');
function scenPlace(S) { return S && Array.isArray(S.places) ? S.places.find((p) => p && p.ok) || null : null; }
function compareRows(S) { const P = scenPlace(S); if (!P || !P.baseline || !P.scenario) return { days: [], rows: [] };
  const B = P.baseline.hazards || {}, Z = P.scenario.hazards || {}, days = []; for (const [k] of HZ_SC) for (const d of (B[k] && B[k].days) || []) if (!days.includes(d.date)) days.push(d.date); days.sort();
  const rows = []; for (const [k, nm] of HZ_SC) { const b = B[k], z = Z[k]; if (!b && !z) continue; const cell = (d) => { const x = b && (b.days || []).find((q) => q.date === d), y = z && (z.days || []).find((q) => q.date === d);
      const bw = x ? (x.assessed ? x.word : 'not assessed') : '', zw = y ? (y.assessed ? y.word + (y.assumed ? ' (set by you)' : '') : 'not assessed') : '';
      return bw === zw ? bw : bw + ' / ' + zw; };
    const cells = days.slice(0, 4).map(cell); if (cells.every((c) => !c || c === 'not assessed')) continue; rows.push([nm].concat(cells)); }
  return { days: days.slice(0, 4), rows }; }
function scenCompare(D, A, x, y, w) { const S = A.scenario, C = compareRows(S); if (!C.rows.length) return 0;
  return panel(D, x, y, w, 'What-if against the served levels', 'Tier 2', 'Each cell: the served level, then the level with your assumptions where they differ (one word where they agree).', [{ t: 'Hazard', w: 0.2, b: true }].concat(C.days.map((d) => ({ t: dayLab(d), w: 0.8 / C.days.length }))), C.rows, null, { tableTitle: 'What-if against served' }); }
function mcPanel(D, A, x, y, w) { const P = scenPlace(A.scenario), O = P && P.outcomes; if (!O) return 0; const F = O.flood, rows = [];
  if (F) { if (F.modelled) { rows.push(['Chance of local-rain flooding reported in the district', F.bounded ? 'between ' + pc(F.bounds[0]) + ' and ' + pc(F.bounds[1]) : pc(F.p) + ' (' + clean(F.rate || '') + ')']); if (!F.bounded && F.range90) rows.push(['90 % range over the draws', pc(F.range90[0]) + ' to ' + pc(F.range90[1])]);
      rows.push(['Draws', String(F.draws || '') + (F.outsideShare ? ', ' + n0(F.outsideShare * 100) + ' % outside the trained rain range' : '')]); if (F.day) rows.push(['Day', dayLab(F.day)]); if (F.dayTotalBasis) rows.push(['Day total', cap(clean(F.dayTotalBasis))]); if (isN(F.wetnessPct)) rows.push(['Ground wetness percentile', n0(F.wetnessPct) + (F.wetnessSet ? ' (set by you)' : '')]); }
    else rows.push(['Local-rain flooding', cap(clean(F.why || 'not modelled for this scenario'))]); }
  rows.push(['Ensemble members', O.members && O.members.ok ? O.members.count + ' members' + (O.members.run ? ' of the ' + clean(String(O.members.run)) + ' run' : '') : cap(clean((O.members && O.members.why) || 'not used'))]);
  if (O.seed) rows.push(['Reproducible', 'fixed seed ' + O.seed + ': the same inputs give the same answer']);
  return panel(D, x, y, w, 'Monte Carlo of the flood model', 'Tier 2', F && F.label ? cap(clean(F.label)) + '.' : null, [{ t: 'Item', w: 0.42, b: true }, { t: 'Result', w: 0.58 }], rows, null, { tableTitle: 'Monte Carlo' }); }
function scenInputs(S) { const rows = [], sp = S.scenario || {}, B = S.bounds || {};
  const lab = { dT: ['Warming on the hourly temperature', '°C', 'tempC'], rainMm: ['Rain day amount', 'mm', 'rainMmDay'], rainReturnYears: ['Rain day at the return level of', 'years', null], rainDay: ['Rain day', '', null], gustKmh: ['Gust', 'km/h', 'gustKmh'], gustDay: ['Gust day', '', null], wetPct: ['Ground wetness percentile', '', null] };
  if (S.presetLabel) rows.push(['Preset', clean(S.presetLabel), '']);
  for (const [k, v] of Object.entries(sp)) { if (v == null) continue; const L = lab[k] || [cap(k), '', null]; const b = L[2] && Array.isArray(B[L[2]]) ? B[L[2]][0] + ' to ' + B[L[2]][1] + (L[1] ? ' ' + L[1] : '') : '';
    rows.push([L[0], (/Day$/.test(k) ? dayLab(v) : String(v)) + (L[1] && !/Day$/.test(k) ? ' ' + L[1] : ''), b]); }
  if (S.lab === 'site' && S.inputs) { const fl = (o, p) => { for (const [k, v] of Object.entries(o || {})) { if (v == null) continue; if (typeof v === 'object' && !Array.isArray(v)) fl(v, p + k + ' '); else if (typeof v !== 'object') rows.push([cap((p + k).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()), String(v), '']); } }; fl(S.inputs, ''); }
  if (!rows.length) rows.push(['Assumptions', 'none: the forecast as issued', '']);
  return rows; }
const SCENARIO = {
  page1(D, A, man) { const S = A.scenario; oneLine(D, 'What-if: ', clean(scenarioName(S)) + (S.at ? ' (saved ' + pktShort(S.at) + ')' : '') + '. The tiles below are the SERVED levels; page 2 sets your scenario beside them.'); man.scenario = { id: S.id || null, at: S.at || null }; },
  plan: [scenCompare, mcPanel, meteogram, days415],
  appendix(D, A, man, ensure) { const S = A.scenario;
    ensure(60); D.section('Your assumptions', 'appendix').items = 1; table(D, [{ t: 'Input', w: 0.38, b: true }, { t: 'Value', w: 0.3 }, { t: 'Allowed range', w: 0.32, mute: true }], scenInputs(S), { title: 'Scenario inputs', part: 'appendix' }); D.y += 6;
    const P = scenPlace(S), O = P && P.outcomes, notes = [];
    if (O && O.method) notes.push('Method: ' + clean(O.method) + '.'); if (S.boundsSource) notes.push('Allowed ranges: ' + clean(S.boundsSource) + '.'); if (S.exposureOnly) notes.push('Scope: ' + clean(S.exposureOnly) + '.');
    if (O && O.notModelled) notes.push('Not modelled in this scenario: ' + Object.keys(O.notModelled).map((k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(', ') + '.');
    for (const m of notes) { ensure(D.paraH(D.cw - 8, m, { size: 8.4 }) + 4); D.y += D.para(D.M + 8, D.y, D.cw - 8, '• ' + m, { size: 8.4 }) + 2; } D.y += 8; } };

export const EXTRA = { situation_report: SITUATION, readiness_72h: READINESS, executive_brief: EXECUTIVE, assurance_pack: ASSURANCE, weather_impact: WEATHER_IMPACT, data_gap: DATA_GAP, engineering_note: ENGINEERING, scenario: SCENARIO };

/* ══ several sites: portfolio screening and the network report ══════════════════════════════════════════════════════════════════════════
   items: [{ site: {lat, lon, name?, sector?, id?}, A: the place answer (or {ok:false, why}) }] in the order asked. The rank is by the served
   levels only: the highest level any hazard reaches at the site in the next 7 days (air quality apart), then the number of days at that
   level, then Tier 1 before Tier 2, then the order asked. */
function worstOf(A) { if (!A || A.ok === false) return null; let w = null;
  for (const h of (A.levels && A.levels.hazards) || []) { if (h.cannot || h.key === 'air') continue; for (const d of h.days) { if (d.level == null) continue;
    if (!w || d.level > w.level || (d.level === w.level && h.tier < w.tier)) w = { level: d.level, name: h.name, date: d.date, tier: h.tier, n: 0 }; } }
  if (w) for (const h of A.levels.hazards) { if (h.cannot || h.key === 'air') continue; for (const d of h.days) if (d.level === w.level) w.n++; }
  return w; }
function siteName(it, i) { const s = it.site || {}; const n = s.name && String(s.name).trim(); return clean(n || (it.A && it.A.ok !== false ? placeName(it.A.place) : 'Site ' + (i + 1))) || 'Site ' + (i + 1); }
/* a site without a place answer: the reason in client words (never a server error) */
const noFc = (A) => (/outside/i.test(String(A && A.why || '')) ? 'Outside the NIGRAAN area: no forecast is published here' : 'No forecast for this point right now');
function placeLine(A) { if (!A || A.ok === false) return ''; const P = A.place; return [P.tehsil ? P.tehsil + ' tehsil' : null, P.district && P.district !== P.tehsil ? P.district : null].filter(Boolean).join(', '); }
export function rankSites(items) {
  return items.map((it, i) => ({ ...it, i, name: siteName(it, i), w: worstOf(it.A) })).sort((a, b) => {
    const la = a.w ? a.w.level : -1, lb = b.w ? b.w.level : -1; if (la !== lb) return lb - la; if (a.w && b.w && a.w.n !== b.w.n) return b.w.n - a.w.n; if (a.w && b.w && a.w.tier !== b.w.tier) return a.w.tier - b.w.tier; return a.i - b.i; });
}
function pkMap(D, R, x, y, w, h, dataDir) {
  const c = D.cv; c.rect(x, y, w, h, { r: 6, fill: PAL.panel, stroke: PAL.line, lw: 0.6 });
  const T = tehsils(dataDir), pts = R.filter((r) => r.site && isN(+r.site.lat) && isN(+r.site.lon));
  let bb = [60.8, 23.6, 77.9, 37.1]; if (pts.length) { const la = pts.map((r) => +r.site.lat), lo = pts.map((r) => +r.site.lon); const pad = 0.6; bb = [Math.min(...lo) - pad, Math.min(...la) - pad, Math.max(...lo) + pad, Math.max(...la) + pad]; }
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, kx = Math.cos(cy * Math.PI / 180), sx = (w - 16) / ((bb[2] - bb[0]) * kx), sy = (h - 26) / (bb[3] - bb[1]), s = Math.min(sx, sy);
  const pj = (lon, lat) => [x + w / 2 + (lon - cx) * kx * s, y + (h - 12) / 2 - (lat - cy) * s];
  const inside = (p) => p[0] >= x + 1 && p[0] <= x + w - 1 && p[1] >= y + 1 && p[1] <= y + h - 14;
  const clip = (p) => [Math.max(x + 1, Math.min(x + w - 1, p[0])), Math.max(y + 1, Math.min(y + h - 14, p[1]))];
  for (const t of T) { if (t.bb[2] < bb[0] - 1 || t.bb[0] > bb[2] + 1 || t.bb[3] < bb[1] - 1 || t.bb[1] > bb[3] + 1) continue; const d = [];
    for (const r of t.rings) { if (r.length < 4) continue; const st = Math.max(1, Math.floor(r.length / 60)); let k = 0; for (let i = 0; i < r.length; i += st) { const p = pj(r[i][0], r[i][1]); d.push([k++ ? 'L' : 'M', ...clip(p)]); } d.push(['Z']); }
    if (d.length) c.path(d, { fill: PAL.white, stroke: '#C9D2CB', lw: 0.35 }); }
  const lab = []; R.forEach((r, k) => { if (!r.site || !isN(+r.site.lat)) return; const p = pj(+r.site.lon, +r.site.lat); if (!inside(p)) return; const lv = r.w ? r.w.level : null;
    c.circle(p[0], p[1], 5.2, { fill: lv != null ? RAMP[lv] : PAL.white, stroke: PAL.ink, lw: 0.7 }); lab.push([p, k + 1]); });
  for (const [p, n] of lab) { if (lab.length > 25 && n > 25) continue; const t = String(n), tw = D.measure(t, 6.5, true); if (lab.some(([q, m]) => m < n && Math.abs(q[0] - p[0]) < 9 && Math.abs(q[1] - p[1]) < 9)) continue; c.text(p[0] + 6.5, p[1] - 3.5, t, { size: 6.5, b: true, fill: PAL.ink }); void tw; }
  c.text(x + 8, y + h - 4.5, 'Sites by rank, coloured by the highest level in 7 days', { size: 6.8, fill: PAL.mute });
}
function countsBox(D, R, x, y, w) { const c = D.cv, n = [0, 0, 0, 0, 0]; let na = 0; for (const r of R) { if (r.w) n[r.w.level]++; else na++; }
  chartTitle(D, x, y + 10, 'Sites by highest level', null); let yy = y + 18; const bw = (w - 8) / 2;
  for (let lv = 4; lv >= 0; lv--) { const k = 4 - lv, xx = x + (k % 2) * (bw + 8), y2 = yy + Math.floor(k / 2) * 30; c.rect(xx, y2, bw, 25, { r: 4, fill: PAL.white, stroke: RAMP[lv], lw: 1.4 }); c.rect(xx, y2, 5, 25, { r: 2, fill: RAMP[lv] });
    c.text(xx + 12, y2 + 16.5, WORDS[lv], { size: 8.5, b: true, fill: PAL.ink }); c.text(xx + bw - 8, y2 + 17.5, String(n[lv]), { size: 13, b: true, fill: PAL.ink, anchor: 'end' }); }
  const xx = x + bw + 8, y2 = yy + 60; c.rect(xx, y2, bw, 25, { r: 4, fill: PAL.white, stroke: PAL.line, lw: 1 }); c.text(xx + 12, y2 + 16.5, 'No level', { size: 8.5, b: true, fill: PAL.mute }); c.text(xx + bw - 8, y2 + 17.5, String(na), { size: 13, b: true, fill: PAL.ink, anchor: 'end' });
  return { n, na, h: 18 + 90 }; }
function rankRow(r, k) { const A = r.A, d0 = A && A.ok !== false ? (A.days || [])[0] || {} : {}; const rain = A && A.ok !== false ? (A.days || []).filter((d) => fin(d.rainMm)).reduce((s, d) => s + +d.rainMm, 0) : null;
  return [String(k + 1), r.name, A && A.ok !== false ? placeLine(A) : noFc(A), r.w ? WORDS[r.w.level] + (r.w.tier === 2 && r.w.level >= 1 ? ' (indicative)' : '') : 'no level', r.w && r.w.level >= 1 ? r.w.name : '', r.w && r.w.level >= 1 ? dayLab(r.w.date) : '',
    fin(d0.tmaxC) ? t1(+d0.tmaxC) + ' / ' + (fin(d0.tminC) ? t1(+d0.tminC) : '') : '', isN(rain) ? n1(rain) : '']; }
const RANK_COLS = [{ t: '#', w: 0.04, b: true }, { t: 'Site', w: 0.19, b: true }, { t: 'Place', w: 0.21 }, { t: 'Highest, 7 days', w: 0.14 }, { t: 'Hazard', w: 0.13 }, { t: 'First day', w: 0.1 }, { t: 'Today °C', w: 0.1 }, { t: 'Rain 7 d mm', w: 0.09 }];
function siteBlock(D, r, k) {
  const A = r.A, c = D.cv, x = D.M, w = D.cw, ok = A && A.ok !== false; const raised = []; if (ok) for (const h of (A.levels && A.levels.hazards) || []) { if (h.cannot || h.key === 'air') continue; if (h.days.some((d) => d.level != null && d.level >= 1)) raised.push(h); }
  const rowsH = Math.min(3, raised.length), acts = ok ? (A.actions || []).filter((a) => a.action) : []; const act = acts[0] ? clean(acts[0].action) : null;
  const actH = act ? D.paraH(w - 24, 'First action: ' + act, { size: 7.8 }) : 0, h = 40 + rowsH * 16 + (rowsH ? 16 : 12) + actH + 8;
  if (D.y + h > D.H - 50) { D.newPage('sites', 'Sites'); D.y = 34; }
  const y = D.y; c.rect(x, y, w, h, { r: 6, fill: PAL.white, stroke: PAL.line, lw: 0.6 }); c.rect(x, y, 5, h, { r: 2, fill: r.w ? RAMP[r.w.level] : PAL.line });
  c.text(x + 14, y + 15, (k + 1) + '. ' + r.name, { size: 10, b: true, fill: PAL.ink }); const pl = ok ? placeLine(A) : ''; const sector = r.site && r.site.sector ? clean(r.site.sector) : '';
  c.text(x + w - 10, y + 15, [sector, pl].filter(Boolean).join(' · '), { size: 7.6, fill: PAL.mute, anchor: 'end' });
  if (!ok) { D.para(x + 14, y + 22, w - 24, noFc(A) + '.', { size: 8, fill: PAL.mute }); D.y = y + h + 6; return; }
  const d0 = (A.days || [])[0] || {}, SH = A.shown || {};
  const vals = [SH.now && SH.now.value != null ? 'now ' + SH.now.value + ' °C (' + (SH.now.kind === 'measured' ? 'measured' : 'forecast') + ')' : null, fin(d0.tmaxC) ? 'today ' + t1(+d0.tminC) + ' to ' + t1(+d0.tmaxC) + ' °C' : null,
    'rain 7 days ' + n1((A.days || []).filter((d) => fin(d.rainMm)).reduce((s, d) => s + +d.rainMm, 0)) + ' mm', (A.days || []).some((d) => fin(d.gustMaxKmh)) ? 'strongest gust ' + n0(Math.max(...A.days.filter((d) => fin(d.gustMaxKmh)).map((d) => +d.gustMaxKmh))) + ' km/h' : null].filter(Boolean).join(' · ');
  c.text(x + 14, y + 28, vals, { size: 7.8, fill: PAL.ink });
  let yy = y + 36; const days = (A.days || []).map((d) => d.date).slice(0, 7), lw = 110, cw = (w - 24 - lw) / Math.max(1, days.length);
  if (rowsH) { days.forEach((d, i) => { const dd = dObj(d); c.text(x + 14 + lw + i * cw + cw / 2, yy + 8, WD[dd.getUTCDay()] + ' ' + dd.getUTCDate(), { size: 7, fill: PAL.mute, anchor: 'middle' }); }); yy += 12;
    for (const hz of raised.slice(0, 3)) { c.text(x + 14, yy + 10.5, hz.name, { size: 7.8, b: true, fill: PAL.ink });
      days.forEach((d, i) => { const q = hz.days.find((z) => z.date === d); if (!q || q.level == null) return; const xx = x + 14 + lw + i * cw;
        if (hz.tier === 1) c.rect(xx + 1, yy + 1, cw - 2, 13, { r: 2.5, fill: RAMP[q.level] }); else { c.rect(xx + 1, yy + 1, cw - 2, 13, { r: 2.5, fill: PAL.white, stroke: RAMP[q.level], lw: 1.2 }); c.rect(xx + 1, yy + 1, 3, 13, { r: 1, fill: RAMP[q.level] }); }
        c.text(xx + cw / 2, yy + 10.2, WORDS[q.level], { size: 6.8, b: true, fill: q.level >= 3 && hz.tier === 1 ? PAL.white : PAL.ink, anchor: 'middle' }); }); yy += 16; } }
  else { c.text(x + 14, yy + 9, 'Every assessed hazard Normal on all ' + days.length + ' days', { size: 7.8, fill: PAL.mute }); yy += 12; }
  if (act) yy += D.para(x + 14, yy + 2, w - 24, 'First action: ' + act, { size: 7.8, fill: PAL.ink });
  D.y = y + h + 6;
}
export function buildMulti(items, o) {
  const kind = o.kind === 'network' ? 'network' : 'portfolio', kindTitle = KIND_TITLES[kind], view = o.view === 'operator' ? 'operator' : 'customer', id = o.id;
  const R = rankSites(items), okN = R.filter((r) => r.A && r.A.ok !== false).length, D = new Doc({ kind, view });
  const name = clean(o.title || '') || (kind === 'network' ? 'All sites of the network' : 'Client portfolio'), title = kindTitle + ': ' + name + ' (' + R.length + ' site' + (R.length === 1 ? '' : 's') + ')';
  const first = R.find((r) => r.A && r.A.ok !== false), issued = first ? first.A.issuedAt : null, levelsAt = first ? first.A.levelsAt : null;
  const man = { id, kind, view, title, tiles: [], cannotHappen: [], notAssessed: [], sections: D.sections, tables: D.tables, unavailableShown: [], sites: R.map((r) => ({ name: r.name, lat: r.site && r.site.lat, lon: r.site && r.site.lon, worst: r.w ? WORDS[r.w.level] : null, answerId: r.A && r.A.answerId || null })) };
  D.newPage('customer', 'Summary'); const c = D.cv, M = D.M;
  c.rect(0, 0, D.W, 6, { fill: PAL.sea }); c.rect(0, 6, D.W, 2, { fill: PAL.warm });
  c.text(M, 28, 'AI GEO NIGRAAN', { size: 9, b: true, fill: PAL.seaD }); c.text(M + D.measure('AI GEO NIGRAAN', 9, true) + 8, 28, kindTitle, { size: 9, fill: PAL.mute }); c.text(D.W - M, 28, 'Report ' + id, { size: 8.5, b: true, fill: PAL.ink, anchor: 'end' });
  let ts = 19; while (ts > 10 && D.measure(name, ts, true) > D.cw - 190) ts -= 0.5; c.text(M, 52, name, { size: ts, b: true, fill: PAL.ink });
  c.text(M, 66, R.length + ' site' + (R.length === 1 ? '' : 's') + ', each at its own coordinate' + (okN < R.length ? ' (' + (R.length - okN) + ' without a forecast)' : ''), { size: 9, fill: PAL.mute });
  c.text(D.W - M, 44, 'Issued ' + (pkt(o.generatedAt || new Date().toISOString()) || 'not available') + (issued ? ' · forecast of ' + pktShort(issued) : '') + (levelsAt ? ' · levels of ' + pktShort(levelsAt) : ''), { size: 8.5, fill: PAL.mute, anchor: 'end' });
  c.text(D.W - M, 56, (view === 'operator' ? 'Operator view' : 'Customer view') + ' · ' + kindTitle, { size: 8.5, fill: PAL.mute, anchor: 'end' }); D.y = 76;
  const n = [0, 0, 0, 0, 0]; let na = 0; for (const r of R) { if (r.w) n[r.w.level]++; else na++; }
  const top = R[0] && R[0].w && R[0].w.level >= 1 ? R[0] : null;
  const sumText = R.length + ' site' + (R.length === 1 ? '' : 's') + ' screened for the next 7 days: ' + [4, 3, 2, 1, 0].filter((lv) => n[lv]).map((lv) => n[lv] + ' at ' + WORDS[lv]).join(', ') + (na ? ', ' + na + ' with no level' : '') + '. '
    + (top ? 'Highest: ' + top.name + ', ' + top.w.name.toLowerCase() + ' ' + WORDS[top.w.level] + (top.w.tier === 2 ? ' (indicative)' : '') + ' on ' + dayLab(top.w.date) + '.' : 'No site has a hazard above Normal on the days with issued levels.');
  man.summary = { text: sumText, facts: {} };
  { const h = D.paraH(D.cw - 20, sumText, { size: 10 }) + 12; c.rect(M, D.y, D.cw, h, { r: 6, fill: PAL.sandL, stroke: PAL.sand, lw: 0.6 }); D.para(M + 10, D.y + 5, D.cw - 20, sumText, { size: 10, fill: PAL.ink }); D.y += h + 8; }
  { const y = D.y, mw = 300, mh = 210; pkMap(D, R, M, y, mw, mh, o.dataDir); countsBox(D, R, M + mw + 14, y, D.cw - mw - 14); D.y = y + mh + 10; }
  const sec = D.section('Sites ranked by the highest level in the next 7 days', 'customer'); sec.items = R.length;
  /* the ranked table: page 1, then page 2 of the customer part; further rows go with the site blocks */
  { const rows = R.map(rankRow); let i = 0; const size = 7.8, pad = 3.5, ws = RANK_COLS.map((k) => k.w * D.cw);
    const head = () => { let x = M; c.rect(M, D.y, D.cw, 14, { fill: PAL.seaL }); RANK_COLS.forEach((k, j) => { c.text(x + pad, D.y + 10, k.t, { size: 7.6, b: true, fill: PAL.seaD }); x += ws[j]; }); D.y += 14; };
    head(); let custPages = 1;
    for (; i < rows.length; i++) { const cells = rows[i].map((v, j) => D.wrap(v == null ? '' : String(v), ws[j] - 2 * pad, size, !!RANK_COLS[j].b)); const h = Math.max(...cells.map((l) => l.length)) * size * 1.22 + 5;
      if (D.y + h > D.H - 50) { if (custPages >= 2) break; D.newPage('customer', 'Ranked sites'); custPages++; D.y = 34; head(); }
      if (i % 2) c.rect(M, D.y, D.cw, h, { fill: PAL.panel }); const lv = R[i].w ? R[i].w.level : null; if (lv != null) c.rect(M, D.y, 3, h, { fill: RAMP[lv] });
      let x = M; cells.forEach((ls, j) => { ls.forEach((l, q) => c.text(x + pad, D.y + 2.5 + size + q * size * 1.22, l, { size, b: !!RANK_COLS[j].b, fill: PAL.ink })); x += ws[j]; }); c.line(M, D.y + h, M + D.cw, D.y + h, { stroke: PAL.line, lw: 0.4 }); D.y += h; }
    D.tables.push({ title: 'Ranked sites', sig: JSON.stringify(rows.slice(0, i)) });
    if (i < rows.length) { D.y += 4; D.para(M, D.y, D.cw, 'Sites ' + (i + 1) + ' to ' + rows.length + ' follow in the site blocks.', { size: 8, fill: PAL.mute }); }
    /* the network report: the sites by province (and sector when the list carries one) on the customer part when it fits */
    if (kind === 'network') { const prov = {}; for (const r of R) { const p = r.A && r.A.ok !== false ? r.A.place.province || 'Other' : 'No forecast'; const q = prov[p] || (prov[p] = { n: 0, l: [0, 0, 0, 0, 0], na: 0 }); q.n++; if (r.w) q.l[r.w.level]++; else q.na++; }
      const pr = Object.entries(prov).sort((a, b) => b[1].n - a[1].n).map(([p, q]) => [clean(p), String(q.n)].concat([4, 3, 2, 1, 0].map((lv) => q.l[lv] ? String(q.l[lv]) : '')).concat([q.na ? String(q.na) : '']));
      const need = 30 + pr.length * 14; if (D.y + need > D.H - 50 && custPages < 2) { D.newPage('customer', 'Ranked sites'); custPages++; D.y = 34; }
      if (D.y + need <= D.H - 50) { D.y += 12; D.section('Sites by province', 'customer').items = pr.length; table(D, [{ t: 'Province', w: 0.3, b: true }, { t: 'Sites', w: 0.1 }, { t: 'Severe', w: 0.1 }, { t: 'High', w: 0.1 }, { t: 'Moderate', w: 0.1 }, { t: 'Low', w: 0.1 }, { t: 'Normal', w: 0.1 }, { t: 'No level', w: 0.1 }], pr, { title: 'Sites by province', part: 'customer' }); }
      man.byProvince = pr; } }
  /* one compact block per site */
  D.newPage('sites', 'Sites'); D.y = 26; c.text(M, D.y + 10, name + ' · ' + kindTitle + ' · one block per site, in rank order', { size: 8.5, b: true, fill: PAL.mute }); c.text(D.W - M, D.y + 10, 'Issued ' + (pkt(o.generatedAt || new Date().toISOString()) || ''), { size: 8.5, fill: PAL.mute, anchor: 'end' }); D.y += 20;
  D.sections.push({ title: 'Site blocks', part: 'sites', page: D.cv.pages.length, items: R.length });
  R.forEach((r, k) => siteBlock(D, r, k));
  /* appendix */
  D.newPage('appendix', 'Appendix'); D.cv.rect(0, 20, D.W, 46, { fill: PAL.seaL }); D.cv.text(M, 42, 'Appendix', { size: 18, b: true, fill: PAL.seaD });
  D.cv.text(M, 57, 'How the sites are ranked, sources, limitations and the evidence behind each site.', { size: 8.5, fill: PAL.mute }); D.y = 80;
  const ensure = (h) => { if (D.y + h > D.H - 50) { D.newPage('appendix', 'Appendix'); D.y = 34; } };
  const bullet = (m) => { ensure(D.paraH(D.cw - 8, m, { size: 8.4 }) + 4); D.y += D.para(M + 8, D.y, D.cw - 8, m, { size: 8.4 }) + 2; };
  ensure(80); D.section('How the sites are ranked', 'appendix').items = 1;
  for (const m of ['Each site is read at its own coordinate from the same served place answer as its site report (values, the levels of each day, the actions).',
    'Rank: the highest level any hazard reaches at the site in the next 7 days (air quality is shown in each site report, not ranked here), then the number of days at that level, then a verified (Tier 1) level before an indicative (Tier 2) one, then the order of the list.',
    'Tier 1 levels passed their event test and may raise an alert; Tier 2 levels are context or indicative (marked "indicative"). No threshold is set by this report.',
    'Every sentence is written by fixed rules from the figures shown; nothing in this report is written by an AI model.']) bullet('• ' + m);
  D.y += 8; ensure(80); D.section('Sources and limitations', 'appendix').items = 1;
  for (const m of ['Sources: global and regional weather models, the AGN MACH station fleet, satellite rain and land records, terrain and land-cover maps; every dataset with its licence is listed on the Methods & Verification page of NIGRAAN.',
    'Limitations: a forecast is not an observation and not an official warning; follow NDMA / PDMA warnings where they are issued. Levels are for each site and its tehsil, not a site survey. Times are Pakistan time (PKT).']) bullet('• ' + m);
  D.y += 8; ensure(90); D.section('Evidence', 'appendix').items = R.length;
  table(D, [{ t: '#', w: 0.06, b: true }, { t: 'Site', w: 0.3, b: true }, { t: 'Coordinate', w: 0.24 }, { t: 'Place answer', w: 0.4 }], R.map((r, k) => [String(k + 1), r.name, r.site && isN(+r.site.lat) ? (+r.site.lat).toFixed(4) + ' N, ' + (+r.site.lon).toFixed(4) + ' E' : '', r.A && r.A.answerId ? r.A.answerId + ' · ' + (pktShort(r.A.issuedAt) || '') : 'no forecast']),
    { title: 'Evidence', part: 'appendix', size: 7.8 });
  footers(D, { id });
  man.pages = D.cv.pages.length; man.parts = D.parts.slice(); man.customerPages = D.parts.filter((p) => p === 'customer').length;
  man.sections = D.sections.map((s) => ({ title: s.title, part: s.part, page: s.page, items: s.items })); man.tables = D.tables.map((t) => ({ title: t.title, sig: t.sig })); man.actions = [];
  return { cv: D.cv, manifest: man, title };
}
void tagPill; void frame; void MON;
