/* ══ v91.17.283.49 · NIGRAAN 1.0.10 · THE REPORT ENGINE ═════════════════════════════════════════════════════════════════════════════
   ONE engine for every report kind and every page (classic analyst page, start page, Customize, later the React page): it reads ONE
   place answer (placeanswer.mjs, GET /api/place/answer) and lays the report out once (repdraw.mjs) as
     page 1  the dashboard: place map, 7-day hazard tiles (air quality included), heat / rain / gust gauges, the first three actions,
             run time, report id, one summary sentence written by template from the same values the tiles show;
     page 2  charts, one line each: 72-hour meteogram, days 4-15, weeks and season ahead, site screening, river and glacial lakes only
             where they concern the place, a saved scenario;
     then    an appendix behind a divider: Tier 2 context, what is not assessed or cannot happen and why, standing measures, watch list,
             methods, sources, limitations, evidence.
   Two tiers instead of a caveat on every row: Tier 1 = verified forecasts (a level the model gate lets raise an alert: it passed its
   event test), drawn as solid tiles; Tier 2 = context and indicative products, drawn outlined, explained once in the appendix.
   A hazard that cannot happen here gets one "Not relevant here" line and nothing else. A part that is not available is left out or
   printed as "not available (last good: <time>)". No internal paths, table names, server addresses, version or debug text, and no agency
   or supplier name except NDMA / PDMA as the source of the guidance. Text is wrapped, never cut. AGN look: Carlito (Calibri metrics),
   sea green / warm green / sand, hazard colours only on hazard tiles, light grey hatch for "cannot happen". */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Canvas, A4 } from './repdraw.mjs';
import { STANDING_MEASURES } from './report.mjs';   /* v91.17.283.51 g2 · the measure of a hazard issued at Moderate or above */

/* ── the AGN document palette (no blue, no navy) ── */
export const PAL = { ink: '#1F2A24', mute: '#5F6B64', faint: '#8A958E', line: '#D5DCD6', panel: '#F3F6F2', sea: '#5B9AA0', seaD: '#3B6E73', seaL: '#DCEBEC',
  warm: '#7FB069', warmD: '#4E7F3C', warmL: '#E7F1E0', sand: '#E6B655', sandD: '#A9802A', sandL: '#F8EFD7', white: '#FFFFFF' };
export const RAMP = ['#74C476', '#FFE680', '#FDAE61', '#E8552D', '#A50026'];
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
/* US EPA AQI category colours (the published colours of the index; air-quality tiles only) */
const AQI_COL = { 'good': '#00B050', 'moderate': '#FFE14D', 'unhealthy for sensitive groups': '#FF9A3C', 'unhealthy': '#E8452D', 'very unhealthy': '#8F3F97', 'hazardous': '#7E0023' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fin = (x) => x != null && x !== '' && Number.isFinite(Number(x));
const r1 = (x) => Math.round(x * 10) / 10;
const n1 = (x) => fin(x) ? String(r1(+x)) : '';
const n0 = (x) => fin(x) ? String(Math.round(+x)) : '';
const dObj = (ymd) => new Date(String(ymd).slice(0, 10) + 'T12:00:00Z');
const dayLab = (ymd) => { const d = dObj(ymd); return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
const pkt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return null; const d = new Date(t + 5 * 3600e3), p = (n) => String(n).padStart(2, '0');
  return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' PKT'; };
const pktShort = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return null; const d = new Date(t + 5 * 3600e3), p = (n) => String(n).padStart(2, '0');
  return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' PKT'; };
const cap = (s) => { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; };
/* v283.51g3 · the time an action is due, never in the past (live test 51: Clifton "Ready by Tue 3 Nov" for a fog hour already past).
   when: a PKT date (YYYY-MM-DD) or a PKT hour (YYYY-MM-DDTHH:MM). A date before today, or an hour before now, is due now (the prepare-by
   day of an event that starts today or tomorrow); otherwise 'by <day>[, HH:MM]'. '' without a time. */
export function dueText(when, nowMs = Date.now()) {
  const w = String(when || ''); if (!/^\d{4}-\d{2}-\d{2}/.test(w)) return '';
  const nowP = new Date(nowMs + 5 * 3600e3), today = nowP.toISOString().slice(0, 10);
  const hm = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(w);
  if (hm) { const ms = Date.parse(w.slice(0, 16) + ':00Z') - 5 * 3600e3; return !Number.isFinite(ms) ? '' : ms <= nowMs ? 'now' : 'by ' + dayLab(w) + ', ' + hm[1] + ':' + hm[2]; }
  return w.slice(0, 10) < today ? 'now' : 'by ' + dayLab(w); }

/* ── words that never reach a report: server addresses, file names and paths, table names, endpoint paths, version and debug text,
   agency and supplier names (NDMA / PDMA stay: they are the source of the guidance) ── */
const AGENCY = /\b(PMD|FFD|IRSA|EPD|SUPARCO|WAPDA|ECMWF|NOAA|NASA|USGS|ESA|Copernicus|CAMS|CHIRPS|IMERG|GPM|GloFAS|HydroBASINS|HMAGLOFDB|Hi-MAG|Open-Meteo|ERA5(?:-Land)?|SEAS5|EC46|IFS|ENS|AIFS|GFS|ICON|SoilGrids|WorldCover|MODIS|VIIRS|FIRMS|SMAP|Sentinel-\d|Landsat|Space4Climate|Visual Crossing|Ogimet|IEM)\b/g;
export function clean(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/https?:\/\/\S+/g, '').replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\S*/gi, '');
  t = t.replace(/(?:^|\s|\()\/(?:api|n3|px|tiles)\/[\w/.\-?=&%]*/g, ' ');
  t = t.replace(/\b[\w.-]+(?:[\\/][\w.-]+)+\.(?:json|jsonl|mjs|js|csv|py|parquet|gz|npz|npy|html|txt|md|ps1|bat)\b/g, '').replace(/\b[\w-]+\.(?:json|jsonl|mjs|csv|py|parquet|npz|npy)\b/g, '');
  t = t.replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,}\b/g, '');
  /* v91.17.283.52 D · N21: inventory ids of lakes and the like (SLI-0805, NLI-2265) and ISO week ids (2026-W43) are not printed */
  t = t.replace(/\b(?!SHA-|PM-)[A-Z]{2,5}-\d{3,6}\b\s?/g, '').replace(/\b(unnamed lake)\s+(near\b)/gi, '$1 $2').replace(/\b(?:week\s+)?(\d{4})-W(\d{2})\b/gi, (m, y, w) => { const j4 = new Date(Date.UTC(+y, 0, 4)), mon = new Date(j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 864e5 + (+w - 1) * 7 * 864e5); return 'the week of ' + mon.getUTCDate() + ' ' + MON[mon.getUTCMonth()]; });
  t = t.replace(/\(?\bv\d+(?:\.\d+){2,}\b\)?/g, '').replace(/\b(?:gate|build|rcm|pm25c|river-link|rain-classes|place-record|hazard-count|point|pointstate)-[\d.]+\b/gi, '').replace(/\b\d{2}\.\d{2}\.\d{3}(?:\.\d+)?\b/g, '');
  t = t.replace(AGENCY, '');
  t = t.replace(/\s*\b(?:[A-Z]{2,5}-\d+(?:\.\d+)?N\d+(?:\.\d+)?E|GL\d{6}E\d{5}N)\b/g, '');   /* v91.17.283.49 merge: glacial-lake inventory ids (EVS-36.04N74.63E, GL074284E35813N) are not names */
  t = t.replace(/\(\s*[,;]?\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').replace(/([,;])\s*([,;])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,;:]+/, '').trim();
  return t;
}

/* ══ the layout helper: a cursor on A4 pages, wrapping with measured widths ══ */
class Doc {
  constructor(meta) { this.cv = new Canvas(); this.M = 34; this.W = A4.w; this.H = A4.h; this.meta = meta; this.parts = []; this.sections = []; this.tables = []; this.y = 0; }
  get cw() { return this.W - 2 * this.M; }
  newPage(part, label) { this.cv.page({ part, label }); this.parts.push(part); this.y = 40; return this.cv.cur; }
  measure(s, size, b) { return this.cv.measure(s, size, b); }
  wrap(text, w, size, b) {
    const words = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), out = []; let cur = '';
    for (let wd of words) {
      while (this.measure(wd, size, b) > w) { /* a word wider than the box is split, never cut */ let k = wd.length - 1; while (k > 1 && this.measure(wd.slice(0, k), size, b) > w) k--; if (cur) { out.push(cur); cur = ''; } out.push(wd.slice(0, k)); wd = wd.slice(k); }
      const t = cur ? cur + ' ' + wd : wd; if (this.measure(t, size, b) <= w) cur = t; else { if (cur) out.push(cur); cur = wd; } }
    if (cur) out.push(cur); return out;
  }
  /* a wrapped paragraph at (x, y top); returns the height used */
  para(x, y, w, text, o = {}) { const size = o.size || 9, lh = o.lh || size * 1.28, lines = this.wrap(text, w, size, o.b);
    lines.forEach((l, i) => this.cv.text(x, y + size + i * lh, l, { size, b: o.b, fill: o.fill || PAL.ink, anchor: o.anchor }));
    return lines.length ? (lines.length - 1) * lh + size * 1.3 : 0; }
  paraH(w, text, o = {}) { const size = o.size || 9, lh = o.lh || size * 1.28, n = this.wrap(text, w, size, o.b).length; return n ? (n - 1) * lh + size * 1.3 : 0; }
  room() { return this.H - 46 - this.y; }
  section(title, part, o = {}) { const at = { page: this.cv.pages.length, ops: this.cv.cur ? this.cv.cur.ops.length : 0, args: [title, part, o] };
    this.sections.push({ title, part, page: this.cv.pages.length, items: 0 }); const c = this.cv; this._sec = { ...at, entry: this.sections[this.sections.length - 1] };
    c.text(this.M, this.y + 12, title, { size: o.size || 12.5, b: true, fill: PAL.seaD }); if (o.tag) { const tw = this.measure(title, o.size || 12.5, true); tagPill(this, this.M + tw + 8, this.y + 2.5, o.tag); }
    if (o.line !== false) c.line(this.M, this.y + 17, this.W - this.M, this.y + 17, { stroke: PAL.line, lw: 0.6 });
    this.y += 23; this._sec.yEnd = this.y; return this.sections[this.sections.length - 1]; }
}
function tagPill(D, x, y, t) { const w = D.measure(t, 7, true) + 10; D.cv.rect(x, y, w, 11, { r: 5.5, fill: t.startsWith('Tier 1') ? PAL.warmL : PAL.sandL, stroke: t.startsWith('Tier 1') ? PAL.warm : PAL.sand, lw: 0.5 });
  D.cv.text(x + w / 2, y + 8, t, { size: 7, b: true, fill: t.startsWith('Tier 1') ? PAL.warmD : PAL.sandD, anchor: 'middle' }); return w; }

/* ── a table: header row, wrapped cells, page breaks with the header repeated; returns rows drawn ── */
function table(D, cols, rows, o = {}) {
  const size = o.size || 8.4, pad = 4, x0 = D.M, W = D.cw, ws = cols.map((c) => c.w * W);
  const head = () => { let x = x0; D.cv.rect(x0, D.y, W, 15, { fill: PAL.seaL }); cols.forEach((c, i) => { D.cv.text(x + pad, D.y + 10.5, c.t, { size: 8, b: true, fill: PAL.seaD }); x += ws[i]; }); D.y += 15; };
  D.tables.push({ title: o.title || cols.map((c) => c.t).join('|'), sig: JSON.stringify(rows) });
  /* v283.51g3 · live test 51 (Gilgit): a table header was left alone at the foot of page 3, its rows on page 4. The header starts a page
     unless it fits with its first two rows (or its only row); a section heading drawn just before it (nothing in between) moves with it */
  { const rowH = (r) => Math.max(...r.map((v, i) => D.wrap(v == null ? '' : String(v), ws[i] - 2 * pad, size, cols[i].b).length)) * size * 1.25 + 6;
    const need = 15 + rows.slice(0, 2).reduce((a, r) => a + rowH(r), 0);
    if (rows.length && D.y + need > D.H - 50 && D.y > 60) {
      const S = D._sec, stranded = !!(S && S.page === D.cv.pages.length && S.yEnd === D.y && D.cv.cur && D.cv.cur.ops.length >= S.ops);
      if (stranded) { D.cv.cur.ops.length = S.ops; const k = D.sections.indexOf(S.entry); if (k >= 0) D.sections.splice(k, 1); }
      D.newPage(o.part || 'appendix', o.title);
      if (stranded) { const e = D.section(...S.args); e.items = S.entry.items; S.entry.page = e.page; D._moved = (D._moved || 0) + 1; } } }
  head();
  rows.forEach((r, ri) => {
    const cells = r.map((v, i) => D.wrap(v == null ? '' : String(v), ws[i] - 2 * pad, size, cols[i].b));
    const h = Math.max(...cells.map((l) => l.length)) * size * 1.25 + 6;
    if (D.y + h > D.H - 50) { D.newPage(o.part || 'appendix', o.title); head(); }
    if (ri % 2) D.cv.rect(x0, D.y, W, h, { fill: PAL.panel });
    let x = x0; cells.forEach((ls, i) => { ls.forEach((l, k) => D.cv.text(x + pad, D.y + 3 + size + k * size * 1.25, l, { size, b: cols[i].b, fill: cols[i].mute ? PAL.mute : PAL.ink })); x += ws[i]; });
    D.cv.line(x0, D.y + h, x0 + W, D.y + h, { stroke: PAL.line, lw: 0.4 }); D.y += h; });
  return rows.length;
}

/* ══ facts drawn from the answer ══ */
function tileRows(A) {
  const H = (A.levels && A.levels.hazards) || [], rows = [], notAssessed = [];
  for (const h of H) {
    if (h.cannot) continue;
    if (h.key === 'air') continue;
    const any = h.days.some((d) => d.level != null);
    if (!any) { const d = h.days.find((x) => x.why) || h.days[0] || {}; notAssessed.push({ key: h.key, name: h.name, state: d.state, why: d.why || null }); continue; }
    rows.push(h);
  }
  /* v91.17.283.51 g2 · a hazard that can happen here but has no issued day level (coastal heat and surge, tropical cyclone): named, never left out */
  for (const x of A.noLevel || []) if (!notAssessed.some((r) => r.key === x.key)) notAssessed.push({ key: x.key, name: x.name, state: 'no_level', why: 'can happen here' + (x.why && !/^can happen/i.test(x.why) ? ' (' + x.why + ')' : '') + '; no tested day level is issued for it, so it is not on the hazard tiles' });
  return { rows, notAssessed };
}
function airRow(A) {
  const air = A.air, H = ((A.levels && A.levels.hazards) || []).find((h) => h.key === 'air');
  const served = H && H.days.some((d) => d.level != null) ? H : null;
  if (!air || !air.days || !air.days.length) return served ? { served, days: [] } : null;
  return { served, days: air.days, stale: air.stale, at: air.at };
}
const SHORT_WHY = (r) => { const w = String(r.why || '').toLowerCase(), s = r.state;
  if (r.key === 'wind' || /ladder|breakpoint/.test(w)) return 'no tested gust level';
  if (r.key === 'flood' && /gauge/.test(w)) return 'no gauged river reach';
  if (s === 'no_reach' || /no gauged/.test(w)) return 'no gauged river reach';
  if (/screening only/.test(w)) return 'screening only, no tested level here';
  if (s === 'not_tested') return 'level not tested here';
  if (s === 'input_not_current') return 'input not current';
  if (s === 'outside') return 'outside the method range';
  if (s === 'no_level') return 'can happen here, no tested day level';
  /* v283.51g3 · live test 51 (Mithi): a hazard the applicability rule leaves open carries that rule's own sentence on its days ("No local
     steep ground; debris from nearby slopes possible"); page 1 printed "no level issued for these days" instead. A short reason of the
     row is printed as it is; only a row without one falls back to the generic words */
  { const t = clean(r.why || '').trim(); if (t && t.length <= 100) return t[0].toLowerCase() + t.slice(1).replace(/\.$/, ''); }
  return 'no level issued for these days'; };

/* the place as a title: "Near I-8 Markaz Ground" (the distance stays in the place line) */
const LATIN = (s) => !!s && /^[\u0020-\u024F\u2010-\u2027\u00B0]+$/.test(String(s));
/* v91.17.283.52 D · N20 / #104: the report names the place in plain words: the name the person picked (request name), else the nearest named
   place, without "Near", a distance or a compass bearing ("Near I-8/4 · 0.2 km from I-8/4", "1.2 km WNW of Mian Mir Lines" -> "I-8/4",
   "Mian Mir Lines"); a place-table spelling of the tehsil or district name is printed in the official spelling (Shekhupura -> Sheikhupura) */
const lev = (a, b) => { a = a.toLowerCase(); b = b.toLowerCase(); if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
export function officialSpelling(name, P) { const n = String(name || ''); if (!P) return n;
  return n.replace(/[A-Za-z][A-Za-z'-]{4,}/g, (w) => { for (const o of [P.tehsil, P.district]) { const ow = String(o || '').split(/\s+/).find((x) => x.length >= 5 && x[0].toLowerCase() === w[0].toLowerCase() && lev(x, w) > 0 && lev(x, w) <= 2); if (ow) return ow; } return w; }); }
export function plainName(s) { return String(s || '').replace(/^near\s+/i, '').replace(/\s*\(\d+(?:\.\d+)?\s*km(?:\s+[NSEW]{1,3})?\)\s*$/i, '').replace(/^\d+(?:\.\d+)?\s*km\s+(?:[NSEW]{1,3}\s+)?(?:of|from)\s+/i, '').trim(); }
export function placeName(P) {
  if (P.asked && LATIN(P.asked)) return officialSpelling(plainName(P.asked), P);
  if (P.near && LATIN(P.near.name)) return officialSpelling(plainName(P.near.name), P);
  const n = plainName(P.name);
  if (LATIN(n) && n && !/^\d+(?:\.\d+)?\s*km\b/.test(n) && !/^selected point$/i.test(n)) return officialSpelling(n, P);
  return P.tehsil || 'The report point'; }
/* the one summary sentence: written by template from the values the tiles and the value rows show */
export function summaryOf(A, T, AQ) {
  const place = placeName(A.place), days = A.days || [], parts = [];
  const shown = new Set(days.slice(0, 7).map((d) => d.date));   /* v91.17.283.50 · the summary names only the days the tiles show (tiles(): days 0-6) */
  let worst = []; for (const h of T.rows) for (const d of h.days) if (d.level != null && d.level >= 1 && shown.has(d.date)) worst.push({ name: h.name, lvl: d.level, date: d.date, tier: h.tier });
  const facts = { hazards: [], air: null };
  if (!worst.length) parts.push('no hazard above Normal on the days with issued levels');
  else { const by = {}; for (const w of worst) { const b = by[w.name]; if (!b || w.lvl > b.lvl) by[w.name] = { ...w, dates: [] }; } for (const w of worst) if (by[w.name].lvl === w.lvl) by[w.name].dates.push(w.date);
    const L = Object.values(by).sort((a, b) => b.lvl - a.lvl || a.tier - b.tier).slice(0, 3);
    parts.push(L.map((b) => b.name.toLowerCase() + ' ' + WORDS[b.lvl] + (b.tier === 2 ? ' (indicative)' : '') + ' on ' + datesText(b.dates)).join(', '));
    facts.hazards = L.map((b) => ({ name: b.name, word: WORDS[b.lvl], dates: b.dates })); }
  const inWin = shown;   /* v91.17.283.49 merge: air quality is summarised only on the days the tiles show (a stale air forecast's past days are left out; linter L11) */
  if (AQ && AQ.served) { const w = AQ.served.days.filter((d) => d.level != null && inWin.has(d.date)); const mx = w.reduce((m, d) => Math.max(m, d.level), -1);
    if (mx >= 0) { const dd = w.filter((d) => d.level === mx).map((d) => d.date); parts.push('air quality ' + WORDS[mx] + ' on ' + datesText(dd)); facts.air = { word: WORDS[mx], dates: dd }; } }
  else if (AQ && AQ.days.length) { const ord = ['good', 'moderate', 'unhealthy for sensitive groups', 'unhealthy', 'very unhealthy', 'hazardous'];
    const c = AQ.days.filter((d) => d.category && inWin.has(d.date)); const mx = c.reduce((m, d) => Math.max(m, ord.indexOf(String(d.category).toLowerCase())), -1);
    if (mx >= 0) { const dd = c.filter((d) => ord.indexOf(String(d.category).toLowerCase()) === mx), aq = Math.max(...dd.map((d) => d.aqi || 0));
      parts.push('air quality ' + ord[mx] + (aq ? ' (AQI up to ' + aq + ')' : '') + ' on ' + (dd.length === c.length && dd.length > 2 ? 'all ' + dd.length + ' forecast days' : datesText(dd.map((d) => d.date))));
      facts.air = { word: cap(ord[mx]), dates: dd.map((d) => d.date), aqiMax: aq }; } }
  const tx = days.filter((d) => fin(d.tmaxC)), tn = days.filter((d) => fin(d.tminC));
  if (tx.length) { const a = tx.reduce((m, d) => (+d.tmaxC > +m.tmaxC ? d : m)), b = tn.reduce((m, d) => (+d.tminC < +m.tminC ? d : m), tn[0]);
    parts.push('highest ' + n1(a.tmaxC) + ' °C on ' + dayLab(a.date) + (b ? ', lowest ' + n1(b.tminC) + ' °C on ' + dayLab(b.date) : '')); facts.tmax = { v: +a.tmaxC, date: a.date }; if (b) facts.tmin = { v: +b.tminC, date: b.date }; }
  const rn = days.filter((d) => fin(d.rainMm)); const tot = rn.reduce((s, d) => s + +d.rainMm, 0);
  if (rn.length) { if (tot < 1) parts.push('dry'); else { const w = rn.reduce((m, d) => (+d.rainMm > +m.rainMm ? d : m)); parts.push(n0(tot) + ' mm of rain in ' + rn.length + ' days, most (' + n0(w.rainMm) + ' mm) on ' + dayLab(w.date)); facts.rain = { total: r1(tot), max: +w.rainMm, date: w.date }; } }
  return { text: place + ', next ' + Math.max(days.length, 1) + ' days: ' + parts.join('; ') + '.', facts };
}
function datesText(ds) { const u = [...new Set(ds)].sort(); if (!u.length) return ''; if (u.length === 1) return dayLab(u[0]);
  const consec = u.every((d, i) => !i || (Date.parse(d) - Date.parse(u[i - 1])) === 864e5); if (consec) return dayLab(u[0]) + ' to ' + dayLab(u[u.length - 1]);
  return u.slice(0, -1).map(dayLab).join(', ') + ' and ' + dayLab(u[u.length - 1]); }

/* the first three actions: forecast-triggered, then NDMA / PDMA guidance, then standing measures (each with its own action text) */
/* v91.17.283.51 g2 · live test 51 (Quetta: Drought High on 4 days, no drought or water action anywhere): every hazard issued at Moderate or
   above on the days the tiles show gets an action: the forecast or guidance action when there is one, otherwise the standing measure of
   that hazard (STANDING_MEASURES, report.mjs) with the issued level and its days as the why */
const HZ_MEASURE = { heat: 'heat', cold: 'cold', rain: 'monsoon', flood: 'riverine', landslide: 'slope', glof: 'glof', drought: 'drought', air: 'smog', coastal: 'coastal' };
const hzWord = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0];
export function levelActions(A, have) {
  const shown = new Set((A.days || []).slice(0, 7).map((d) => d.date)), out = [];
  for (const h of (A.levels && A.levels.hazards) || []) { if (h.cannot) continue;
    const ds = (h.days || []).filter((d) => d.level != null && d.level >= 2 && shown.has(d.date)); if (!ds.length) continue;
    if ((have || []).some((a) => hzWord(a.title) === hzWord(h.name) || (h.key === 'air' && /air|smog/i.test(a.title || '')))) continue;
    const id = HZ_MEASURE[h.key], m = id && STANDING_MEASURES[id]; if (!m) continue;
    const mx = Math.max(...ds.map((d) => d.level)), dd = ds.filter((d) => d.level === mx).map((d) => d.date);
    out.push({ title: h.name, action: clean(m.measure), trigger: h.name + ' ' + WORDS[mx] + (h.tier === 2 ? ' (indicative)' : '') + ' on ' + datesText(dd), when: dd[0], tier: h.tier || 2, source: 'level', hazardKey: h.key }); }
  return out;
}
/* v283.51g3 · the station check of the hottest day (siterisk.mjs, data/heat-rl-check.json: 37 ISD stations 2017-2024) as it was applied at
   this site: the group offset when one was added, the coastal case when the site is in the coastal group (no offset there), nothing when the
   check file is not installed (then no check is claimed) */
function heatCheckLine(A) {
  const r = ((A.siteScreening && A.siteScreening.rows) || []).find((x) => x && x.parameter === 'Extreme heat'), c = r && r.stationCheck;
  if (!c || !c.group) return '';
  if (c.offsetC) return ' At this site the hottest-day values include the station-check offset of ' + (c.offsetC > 0 ? '+' : '') + n1(c.offsetC) + ' °C (' + (c.group === 'mountain' ? 'sites above 1,300 m' : 'sites at 500-1,300 m') + ': the long-record value read this much low against station records, 2017-2024).';
  if (c.group === 'coast') return ' This site is in the coastal group of the station check (within 60 km of the sea): the stations there disagree in sign, so no offset is applied.';
  return ''; }
export function topActions(A) {
  const out = [], seen = new Set();
  const add = (a) => { const k = clean(a.action).slice(0, 60); if (!a.action || seen.has(k)) return; seen.add(k); out.push(a); };
  for (const a of A.actions || []) add({ title: a.hazard, action: clean(a.action), trigger: clean(a.trigger), when: a.when, tier: a.tier, source: a.source, sourceName: a.sourceName ? a.sourceName.replace(AGENCY, '').trim() : null });
  for (const a of levelActions(A, out)) add(a);
  for (const s of standingRows(A)) add({ title: standingTitle(s.id), action: clean(s.measure), trigger: clean(s.why), when: null, tier: 2, source: 'standing' });
  return out.slice(0, 3);
}
/* the standing measures that apply: each with its own action, none for a hazard that cannot happen here */
const ST_HZ = { slope: 'landslide', glof: 'glof', coastal: 'coastal', riverine: 'flood_riverine' };
/* v91.17.283.51 g2 · a seasonal percentile row (stat, report.mjs standing) is compared with the forecast days of the same report: when the
   forecast is past it, the row says so (live test 51: "1 in 10 day of 25.9 °C" while all 7 forecast days were warmer, said nothing) */
function statNote(s, A) { const S = s.stat; if (!S || !fin(S.value)) return '';
  const D = (A.days || []).slice(0, 7);
  if (S.stat === 'tx90') { const n = D.filter((d) => fin(d.tmaxC) && +d.tmaxC > S.value).length; return n ? '; the forecast is above it on ' + n + ' of the next ' + D.length + ' days: unusually warm for the time of year' : ''; }
  if (S.stat === 'tn10') { const n = D.filter((d) => fin(d.tminC) && +d.tminC < S.value).length; return n ? '; the forecast is below it on ' + n + ' of the next ' + D.length + ' nights: unusually cold for the time of year' : ''; }
  if (S.stat === 'pr3_99') { let mx = 0; for (let i = 0; i + 2 < D.length; i++) { const t = [0, 1, 2].reduce((a, k) => a + (fin(D[i + k].rainMm) ? +D[i + k].rainMm : 0), 0); mx = Math.max(mx, t); } return mx > S.value ? '; the forecast reaches it (' + n1(mx) + ' mm in three days)' : ''; }
  return ''; }
export function standingRows(A) { const C = new Set((A.cannotHappen || []).map((x) => x.key));
  return (A.standing || []).filter((s) => s.measure && s.measure !== s.why && !(ST_HZ[s.id] && C.has(ST_HZ[s.id]))).map((s) => (s.stat ? { ...s, why: String(s.why || '') + statNote(s, A) } : s)); }
const STANDING_TITLE = { heat: 'Heat season', monsoon: 'Wet season', cold: 'Cold season', smog: 'Smog season', dust: 'Dust season', riverine: 'River floodplain', ponding: 'Ponding ground', slope: 'Steep ground', glof: 'Glacial lake corridor', seismic: 'Seismic zone', coastal: 'Coastal exposure', drought: 'Dry season' };
const standingTitle = (id) => STANDING_TITLE[id] || cap(id);

/* ══ drawing pieces ══ */
function header(D, A, o) {
  const c = D.cv, M = D.M;
  c.rect(0, 0, D.W, 6, { fill: PAL.sea }); c.rect(0, 6, D.W, 2, { fill: PAL.warm });
  c.text(M, 28, 'AI GEO NIGRAAN', { size: 9, b: true, fill: PAL.seaD }); c.text(M + D.measure('AI GEO NIGRAAN', 9, true) + 8, 28, o.title, { size: 9, fill: PAL.mute });
  c.text(D.W - M, 28, 'Report ' + o.id, { size: 8.5, b: true, fill: PAL.ink, anchor: 'end' });
  const name = placeName(A.place);
  const run = issuedLine(A, o);
  let ts = 19; const room = D.W - 2 * M - Math.max(D.measure(run, 8.5), 150) - 14;
  while (ts > 9 && D.measure(name, ts, true) > room) ts -= 0.5;
  c.text(M, 52, name, { size: ts, b: true, fill: PAL.ink });
  const sub = [A.place.tehsil ? A.place.tehsil + ' tehsil' : null, A.place.district && A.place.district !== A.place.tehsil ? A.place.district + ' district' : null, A.place.province].filter(Boolean).join(', ')
    + ' · ' + Math.abs(A.place.lat).toFixed(4) + '° N, ' + Math.abs(A.place.lon).toFixed(4) + '° E' + (fin(A.place.elevM) ? ' · ' + n0(A.place.elevM) + ' m' : '');
  c.text(M, 66, sub, { size: 9, fill: PAL.mute });
  c.text(D.W - M, 44, run, { size: 8.5, fill: PAL.mute, anchor: 'end' });
  c.text(D.W - M, 56, (o.view === 'operator' ? 'Operator view' : 'Customer view') + ' · ' + o.kindTitle, { size: 8.5, fill: PAL.mute, anchor: 'end' });
  D.y = 76;
}
/* v91.17.283.51 g2 · live test 51: reports built at 15:47-15:48 PKT were stamped "Issued 15:43" (the place forecast's own time). Issued is
   now the time the report is made; the forecast it reads keeps its own time beside it ("forecast of"), the model run is in the Evidence */
export function runAt(A) { const r = A && A.run ? String(A.run).split('~')[0] : null; if (!r) return null; const s = /Z$|[+-]\d\d:?\d\d$/.test(r) ? r : r.length <= 13 ? r + ':00Z' : r.length <= 16 ? r + ':00Z' : r + 'Z'; return Number.isFinite(Date.parse(s)) ? s : null; }
function issuedLine(A, o) { return 'Issued ' + (pkt(o.generatedAt) || 'not available') + (A.issuedAt ? ' · forecast of ' + pktShort(A.issuedAt) : '') + (A.levelsAt ? ' · levels of ' + pktShort(A.levelsAt) : ''); }
/* v91.17.283.51 g2 · ONE RAIN BASIS (live test 51, Gilgit: "dry" and 0 mm every day on page 1, 2.9 mm in 72 h on page 2, 26 mm in the
   watch list): the served day total is the tested one (in the mountains, days 1-3 are the station quantile mapping of the model total,
   rainamount.mjs); the hourly bars were the raw model hours. Each hour is now scaled by its day's served / raw ratio (the day of an hour
   is the PKT day of the hour it ends, pktday.mjs rule), so the hours of a day add up to the served day total everywhere in the report */
export function servedRain(A) {
  const f = {}; for (const d of A.days || []) if (fin(d.rainMm) && fin(d.rainMmRaw)) f[d.date] = +d.rainMmRaw > 0 ? +d.rainMm / +d.rainMmRaw : 1;
  if (!Object.keys(f).length) return A;
  const dayOf = (t) => { const ms = Date.parse(String(t).slice(0, 16) + ':00Z'); return Number.isFinite(ms) ? new Date(ms - 3600e3).toISOString().slice(0, 10) : String(t).slice(0, 10); };
  return { ...A, hours: (A.hours || []).map((h) => { const k = f[dayOf(h.time)]; return k != null && fin(h.rainMm) ? { ...h, rainMm: Math.round(+h.rainMm * k * 100) / 100, rainMmModel: +h.rainMm } : h; }) };
}
export function rain72(A) { const H = (A.hours || []).slice(0, 72).filter((h) => fin(h.rainMm)); return H.length ? r1(H.reduce((s, h) => s + +h.rainMm, 0)) : null; }
function footers(D, o) {
  const n = D.cv.pages.length;
  D.cv.pages.forEach((p, i) => { const save = D.cv.cur; D.cv.cur = p; const y = D.H - 22;
    D.cv.line(D.M, y - 10, D.W - D.M, y - 10, { stroke: PAL.line, lw: 0.5 });
    D.cv.text(D.M, y, 'AI GEO NIGRAAN · AI Geo Navigators (Private) Limited · www.aigeo360.com', { size: 7.5, fill: PAL.faint });
    D.cv.text(D.W - D.M, y, 'Report ' + o.id + ' · page ' + (i + 1) + ' of ' + n, { size: 7.5, fill: PAL.faint, anchor: 'end' });
    D.cv.cur = save; });
}

/* the place map: the tehsils around the point, the place's own tehsil outlined, a 10 km bar */
let TEH = null;
function tehsils(dataDir) { if (TEH) return TEH; for (const f of ['pk-tehsils-n3.json', 'pk-tehsils.json']) { const p = join(dataDir, f); if (existsSync(p)) { try { TEH = JSON.parse(readFileSync(p, 'utf8')).features.map((ft) => {
  const g = ft.geometry; const rings = g ? (g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []) : []; const bb = [180, 90, -180, -90];
  for (const r of rings) for (const c of r) { if (c[0] < bb[0]) bb[0] = c[0]; if (c[1] < bb[1]) bb[1] = c[1]; if (c[0] > bb[2]) bb[2] = c[0]; if (c[1] > bb[3]) bb[3] = c[1]; }
  return { uid: ft.properties.uid, name: ft.properties.tehsil || ft.properties.key, rings, bb }; }); return TEH; } catch (_) {} } } return (TEH = []); }
function inRing(r, lon, lat) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (((a[1] > lat) !== (b[1] > lat)) && (lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function placeMap(D, A, x, y, w, h, dataDir) {
  const c = D.cv, P = A.place; c.rect(x, y, w, h, { r: 6, fill: PAL.panel, stroke: PAL.line, lw: 0.6 });
  const T = tehsils(dataDir); if (!T.length || !fin(P.lat)) { D.para(x + 10, y + h / 2 - 8, w - 20, 'Map not available for this report.', { size: 8.5, fill: PAL.mute }); return; }
  const kx = Math.cos(P.lat * Math.PI / 180), spanY = 0.42, spanX = spanY * (w / h) / kx;
  const bb = [P.lon - spanX, P.lat - spanY, P.lon + spanX, P.lat + spanY], s = (h - 8) / (2 * spanY);
  const pj = (lon, lat) => [x + w / 2 + (lon - P.lon) * kx * s, y + h / 2 - (lat - P.lat) * s];
  const near = T.filter((t) => !(t.bb[2] < bb[0] || t.bb[0] > bb[2] || t.bb[3] < bb[1] || t.bb[1] > bb[3]));
  const own = near.find((t) => t.uid === P.unitId) || near.find((t) => t.rings.some((r) => inRing(r, P.lon, P.lat)));
  const clipPt = (p) => [Math.max(x + 1, Math.min(x + w - 1, p[0])), Math.max(y + 1, Math.min(y + h - 1, p[1]))];
  const pathOf = (t) => { const d = []; for (const r of t.rings) { const st = r.length > 600 ? 3 : r.length > 200 ? 2 : 1; for (let i = 0; i < r.length; i += st) { const p = clipPt(pj(r[i][0], r[i][1])); d.push([i ? 'L' : 'M', p[0], p[1]]); } d.push(['Z']); } return d; };
  for (const t of near) if (t !== own) c.path(pathOf(t), { fill: PAL.white, stroke: '#B9C4BD', lw: 0.6 });
  if (own) c.path(pathOf(own), { fill: PAL.seaL, stroke: PAL.seaD, lw: 1.4 });
  const placed = [];
  /* the place marker and its label first; the neighbours' names keep clear of them */
  const p = pj(P.lon, P.lat); const nm = own ? own.name + ' tehsil' : (P.tehsil || ''); let lab = null;
  if (nm) { const tw = D.measure(nm, 7.5, true) + 8; const lx = Math.min(x + w - tw - 4, Math.max(x + 4, p[0] - tw / 2)), ly = p[1] + 10 > y + h - 30 ? p[1] - 22 : p[1] + 9; lab = [lx, ly, tw];
    placed.push([lx + tw / 2, ly + 6, tw + 6, 18]); }
  placed.push([p[0], p[1], 34, 30]);
  for (const t of near) { if (t === own) continue; const r = t.rings.reduce((a, b) => (b.length > a.length ? b : a), []); if (!r.length) continue; let cx = 0, cy = 0; r.forEach((q) => { cx += q[0]; cy += q[1]; });
    const q = pj(cx / r.length, cy / r.length), tw = D.measure(t.name, 7, false); if (q[0] - tw / 2 < x + 4 || q[0] + tw / 2 > x + w - 4 || q[1] < y + 12 || q[1] > y + h - 26) continue;
    if (placed.some((b) => Math.abs(b[0] - q[0]) < (b[2] + tw) / 2 + 3 && Math.abs(b[1] - (q[1] - 2.5)) < ((b[3] || 9) + 9) / 2 + 1)) continue; placed.push([q[0], q[1] - 2.5, tw, 9]); c.text(q[0], q[1], t.name, { size: 7, fill: PAL.faint, anchor: 'middle' }); }
  c.circle(p[0], p[1], 8, { fill: PAL.sand, op: 0.35 }); c.circle(p[0], p[1], 4, { fill: PAL.sandD, stroke: PAL.white, lw: 1.2 });
  if (lab) { const [lx, ly, tw] = lab; c.rect(lx, ly, tw, 12, { r: 3, fill: PAL.white, stroke: PAL.seaD, lw: 0.5 }); c.text(lx + tw / 2, ly + 8.6, nm, { size: 7.5, b: true, fill: PAL.seaD, anchor: 'middle' }); }
  const px = 10 * s / 111.32 * kx * (1 / kx); /* 10 km on the ground at this latitude (east-west) */ const bar = 10 / (111.32 * kx) * kx * s;
  c.rect(x + 6, y + h - 20, bar + 40, 14, { r: 3, fill: PAL.white, op: 0.9 }); c.line(x + 10, y + h - 11, x + 10 + bar, y + h - 11, { stroke: PAL.ink, lw: 1.6 }); c.text(x + 14 + bar, y + h - 9, '10 km', { size: 7, fill: PAL.ink });
  void px;
}

/* a gauge: half dial, neutral bands (the hazard colours stay on the tiles), level words at their cuts */
function gauge(D, x, y, w, h, o) {
  const c = D.cv, cx = x + w / 2, cy = y + h - 38, R = Math.min(w / 2 - 12, h - 60);   /* v91.17.283.52 D · #103: 8 pt more room under the value for a two-line caption */
  c.rect(x, y, w, h, { r: 6, fill: PAL.white, stroke: PAL.line, lw: 0.6 });
  c.text(cx, y + 13, o.title, { size: 8.5, b: true, fill: PAL.ink, anchor: 'middle' });
  const ang = (v) => Math.PI * (1 - (Math.max(o.min, Math.min(o.max, v)) - o.min) / (o.max - o.min));
  const pt = (v, r) => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))];
  const arc = (a0, a1, r0, r1, fill) => { const d = [], n = 18; for (let i = 0; i <= n; i++) { const p = pt(a0 + (a1 - a0) * i / n, r0); d.push([i ? 'L' : 'M', p[0], p[1]]); } for (let i = n; i >= 0; i--) { const p = pt(a0 + (a1 - a0) * i / n, r1); d.push(['L', p[0], p[1]]); } d.push(['Z']); c.path(d, { fill }); };
  const bands = o.bands || [[o.min, o.max, PAL.seaL]]; for (const b of bands) arc(b[0], b[1], R, R - 9, b[2]);
  for (const m of o.marks || []) { const a = pt(m[0], R + 1), b = pt(m[0], R - 10), l = pt(m[0], R + 7); c.line(a[0], a[1], b[0], b[1], { stroke: PAL.white, lw: 1.2 }); if (m[1]) c.text(l[0], l[1] + 2.5, m[1], { size: 6.2, fill: PAL.mute, anchor: 'middle' }); }
  if (o.value == null) { c.text(cx, cy - 4, 'not available', { size: 8.5, b: true, fill: PAL.mute, anchor: 'middle' }); if (o.lastGood) c.text(cx, cy + 8, 'last good ' + o.lastGood, { size: 7, fill: PAL.mute, anchor: 'middle' }); return; }
  const p = pt(o.value, R - 13); c.line(cx, cy, p[0], p[1], { stroke: PAL.ink, lw: 2, cap: 'round' }); c.circle(cx, cy, 3.5, { fill: PAL.ink });
  c.text(cx, cy + 15, n1(o.value) + ' ' + o.unit, { size: 12.5, b: true, fill: PAL.ink, anchor: 'middle' });
  /* v91.17.283.52 D · #103: the caption lines stay inside the card (live test 52: "chance 67 %" fell below the bottom border in every report):
     shrink to fit two lines, and the lines sit above the bottom edge */
  let ss = 7, L0 = D.wrap(o.sub || '', w - 12, ss, false); while (L0.length > 2 && ss > 5.6) { ss -= 0.2; L0 = D.wrap(o.sub || '', w - 12, ss, false); }
  const L2 = L0.slice(0, 2), lh = ss * 1.2, top = cy + 26;
  L2.forEach((l, i) => c.text(cx, top + i * lh, l, { size: ss, fill: PAL.mute, anchor: 'middle' }));
}

/* the 7-day hazard tiles */
function tiles(D, A, T, AQ) {
  const c = D.cv, x0 = D.M, W = D.cw, lw = 96, days = (A.days || []).map((d) => d.date).slice(0, 7), n = Math.max(days.length, 1), cw = (W - lw) / n;
  const lvDates = new Set((A.levels && A.levels.days) || []);
  let y = D.y; const man = [];
  days.forEach((d, i) => { const xx = x0 + lw + i * cw + cw / 2, dd = dObj(d); c.text(xx, y + 9, i === 0 ? 'Today' : WD[dd.getUTCDay()], { size: 8.5, b: true, fill: PAL.ink, anchor: 'middle' }); c.text(xx, y + 19, dd.getUTCDate() + ' ' + MON[dd.getUTCMonth()], { size: 7.5, fill: PAL.mute, anchor: 'middle' }); });
  y += 24;
  const tile = (row, i, lv, word, tier, extra) => { const x = x0 + lw + i * cw;
    if (tier === 1) { c.rect(x + 1.5, y + 1, cw - 3, 17, { r: 3, fill: RAMP[lv] }); c.text(x + cw / 2, y + 12.6, word, { size: 8, b: true, fill: lv >= 3 ? PAL.white : PAL.ink, anchor: 'middle' }); }
    else { c.rect(x + 1.5, y + 1, cw - 3, 17, { r: 3, fill: PAL.white, stroke: RAMP[lv], lw: 1.6 }); c.rect(x + 1.5, y + 1, 4, 17, { r: 1.5, fill: RAMP[lv] }); c.text(x + cw / 2 + 1.5, y + 12.6, word, { size: 8, b: true, fill: PAL.ink, anchor: 'middle' }); }
    man.push({ hazard: row, date: days[i], word, tier, ...(extra || {}) }); };
  for (const h of T.rows) {
    c.text(x0, y + 12.5, h.name, { size: 8.8, b: true, fill: PAL.ink });
    days.forEach((d, i) => { const r = h.days.find((z) => z.date === d); if (r && r.level != null) tile(h.name, i, r.level, WORDS[r.level], h.tier); else c.line(x0 + lw + i * cw + cw / 2 - 4, y + 9.5, x0 + lw + i * cw + cw / 2 + 4, y + 9.5, { stroke: PAL.line, lw: 1 }); });
    y += 20; }
  /* air quality: the served level when the count carries one, otherwise the day's AQI category in the index's own colour (Tier 2) */
  if (AQ) {
    c.text(x0, y + 12.5, 'Air quality', { size: 8.8, b: true, fill: PAL.ink });
    if (AQ.served) days.forEach((d, i) => { const r = AQ.served.days.find((z) => z.date === d); if (r && r.level != null) tile('Air quality', i, r.level, WORDS[r.level], AQ.served.tier); });
    else { c.text(x0, y + 21, 'AQI, Tier 2', { size: 6.8, fill: PAL.mute });
      days.forEach((d, i) => { const r = AQ.days.find((z) => z.date === d); const x = x0 + lw + i * cw; if (!r || !r.category) { c.line(x + cw / 2 - 4, y + 13, x + cw / 2 + 4, y + 13, { stroke: PAL.line, lw: 1 }); return; }
        const col = AQI_COL[String(r.category).toLowerCase()] || PAL.faint; c.rect(x + 1.5, y + 1, cw - 3, 25, { r: 3, fill: PAL.white, stroke: col, lw: 1.6 }); c.rect(x + 1.5, y + 1, 4, 25, { r: 1.5, fill: col });
        const ls = D.wrap(r.category, cw - 12, 6.8, true); const top = y + (ls.length > 1 ? 9 : 11);
        ls.slice(0, 2).forEach((l, k) => c.text(x + cw / 2 + 1.5, top + k * 7.6, l, { size: 6.8, b: true, fill: PAL.ink, anchor: 'middle' }));
        if (fin(r.aqi)) c.text(x + cw / 2 + 1.5, y + 23, 'AQI ' + r.aqi, { size: 6.6, fill: PAL.mute, anchor: 'middle' });
        man.push({ hazard: 'Air quality', date: d, word: r.category, aqi: r.aqi, tier: 2 }); }); }
    y += AQ.served ? 20 : 29; }
  /* the day values (Tier 1 forecast values of the place) */
  const vrow = (label, f) => { c.rect(x0, y, W, 15, { fill: PAL.panel }); c.text(x0 + 3, y + 10.5, label, { size: 7.8, b: true, fill: PAL.mute });
    days.forEach((d, i) => { const v = f((A.days || []).find((z) => z.date === d) || {}); if (v) c.text(x0 + lw + i * cw + cw / 2, y + 10.5, v, { size: 7.8, fill: PAL.ink, anchor: 'middle' }); }); y += 16; };
  y += 2;
  vrow('Max / min °C', (d) => fin(d.tmaxC) ? (+d.tmaxC).toFixed(1) + ' / ' + (fin(d.tminC) ? (+d.tminC).toFixed(1) : '–') : '');   /* v91.17.283.49 merge: one decimal, as every page and the 'Now at the site' line */
  vrow('Rain mm', (d) => fin(d.rainMm) ? n1(d.rainMm) : '');
  vrow('Gust km/h', (d) => fin(d.gustMaxKmh) ? n0(d.gustMaxKmh) : '');
  D.y = y + 4;
  /* the key: tiers, and why some days are blank */
  const blank = days.some((d) => !lvDates.has(d));
  let kx = x0; c.rect(kx, D.y + 2, 14, 8, { r: 2, fill: RAMP[0] }); kx += 18; c.text(kx, D.y + 9, 'Tier 1 verified forecast (passed its event test)', { size: 7.3, fill: PAL.mute }); kx += D.measure('Tier 1 verified forecast (passed its event test)', 7.3) + 12;
  c.rect(kx, D.y + 2, 14, 8, { r: 2, fill: PAL.white, stroke: RAMP[0], lw: 1.4 }); kx += 18; c.text(kx, D.y + 9, 'Tier 2 context / indicative', { size: 7.3, fill: PAL.mute }); kx += D.measure('Tier 2 context / indicative', 7.3) + 12;
  if (blank) c.text(kx, D.y + 9, '– no level issued for that day', { size: 7.3, fill: PAL.mute });
  D.y += 14;
  return man;
}

/* ══ the charts (page 2) ══ */
function frame(D, x, y, w, h) { D.cv.rect(x, y, w, h, { r: 6, fill: PAL.white, stroke: PAL.line, lw: 0.6 }); }
function axisY(D, x, y0, y1, lo, hi, n, fmt, o = {}) { const c = D.cv, step = niceStep(hi - lo, n), out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) { const yy = y1 - (v - lo) / (hi - lo) * (y1 - y0); out.push([v, yy]);
    if (!o.noGrid) c.line(o.gx0, yy, o.gx1, yy, { stroke: '#E7ECE8', lw: 0.5 }); c.text(x, yy + 2.5, fmt(v), { size: 6.8, fill: PAL.mute, anchor: o.anchor || 'end' }); } return out; }
/* v91.17.283.52 D · #121: the axis ends on whole steps, so the top series always has a labelled gridline above it */
function snapAxis(lo, hi, n) { const st = niceStep(hi - lo, n); return [Math.floor(lo / st) * st, Math.ceil(hi / st) * st]; }
function niceStep(span, n) { const raw = (span || 1) / n, p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p; return 10 * p; }
function chartTitle(D, x, y, title, tag) { D.cv.text(x, y, title, { size: 10, b: true, fill: PAL.seaD }); if (tag) tagPill(D, x + D.measure(title, 10, true) + 6, y - 8.5, tag); }
function caption(D, x, y, w, s) { return D.para(x, y, w, s, { size: 7.8, fill: PAL.mute }); }
function legendItem(D, x, y, color, label, o = {}) { const c = D.cv; if (o.bar) c.rect(x, y - 6, 9, 7, { fill: color }); else c.line(x, y - 2.5, x + 12, y - 2.5, { stroke: color, lw: 1.8, dash: o.dash }); c.text(x + (o.bar ? 12 : 15), y, label, { size: 7, fill: PAL.mute }); return (o.bar ? 12 : 15) + D.measure(label, 7) + 10; }

function meteogram(D, A, x, y, w) {
  const H = (A.hours || []).filter((h) => fin(h.tempC)); if (H.length < 12) return 0;
  const c = D.cv, h = 150; const fop = c.rect(x, y, w, h + 38, { r: 6, fill: PAL.white, stroke: PAL.line, lw: 0.6 }); chartTitle(D, x + 10, y + 15, 'Next 72 hours at the place', 'Tier 1');   /* frame height set below, once the caption is known (v91.17.283.49 merge: the caption sat on the frame line) */
  const px0 = x + 44, px1 = x + w - 48, ty0 = y + 30, ty1 = y + 98, ry0 = y + 106, ry1 = y + 146;
  const T = H.map((z) => +z.tempC), F = H.map((z) => fin(z.feelsC) ? +z.feelsC : null), R = H.map((z) => fin(z.rainMm) ? +z.rainMm : 0), G = H.map((z) => fin(z.gustKmh) ? +z.gustKmh : null);
  const [lo, hi] = snapAxis(Math.floor(Math.min(...T, ...F.filter(fin)) - 1), Math.ceil(Math.max(...T, ...F.filter(fin)) + 1), 4);
  const X = (i) => px0 + i * (px1 - px0) / Math.max(1, H.length - 1), YT = (v) => ty1 - (v - lo) / (hi - lo) * (ty1 - ty0);
  axisY(D, px0 - 4, ty0, ty1, lo, hi, 4, (v) => n0(v) + '°', { gx0: px0, gx1: px1 });
  const rmax = Math.max(2, ...R) * 1.15, gmax = Math.max(20, ...G.filter(fin)) * 1.1, YR = (v) => ry1 - v / rmax * (ry1 - ry0), YG = (v) => ry1 - v / gmax * (ry1 - ry0);
  c.line(px0, ry1, px1, ry1, { stroke: PAL.line, lw: 0.6 });
  axisY(D, px0 - 4, ry0, ry1, 0, rmax, 2, (v) => n1(v) + ' mm', { noGrid: true }); axisY(D, px1 + 4, ry0, ry1, 0, gmax, 2, (v) => n0(v) + ' km/h', { noGrid: true, anchor: 'start' });
  /* day boundaries */
  H.forEach((z, i) => { if (String(z.time).slice(11, 13) === '00' && i > 0) { c.line(X(i), ty0, X(i), ry1, { stroke: '#DDE3DE', lw: 0.6, dash: [2, 2] }); } if (String(z.time).slice(11, 13) === '12') c.text(X(i), ry1 + 10, dayLab(String(z.time).slice(0, 10)), { size: 7, fill: PAL.mute, anchor: 'middle' }); });
  const bw = Math.max(1, (px1 - px0) / H.length - 0.6); R.forEach((v, i) => { if (v > 0.05) c.rect(X(i) - bw / 2, YR(v), bw, ry1 - YR(v), { fill: PAL.sea }); });
  const line = (arr, Y, o) => { const d = []; arr.forEach((v, i) => { if (v == null) return; d.push([d.length ? 'L' : 'M', X(i), Y(v)]); }); if (d.length > 1) c.path(d, o); };
  line(F, YT, { stroke: PAL.sand, lw: 1, dash: [3, 2] }); line(T, YT, { stroke: PAL.sandD, lw: 1.8 }); line(G, YG, { stroke: PAL.warmD, lw: 1.2 });
  let lx = x + 10; const ly = y + h + 26; lx += legendItem(D, lx, ly, PAL.sandD, 'Temperature °C'); lx += legendItem(D, lx, ly, PAL.sand, 'Feels like °C', { dash: [3, 2] }); lx += legendItem(D, lx, ly, PAL.sea, 'Rain mm per hour', { bar: true }); lx += legendItem(D, lx, ly, PAL.warmD, 'Gust km/h');
  const tx = H.reduce((m, z) => (+z.tempC > +m.tempC ? z : m)), tn = H.reduce((m, z) => (+z.tempC < +m.tempC ? z : m)), rs = R.reduce((s, v) => s + v, 0), gx = G.filter(fin).length ? Math.max(...G.filter(fin)) : null;
  const cp = 'Temperature ' + n1(tn.tempC) + ' to ' + n1(tx.tempC) + ' °C (warmest ' + dayLab(String(tx.time).slice(0, 10)) + ' ' + String(tx.time).slice(11, 16) + ' PKT); ' + (rs >= 0.5 ? n1(rs) + ' mm of rain in 72 hours' : 'no rain of note') + (gx != null ? '; gusts up to ' + n0(gx) + ' km/h' : '') + '.';
  const ch = caption(D, x + 10, y + h + 30, w - 20, cp); if (fop) fop.h = h + 30 + ch + 6;
  return h + 30 + ch + 10;
}
function days415(D, A, x, y, w) {
  const E = A.outlook && A.outlook.ensemble; if (!E || !E.days) return 0;
  const lv = new Set((A.levels && A.levels.days) || []); const last = [...lv].sort().pop() || (A.days[3] && A.days[3].date);
  const Ds = E.days.filter((d) => !last || d.date > last).filter((d) => Array.isArray(d.tx) && d.tx.length >= 3); if (Ds.length < 3) return 0;
  const c = D.cv, h = 118; frame(D, x, y, w, h + 30); chartTitle(D, x + 10, y + 15, 'Days ' + (A.days.length >= 4 ? 5 : 4) + ' to 15: the range of ' + (E.members || 51) + ' forecast runs', 'Tier 2');
  const px0 = x + 44, px1 = x + w - 20, ty0 = y + 28, ty1 = y + 82, ry0 = y + 90, ry1 = y + 114;
  const all = Ds.flatMap((d) => [...d.tx, ...(d.tn || [])]).filter(fin), [lo, hi] = snapAxis(Math.floor(Math.min(...all) - 1), Math.ceil(Math.max(...all) + 1), 4);
  const cwid = (px1 - px0) / Ds.length, X = (i) => px0 + cwid * (i + 0.5), YT = (v) => ty1 - (v - lo) / (hi - lo) * (ty1 - ty0);
  axisY(D, px0 - 4, ty0, ty1, lo, hi, 4, (v) => n0(v) + '°', { gx0: px0, gx1: px1 });
  const pr = Ds.map((d) => Array.isArray(d.pr) ? +d.pr[1] || 0 : 0), pr9 = Ds.map((d) => Array.isArray(d.pr) ? +d.pr[2] || 0 : 0), rmax = Math.max(2, ...pr9) * 1.1, YR = (v) => ry1 - v / rmax * (ry1 - ry0);
  c.line(px0, ry1, px1, ry1, { stroke: PAL.line, lw: 0.6 }); axisY(D, px0 - 4, ry0, ry1, 0, rmax, 1, (v) => n1(v) + ' mm', { noGrid: true });
  Ds.forEach((d, i) => { const xx = X(i), bw = Math.min(14, cwid * 0.45);
    c.rect(xx - bw / 2, YT(d.tx[2]), bw, Math.max(1, YT(d.tx[0]) - YT(d.tx[2])), { r: 2, fill: PAL.sand, op: 0.55 }); c.line(xx - bw / 2, YT(d.tx[1]), xx + bw / 2, YT(d.tx[1]), { stroke: PAL.sandD, lw: 1.6 });
    if (Array.isArray(d.tn) && d.tn.length >= 3) { c.rect(xx - bw / 2, YT(d.tn[2]), bw, Math.max(1, YT(d.tn[0]) - YT(d.tn[2])), { r: 2, fill: PAL.warm, op: 0.45 }); c.line(xx - bw / 2, YT(d.tn[1]), xx + bw / 2, YT(d.tn[1]), { stroke: PAL.warmD, lw: 1.4 }); }
    if (pr9[i] > 0.05) { c.rect(xx - bw / 2, YR(pr9[i]), bw, ry1 - YR(pr9[i]), { fill: PAL.seaL }); } if (pr[i] > 0.05) c.rect(xx - bw / 2, YR(pr[i]), bw, ry1 - YR(pr[i]), { fill: PAL.sea });
    const dd = dObj(d.date); c.text(xx, ry1 + 9, dd.getUTCDate() + ' ' + MON[dd.getUTCMonth()], { size: 6.5, fill: PAL.mute, anchor: 'middle' }); });
  let lx = x + w - 10 - 280; const ly = y + 15; lx += legendItem(D, lx, ly, PAL.sandD, 'Day max (bar: 1 in 10 to 9 in 10)'); legendItem(D, lx, ly, PAL.warmD, 'Night min');
  const hot = Ds.reduce((m, d) => (d.tx[1] > m.tx[1] ? d : m)), wet = Ds.reduce((m, d, i) => (pr[i] > m.v ? { v: pr[i], d } : m), { v: 0, d: null });
  const cp = 'Middle run: day maximum ' + n0(Math.min(...Ds.map((d) => d.tx[1]))) + ' to ' + n0(Math.max(...Ds.map((d) => d.tx[1]))) + ' °C, warmest ' + dayLab(hot.date) + '; ' + (wet.v >= 1 ? 'wettest ' + dayLab(wet.d.date) + ' (' + n1(wet.v) + ' mm in the middle run)' : 'little or no rain in the middle run') + '. Run of ' + (pktShort(E.at) || 'not available') + '.';
  const ch = caption(D, x + 10, y + h + 18, w - 20, cp); return h + 30 + ch + 4;
}
function aheadBars(D, x, y, w, h, title, rows, unit, fmtLab) {
  const c = D.cv; frame(D, x, y, w, h); chartTitle(D, x + 8, y + 14, title, 'Tier 2');
  const vals = rows.map((r) => r.v).filter(fin); if (!vals.length) return;
  const m = Math.max(1, ...vals.map(Math.abs)) * 1.2, px0 = x + 26, px1 = x + w - 8, y0 = y + 26, y1 = y + h - 18, ym = (y0 + y1) / 2, bw = (px1 - px0) / rows.length;
  c.line(px0, ym, px1, ym, { stroke: PAL.faint, lw: 0.6 }); c.text(px0 - 3, ym + 2.5, '0', { size: 6.5, fill: PAL.mute, anchor: 'end' });
  c.text(px0 - 3, y0 + 4, '+' + n1(m), { size: 6.5, fill: PAL.mute, anchor: 'end' }); c.text(px0 - 3, y1, '−' + n1(m), { size: 6.5, fill: PAL.mute, anchor: 'end' });
  rows.forEach((r, i) => { const xx = px0 + bw * i + bw * 0.2, ww = bw * 0.6; if (fin(r.v)) { const hh = Math.abs(r.v) / m * (y1 - y0) / 2; c.rect(xx, r.v >= 0 ? ym - hh : ym, ww, Math.max(0.8, hh), { fill: r.v >= 0 ? r.pos : r.neg });
      c.text(xx + ww / 2, r.v >= 0 ? ym - hh - 2.5 : ym + hh + 7.5, (r.v > 0 ? '+' : '') + n1(r.v), { size: 6.3, fill: PAL.ink, anchor: 'middle' }); }
    c.text(xx + ww / 2, y + h - 7, fmtLab(r), { size: 6.5, fill: PAL.mute, anchor: 'middle' }); });
  c.text(x + w - 8, y + 14, unit, { size: 6.8, fill: PAL.mute, anchor: 'end' });
}
function ahead(D, A, x, y, w) {
  const Wk = A.outlook && A.outlook.weeks && A.outlook.weeks.weeks || [], Mo = A.outlook && A.outlook.months && A.outlook.months.months || [];
  const today = (A.days[0] && A.days[0].date) || '';
  const wk = Wk.filter((r) => fin(r.tAnom)).slice(0, 6), mo = Mo.filter((r) => fin(r.tAnom) && r.month >= today.slice(0, 7)).slice(0, 6); if (!wk.length && !mo.length) return 0;
  const h = 104, gap = 10, w2 = (w - gap) / 2;
  if (wk.length) aheadBars(D, x, y, mo.length ? w2 : w, h, 'Weeks ahead: temperature against normal', wk.map((r) => ({ v: +r.tAnom, pos: PAL.sand, neg: PAL.warm, start: r.start })), '°C', (r) => { const d = dObj(r.start); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; });
  if (mo.length) aheadBars(D, wk.length ? x + w2 + gap : x, y, wk.length ? w2 : w, h, 'Season ahead: temperature against normal', mo.map((r) => ({ v: +r.tAnom, pos: PAL.sand, neg: PAL.warm, m: r.month })), '°C', (r) => MON[+r.m.slice(5, 7) - 1]);
  const wkTxt = wk.length ? 'weeks: ' + wk.map((r) => (r.tAnom > 0 ? '+' : '') + n1(r.tAnom)).join(', ') + ' °C' : '';
  const wetM = mo.filter((r) => fin(r.pPct)); const moTxt = mo.length ? 'months: ' + mo.map((r) => MON[+r.month.slice(5, 7) - 1] + ' ' + (r.tAnom > 0 ? '+' : '') + n1(r.tAnom) + ' °C' + (fin(r.pPct) ? ', rain ' + (r.pPct > 0 ? '+' : '') + n0(r.pPct) + ' %' : '')).join(', ') : '';
  void wetM; const ch = caption(D, x + 4, y + h + 2, w - 8, 'Outlook against the forecast model’s own normal for the same week or month (rain as a share above or below that normal); ' + [wkTxt, moTxt].filter(Boolean).join('; ') + '.');
  return h + ch + 8;
}
/* v91.17.283.49 merge · THE GROUND AT THIS POINT: the site's own 250 m cell (runoff class, built-up share; data item 3), the nearest mapped
   active fault and the building-code seismic values, as the site screening serves them (facts, no level) */
const GROUND_ROWS = ['Ground at the site (250 m cell)', 'Nearest active fault', 'Seismic design values'];
function groundPanel(D, A, x, y, w) {
  const S = A.siteScreening && A.siteScreening.rows || []; const rows = GROUND_ROWS.map((k) => S.find((r) => r.parameter === k)).filter((r) => r && r.values && !/\b(null|undefined|NaN)\b/.test(r.values));
  if (!rows.length) return 0;
  const c = D.cv; chartTitle(D, x + 2, y + 11, 'The ground at this point', 'Tier 2'); let yy = y + 18;
  const cols = [0.26, 0.74].map((f) => f * w), size = 7.8;
  for (const r of rows) { const cells = [clean(r.parameter), cap(clean(r.values))].map((t, i) => D.wrap(t, cols[i] - 8, size, i === 0));
    const hh = Math.max(...cells.map((l) => l.length)) * size * 1.22 + 5; let xx = x;
    cells.forEach((ls, i) => { ls.forEach((l, k) => c.text(xx + 4, yy + 2.5 + size + k * size * 1.22, l, { size, b: i === 0, fill: PAL.ink })); xx += cols[i]; }); c.line(x, yy + hh, x + w, yy + hh, { stroke: PAL.line, lw: 0.4 }); yy += hh; }
  D.tables.push({ title: 'The ground at this point', sig: JSON.stringify(rows.map((r) => r.parameter)) });
  return yy - y + 6;
}
function screening(D, A, x, y, w) {
  const S = A.siteScreening && A.siteScreening.rows || []; const rows = S.filter((r) => r.verdict && r.values);
  if (!rows.length) return 0;
  const c = D.cv; chartTitle(D, x + 2, y + 11, 'Site screening: rare events at this point', 'Tier 2'); let yy = y + 18;
  const cols = [0.2, 0.42, 0.26, 0.12].map((f) => f * w), size = 7.8;
  c.rect(x, yy, w, 13, { fill: PAL.seaL }); ['Event', 'Return levels', 'Forecast', 'Now'].forEach((t, i) => c.text(x + 4 + cols.slice(0, i).reduce((s, v) => s + v, 0), yy + 9.5, t, { size: 7.6, b: true, fill: PAL.seaD })); yy += 13;
  for (const r of rows.slice(0, 5)) { const cells = [clean(r.parameter), clean(r.values), clean(r.forecast || ''), clean(r.verdict)].map((t, i) => D.wrap(t, cols[i] - 8, size, i === 0));
    const hh = Math.max(...cells.map((l) => l.length)) * size * 1.22 + 5; let xx = x;
    cells.forEach((ls, i) => { ls.forEach((l, k) => c.text(xx + 4, yy + 2.5 + size + k * size * 1.22, l, { size, b: i === 0, fill: PAL.ink })); xx += cols[i]; }); c.line(x, yy + hh, x + w, yy + hh, { stroke: PAL.line, lw: 0.4 }); yy += hh; }
  D.tables.push({ title: 'Site screening', sig: JSON.stringify(rows.map((r) => r.parameter)) });
  return yy - y + 6;
}
function airChart(D, A, x, y, w) {
  const air = A.air; if (!air || !air.days || air.days.filter((d) => fin(d.pm25)).length < 2) return 0;
  const c = D.cv, h = 84; frame(D, x, y, w, h); chartTitle(D, x + 8, y + 14, 'Air quality: daily mean PM2.5', 'Tier 2');
  const Ds = air.days.filter((d) => fin(d.pm25)), mx = Math.max(40, ...Ds.map((d) => d.pm25)) * 1.15, px0 = x + 30, px1 = x + w - 10, y0 = y + 24, y1 = y + h - 16, bw = (px1 - px0) / Ds.length;
  axisY(D, px0 - 4, y0, y1, 0, mx, 3, (v) => n0(v), { gx0: px0, gx1: px1 });
  Ds.forEach((d, i) => { const hh = d.pm25 / mx * (y1 - y0); c.rect(px0 + bw * i + bw * 0.25, y1 - hh, bw * 0.5, hh, { fill: PAL.sea });
    c.text(px0 + bw * i + bw / 2, y1 - hh - 2.5, n0(d.pm25), { size: 6.5, fill: PAL.ink, anchor: 'middle' }); c.text(px0 + bw * i + bw / 2, y + h - 6, dayLab(d.date), { size: 6.5, fill: PAL.mute, anchor: 'middle' }); });
  c.text(x + w - 8, y + 14, 'µg/m³', { size: 6.8, fill: PAL.mute, anchor: 'end' });
  return h + 6;
}
function glofPanel(D, A, x, y, w) {
  const G = A.glof; if (!G || !G.relevant) return 0;
  const c = D.cv; chartTitle(D, x + 2, y + 11, 'Glacial lakes upstream', 'Tier 2'); let yy = y + 16;
  const line = (G.lakesUpstream != null ? G.lakesUpstream + ' mapped glacial lakes drain towards this place' : 'Glacial lakes drain towards this place') + (G.counts && G.counts.priority != null ? '; ' + G.counts.priority + ' at the highest susceptibility tier' : '') + '. Susceptibility from mapped lake attributes and the outburst record: a standing condition, not a forecast for a day.';
  yy += D.para(x + 2, yy, w - 4, line, { size: 7.8, fill: PAL.mute }) + 3;
  const L = []; for (const k of G.lakes) { const o = L.find((z) => z.name === k.name && Math.abs((z.kmAlong || 0) - (k.kmAlong || 0)) < 1); if (o) { o.events = Math.max(o.events || 0, k.events || 0); continue; } L.push({ ...k }); if (L.length >= 4) break; }
  if (L.length) { const cols = [0.34, 0.22, 0.2, 0.24].map((f) => f * w);
    c.rect(x, yy, w, 13, { fill: PAL.seaL }); ['Lake', 'Susceptibility', 'Distance upstream', 'Recorded outbursts'].forEach((t, i) => c.text(x + 4 + cols.slice(0, i).reduce((s, v) => s + v, 0), yy + 9.5, t, { size: 7.6, b: true, fill: PAL.seaD })); yy += 13;
    for (const k of L) { const nm = clean(String(k.name || 'Unnamed lake').replace(/\s*\b[A-Z]{2,5}-\d+(?:\.\d+)?N\d+(?:\.\d+)?E\b/g, '').replace(/\s*\b[A-Z]{2,5}-\d{2,6}\b/g, '').replace(/^unnamed lake\b/i, 'Unnamed lake').replace(/^Unnamed lake\s*,\s*/, 'Unnamed lake near ').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim());   /* v91.17.283.52 D · N21: "Unnamed lake SLI-0805, Gilgit" -> "Unnamed lake near Gilgit" */   /* v91.17.283.49 merge: no inventory ids; the name wraps inside its column (it overlapped the next column on real data, L13) */
      const nl = D.wrap(nm, cols[0] - 8, 7.8, true).slice(0, 2), rh = 14 + (nl.length - 1) * 9.5;
      const vals = [null, k.tier || '', fin(k.kmAlong) ? n1(k.kmAlong) + ' km' : '', fin(k.events) ? String(k.events) : '']; let xx = x;
      nl.forEach((l, q) => c.text(xx + 4, yy + 10 + q * 9.5, l, { size: 7.8, b: true, fill: PAL.ink }));
      vals.forEach((t, i) => { if (i) c.text(xx + 4, yy + 10, t, { size: 7.8, b: false, fill: PAL.ink }); xx += cols[i]; }); c.line(x, yy + rh, x + w, yy + rh, { stroke: PAL.line, lw: 0.4 }); yy += rh; }
    D.tables.push({ title: 'Glacial lakes upstream', sig: JSON.stringify(L.map((k) => k.name)) }); }
  return yy - y + 6;
}
function riverPanel(D, A, x, y, w) {
  const R = A.river; if (!R || !R.relevant || !R.reaches.length) return 0;
  chartTitle(D, x + 2, y + 11, 'River reach', 'Tier 2'); let yy = y + 16;
  const t = R.reaches.slice(0, 3).map((r) => clean((r.name || r.river || r.id) + (r.word ? ': ' + r.word : ''))).join('; ');
  yy += D.para(x + 2, yy, w - 4, 'Gauged river reach linked to this place: ' + t + '.', { size: 7.8, fill: PAL.mute }); return yy - y + 6;
}
function scenarioPanel(D, A, x, y, w) {
  const S = A.scenario; if (!S) return 0; chartTitle(D, x + 2, y + 11, 'Saved scenario', 'Tier 2'); let yy = y + 16;
  const lines = []; const nm = S.title || S.name || S.label || (S.inputs && S.inputs.title) || null; if (nm) lines.push(clean(nm));
  for (const k of ['summary', 'verdict', 'headline', 'text']) if (typeof S[k] === 'string') lines.push(clean(S[k]));
  if (!lines.length) return 0; yy += D.para(x + 2, yy, w - 4, lines.join(' '), { size: 7.8, fill: PAL.ink }); return yy - y + 6;
}

/* ══ the report ══ */
export const KIND_TITLES = { site_assessment: 'Site report', situation_report: 'Situation report', readiness_72h: '72-hour readiness brief', executive_brief: 'Executive climate risk brief',
  assurance_pack: 'Methodology and assurance pack', portfolio_screening: 'Portfolio screening', scenario: 'Scenario report',
  /* v91.17.283.51 · the kinds of repkinds.mjs (1.0.10.2: every report on the engine) */
  portfolio: 'Portfolio screening', network: 'Network report', weather_impact: 'Operational weather impact brief', data_gap: 'Data gap brief', engineering_note: 'Engineering data-readiness note' };
export function buildReport(A, o) {
  o = { ...o, generatedAt: o.generatedAt || new Date().toISOString() }; A = servedRain(A);   /* v91.17.283.51 g2 · issue time; one rain basis */
  const kind = KIND_TITLES[o.kind] ? o.kind : 'site_assessment', kindTitle = KIND_TITLES[kind], view = o.view === 'operator' ? 'operator' : 'customer';
  const D = new Doc({ kind, view }); const id = o.id; const title = kindTitle + ': ' + placeName(A.place);
  const T = tileRows(A), AQ = airRow(A), S = summaryOf(A, T, AQ), acts = topActions(A);
  const man = { id, kind, view, title, summary: S, tiles: [], cannotHappen: (A.cannotHappen || []).map((x) => x.key), notAssessed: T.notAssessed.map((x) => x.key), sections: D.sections, tables: D.tables, unavailableShown: [] };

  /* ── page 1: the dashboard ── */
  D.newPage('customer', 'Dashboard'); header(D, A, { id, title: kindTitle, kindTitle, view, generatedAt: o.generatedAt });
  { const h = D.paraH(D.cw - 20, S.text, { size: 10.2 }) + 12; D.cv.rect(D.M, D.y, D.cw, h, { r: 6, fill: PAL.sandL, stroke: PAL.sand, lw: 0.6 }); D.para(D.M + 10, D.y + 5, D.cw - 20, S.text, { size: 10.2, fill: PAL.ink }); D.y += h + 8; }
  /* v91.17.283.49 merge · NOW AT THE SITE: the served strings every page prints (place answer 'shown', server/api/shownplace.mjs), one line,
     each value its own text with data-shown=<key> (the same keys as the pages; samevalue113 compares them string for string) */
  { const SH = A.shown; if (SH && SH.now && SH.today) { const parts = [['Now at the site: ', null, true], [SH.now.value != null ? String(SH.now.value) : '–', 'now', true], [' °C, ', null], [String(SH.now.label || ''), 'nowLabel'],
      [' · today ', null], [String(SH.today.low != null ? SH.today.low : '–'), 'todayLow'], ['–', null], [String(SH.today.high != null ? SH.today.high : '–'), 'todayHigh'], [' °C · ', null],
      [clean(String((SH.measured && SH.measured.value != null ? SH.measured.value + ' °C · ' : '') + ((SH.measured && SH.measured.label) || ''))), 'measured']];
    /* v91.17.283.51 fix (deploy 3 Nov 18:31 rolled back on L13 "outside the page"): the line is shrunk to at most 7.6 pt; when it still does
       not fit, the measured part goes on its own wrapped line(s) below: page-1 text never runs off the page whatever its length */
    let x = D.M, sz = 8.8; const tot = parts.reduce((w, p) => w + D.measure(p[0], sz, !!p[2]), 0); if (tot > D.cw) sz = Math.max(7.6, sz * D.cw / tot);
    const fits = parts.reduce((w, p) => w + D.measure(p[0], sz, !!p[2]), 0) <= D.cw;
    const head = fits ? parts : parts.slice(0, -1).map((p, i, a) => (i === a.length - 1 ? [String(p[0]).replace(/\s*·\s*$/, ''), p[1], p[2]] : p));
    for (const [t, k, b] of head) { D.cv.text(x, D.y + 9, t, { size: sz, b: !!b, fill: k ? PAL.ink : PAL.mute, data: k }); x += D.measure(t, sz, !!b); }
    D.y += 16;
    if (!fits) { const ml = D.wrap(parts[parts.length - 1][0], D.cw, sz, false); ml.forEach((l, i) => D.cv.text(D.M, D.y + 7 + i * sz * 1.28, l, { size: sz, fill: PAL.ink, data: 'measured' })); D.y += ml.length * sz * 1.28 + 4; } man.now = { now: SH.now.value, nowLabel: SH.now.label, todayLow: SH.today.low, todayHigh: SH.today.high, measured: SH.measured && SH.measured.label, airNow: (SH.airNow && SH.airNow.label) || null };
    /* v91.17.283.52 E · the measured air quality now, the same served sentence as every page (data-shown airNow), wrapped, never off the page */
    if (SH.airNow && SH.airNow.label) { const al = D.wrap(clean(String(SH.airNow.label)), D.cw, 8.6, false); al.forEach((l, i) => D.cv.text(D.M, D.y + 7 + i * 8.6 * 1.28, l, { size: 8.6, fill: PAL.ink, data: 'airNow' })); D.y += al.length * 8.6 * 1.28 + 4; } } }
  /* the situation report: Pakistan today, from the served national alert list, in one line */
  if (kind === 'situation_report' && A.national && !A.national.stale && !(o.extra && o.extra.ownNational)) { const N = A.national, rows = N.rows || [];
    const t = rows.length ? N.count + ' area' + (N.count === 1 ? '' : 's') + ' on alert: ' + rows.slice(0, 6).map((r) => clean(r.name) + ' (' + clean(r.alert) + ')').join(', ') + (N.count > 6 ? ' and ' + (N.count - 6) + ' more' : '') + '.' : 'no area on alert in the current issue.';
    const bw = D.measure('Pakistan today: ', 8.6, true); D.cv.text(D.M, D.y + 9.5, 'Pakistan today: ', { size: 8.6, b: true, fill: PAL.seaD }); D.y += D.para(D.M + bw, D.y + 1, D.cw - bw, t, { size: 8.6 }) + 6;
    man.national = { count: N.count, text: t }; }
  /* v91.17.283.51 · each kind's own page-1 block (repkinds.mjs), between the 'now' line and the map */
  const KX = o.extra || null; if (KX && KX.page1) KX.page1(D, A, man);
  /* v91.17.283.52 D · #148: a kind may put its own main panel in place of the map and gauges (72-hour: the 12-hour blocks; executive: the key
     messages), measured first; when it does not fit, the map and gauges stay */
  let mainDone = false; if (KX && KX.p1Main) { const save = D.cv.cur, trial = { ops: [], meta: {} }; D.cv.cur = trial; const t0 = D.tables.length; const hh = KX.p1Main(D, A, D.M, D.y, D.cw); D.cv.cur = save; D.tables.length = t0;
    if (hh && hh <= (KX.p1MainMax || 260)) { const n = KX.p1Main(D, A, D.M, D.y, D.cw); D.sections.push({ title: KX.p1Main.name, part: 'customer', page: 1, items: 1 }); D.y += n + 6; mainDone = true; } }
  if (!mainDone) { const y = D.y, mw = 196, mh = 150; placeMap(D, A, D.M, y, mw, mh, o.dataDir);
    const gx = D.M + mw + 10, gw = (D.cw - mw - 10 - 16) / 3, gh = mh, today = A.days[0] || {};
    const hc = A.heatCuts && A.heatCuts.heat ? ['Low', 'Moderate', 'High', 'Severe'].map((k) => A.heatCuts.heat[k] && A.heatCuts.heat[k].range ? A.heatCuts.heat[k].range[0] : null) : [26, 32, 38, 46];
    const hRow = (A.levels.hazards || []).find((h) => h.key === 'heat'), hDay = hRow && hRow.days[0];
    const utci = fin(today.utciMaxC) ? +today.utciMaxC : null, hmin = Math.min(0, utci != null ? Math.floor(utci / 5) * 5 - 5 : 0), hmax = Math.max(50, hc[3] + 4);
    gauge(D, gx, y, gw, gh, { title: 'Heat stress today (UTCI)', min: hmin, max: hmax, value: utci, unit: '°C', bands: [[hmin, hc[0], PAL.seaL], [hc[0], hc[1], '#EFE3C2'], [hc[1], hc[2], '#E9D29B'], [hc[2], hc[3], '#DDBA73'], [hc[3], hmax, '#C99A4B']],
      marks: hc.map((v, i) => [v, ['Low', 'Mod.', 'High', 'Sev.'][i]]), sub: 'highest in shade' + (hDay && hDay.word ? ' · level ' + hDay.word : '') });
    const rc = [15.6, 64.5]; const rmm = fin(today.rainMm) ? +today.rainMm : null, rmax = Math.max(80, (rmm || 0) * 1.2);
    gauge(D, gx + gw + 8, y, gw, gh, { title: 'Rain today', min: 0, max: rmax, value: rmm, unit: 'mm', bands: [[0, rc[0], PAL.seaL], [rc[0], rc[1], '#A9CFD2'], [rc[1], rmax, '#7DB2B7']],
      marks: rc.map((v) => [v, n1(v)]), sub: 'day total' + (fin(today.rainProbMax) ? ' · highest hourly chance ' + n0(today.rainProbMax) + ' %' : '') });
    const gst = fin(today.gustMaxKmh) ? +today.gustMaxKmh : null, gmax = Math.max(100, (gst || 0) * 1.2);
    gauge(D, gx + 2 * (gw + 8), y, gw, gh, { title: 'Strongest gust today', min: 0, max: gmax, value: gst, unit: 'km/h', bands: [[0, gmax, '#DDE7DF']], marks: [[50, '50'], [80, '80']], sub: 'no tested gust level: value only' });
    D.y = y + mh + 10; }
  D.section('Hazard levels, next ' + A.days.length + ' days', 'customer', { line: false }).items = T.rows.length + (AQ ? 1 : 0) + ((A.days || []).length ? 1 : 0);   /* v91.17.283.50 · the day value rows are printed even when no hazard has a level */
  D.y -= 4; man.tiles = tiles(D, A, T, AQ);
  { const lines = [];
    if ((A.cannotHappen || []).length) lines.push(['Not relevant here: ', [...new Set(A.cannotHappen.map((x) => x.name))].join(', ') + '.']);
    if (T.notAssessed.length) lines.push(['Not assessed here: ', T.notAssessed.map((r) => r.name + ' (' + SHORT_WHY(r) + ')').join(', ') + '.']);
    for (const [b, t] of lines) { const bw = D.measure(b, 8, true); D.cv.text(D.M, D.y + 9, b, { size: 8, b: true, fill: PAL.mute }); D.y += D.para(D.M + bw, D.y + 1, D.cw - bw, t, { size: 8, fill: PAL.mute }) + 1; }
    D.y += 4; }
  /* top 3 actions */
  if (!(KX && KX.noActions)) { const sec = D.section(KX && KX.actionsTitle || 'First three actions', 'customer'); sec.items = acts.length || 1;   /* v91.17.283.50 · with no action the section holds its sentence: not empty (L14 refused quiet places) */
    if (!acts.length) { D.y += D.para(D.M, D.y, D.cw, 'No action is triggered by the forecast at this place now.', { size: 9 }) + 4; }
    const colW = (D.cw - 16) / 3, y0 = D.y; let hmax = 0;
    acts.forEach((a, i) => { const x = D.M + i * (colW + 8); const body = a.action, trig = a.trigger ? 'Why: ' + a.trigger : '', src = a.source === 'guidance' && a.sourceName ? 'Source: ' + a.sourceName : a.source === 'standing' ? 'Standing measure for this season and ground' : a.when && dueText(a.when) ? 'Ready ' + dueText(a.when) : '';
      const hb = D.paraH(colW - 16, body, { size: 8.4 }), ht = trig ? D.paraH(colW - 16, trig, { size: 7.4 }) : 0, hs = src ? 10 : 0; hmax = Math.max(hmax, 22 + hb + ht + hs + 8);
      a._h = [hb, ht, hs, x, body, trig, src]; });
    acts.forEach((a, i) => { const [hb, ht, , x, body, trig, src] = a._h; D.cv.rect(x, y0, colW, hmax, { r: 6, fill: PAL.white, stroke: PAL.line, lw: 0.6 }); D.cv.rect(x, y0, 4, hmax, { r: 2, fill: i === 0 ? PAL.sand : PAL.sea });
      D.cv.circle(x + 16, y0 + 12, 7, { fill: PAL.seaL }); D.cv.text(x + 16, y0 + 15, String(i + 1), { size: 8.5, b: true, fill: PAL.seaD, anchor: 'middle' });
      D.wrap(clean(a.title || ''), colW - 36, 8.6, true).slice(0, 2).forEach((l, k) => D.cv.text(x + 28, y0 + 15 + k * 10, l, { size: 8.6, b: true, fill: PAL.ink }));
      let yy = y0 + 26; yy += D.para(x + 10, yy, colW - 16, body, { size: 8.4 }); if (trig) yy += D.para(x + 10, yy + 1, colW - 16, trig, { size: 7.4, fill: PAL.mute }) + 1; if (src) D.cv.text(x + 10, yy + 9, src, { size: 7, fill: PAL.faint }); void hb; void ht; });
    if (acts.length) D.y = y0 + hmax + 6; }

  /* ── page 2: charts, one line each ── */
  D.newPage('customer', 'Charts'); D.y = 26;
  D.cv.text(D.M, D.y + 10, placeName(A.place) + ' · ' + kindTitle, { size: 8.5, b: true, fill: PAL.mute }); D.cv.text(D.W - D.M, D.y + 10, 'Issued ' + (pkt(o.generatedAt) || ''), { size: 8.5, fill: PAL.mute, anchor: 'end' }); D.y += 20;
  const later = [];   /* charts that do not fit page 2 go to the appendix */
  const plan = KX && KX.plan ? KX.plan : kind === 'readiness_72h' ? [meteogram, airChart, screening, groundPanel, glofPanel, riverPanel, scenarioPanel, days415, ahead] : kind === 'assurance_pack' ? [meteogram, days415] : [meteogram, days415, glofPanel, riverPanel, scenarioPanel, ahead, screening, airChart, groundPanel];
  const bottom = D.H - 50;
  for (const f of plan) {
    /* draw on a trial page to measure, then commit or move to the appendix */
    const save = D.cv.cur, trial = { ops: [], meta: {} }; D.cv.cur = trial; const t0 = D.tables.length; const hh = f(D, A, D.M, D.y, D.cw); D.cv.cur = save; D.tables.length = t0;
    if (!hh) continue;
    if (D.y + hh <= bottom) { const n = f(D, A, D.M, D.y, D.cw); D.sections.push({ title: f.name, part: 'customer', page: D.cv.pages.length, items: 1 }); D.y += n + 8; }
    else later.push(f);
  }

  /* ── the appendix, behind a divider ── */
  D.newPage('appendix', 'Appendix'); D.y = 26;
  D.cv.rect(0, 20, D.W, 46, { fill: PAL.seaL }); D.cv.text(D.M, 42, 'Appendix', { size: 18, b: true, fill: PAL.seaD });
  D.cv.text(D.M, 57, 'Methods, sources, limitations and evidence behind pages 1 and 2. The decision content is on pages 1 and 2.', { size: 8.5, fill: PAL.mute });
  D.y = 80;
  const ensure = (h) => { if (D.y + h > D.H - 50) { D.newPage('appendix', 'Appendix'); D.y = 34; } };
  for (const f of later) { const save = D.cv.cur, trial = { ops: [], meta: {} }; D.cv.cur = trial; const t0 = D.tables.length; const hh = f(D, A, D.M, D.y, D.cw); D.cv.cur = save; D.tables.length = t0; if (!hh) continue; ensure(hh); const n = f(D, A, D.M, D.y, D.cw); D.sections.push({ title: f.name, part: 'appendix', page: D.cv.pages.length, items: 1 }); D.y += n + 8; }

  /* A1 · the two tiers */
  ensure(80); D.section('How to read the levels: two tiers', 'appendix').items = 1;
  const t1 = T.rows.filter((r) => r.tier === 1).map((r) => r.name), t2 = T.rows.filter((r) => r.tier === 2).map((r) => r.name).concat(AQ && !AQ.served ? ['Air quality'] : []);
  D.y += D.para(D.M, D.y, D.cw, 'Tier 1, verified forecasts: a level that passed its event test against measured outcomes and may raise an alert' + (t1.length ? ' (here: ' + t1.join(', ') + ')' : '') + '. Solid tiles on page 1.', { size: 8.6 }) + 3;
  D.y += D.para(D.M, D.y, D.cw, 'Tier 2, context and indicative: screening indexes, susceptibility, outlooks and forecasts not yet tested well enough to act on by themselves' + (t2.length ? ' (here: ' + t2.join(', ') + ', the weeks and season ahead, site screening)' : '') + '. Outlined tiles and marked charts; read them as context for the Tier 1 levels, not as a separate alert.', { size: 8.6 }) + 3;
  if (AQ && !AQ.served) D.y += D.para(D.M, D.y, D.cw, 'Air quality: the day’s US EPA AQI category from the forecast daily PM2.5 (and PM10, the larger sub-index), corrected to the nearest monitored city where one is in reach; a forecast, not a measurement.', { size: 8.6 }) + 3;
  D.y += 6;
  /* A2 · not assessed and cannot happen, with the reasons */
  /* v91.17.283.51 g2 · glacial lakes: ONE count, the lakes whose drainage reaches this point (page 2 prints the same; live test 51 Gilgit:
     276 on page 2 vs the tehsil-wide 3107 here) */
  const glofWhy = (r) => { const G = A.glof; if (r.key !== 'glof' || !G || !fin(G.lakesUpstream) || +G.lakesUpstream <= 0) return null; const c = G.counts || {};
    return 'Site context: ' + G.lakesUpstream + ' mapped glacial lakes drain towards this place (lakes whose drainage reaches this point' + (fin(c.priority) ? '; ' + c.priority + ' at the highest susceptibility tier' : '') + ', as on page 2); susceptibility, not a warning level: no outburst level is issued'; };
  const na = T.notAssessed.map((r) => [r.name, r.state === 'no_level' ? 'No level issued' : 'Not assessed', cap(clean(glofWhy(r) || r.why || SHORT_WHY(r)))]).concat((A.cannotHappen || []).map((r) => [r.name, 'Cannot happen here', cap(clean(r.why || 'outside the area where it can occur'))]));
  if (na.length) { ensure(60); D.section('Not assessed or not relevant here', 'appendix').items = na.length; table(D, [{ t: 'Hazard', w: 0.22, b: true }, { t: 'State', w: 0.18 }, { t: 'Reason', w: 0.6 }], na, { title: 'Not assessed or not relevant here', part: 'appendix' }); D.y += 10; }
  /* A3 · standing measures: each row with its own action */
  const st = standingRows(A);
  if (st.length) { ensure(60); D.section('Standing measures for this season and ground', 'appendix').items = st.length;
    table(D, [{ t: 'Measure', w: 0.2, b: true }, { t: 'Action', w: 0.46 }, { t: 'Why here', w: 0.34, mute: true }], st.map((s) => [standingTitle(s.id), clean(s.measure), cap(clean(s.why))]), { title: 'Standing measures', part: 'appendix' }); D.y += 10; }
  /* A4 · watch list */
  const r72 = rain72(A); const wl = (A.watch || []).filter((w) => w.what).map((w) => (r72 != null && /\b\d+(?:\.\d+)?\s*mm forecast in 72 h\b/.test(String(w.what)) ? { ...w, what: String(w.what).replace(/\b\d+(?:\.\d+)?\s*mm forecast in 72 h\b/, n1(r72) + ' mm forecast in 72 h at the place') } : w));   /* v91.17.283.51 g2 · one rain basis */
  if (wl.length) { ensure(60); D.section('Watch list: below the action line', 'appendix').items = wl.length; table(D, [{ t: 'Item', w: 0.22, b: true }, { t: 'What the forecast shows', w: 0.78 }], wl.map((w) => [clean(w.hazard), cap(clean(String(w.what).split(' — ')[0]).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, Y, M, d) => +d + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+M - 1]))])   /* v91.17.283.49 merge: dates as on the pages (7 Nov), not 2026-11-07 */, { title: 'Watch list', part: 'appendix' }); D.y += 10; }
  if (KX && KX.appendix) KX.appendix(D, A, man, ensure);   /* v91.17.283.51 · the kind's own appendix tables */
  /* A5 · methods */
  ensure(90); D.section('Methods', 'appendix').items = 1;
  const meth = [
    'Values: the place forecast at the point and its height (hourly to 72 hours, daily to 7 days), corrected for the place by the NIGRAAN forecast chain.',
    'Hazard levels: the levels NIGRAAN issues for the place, day by day (heat and cold from the UTCI stress classes of Blazejczyk et al. 2013 at the place; heavy rain from the ensemble rain classes; landslide, drought and the river from their own screening rules).',
    'Days 5 to 15: the spread of 51 ensemble forecast runs (the bar runs from the 1-in-10 to the 9-in-10 run, the line is the middle run). Weeks and season ahead: ensemble anomalies against the model’s own re-forecast normal.',
    /* v91.17.283.51 g2 · live test 51 (10/50-year hottest day 46.3 / 48.2 °C Islamabad, 48.1 / 50.3 Lahore, 41 / 42.8 Clifton): the source and
       its limits, stated where the values are read */
    'Site screening return levels (10- and 50-year hottest day, gusts): a Gumbel fit by L-moments to the calendar-year maxima 1940-2025 of the global reanalysis daily series in its grid cell of about 28 km at the site, moved from the cell height to the site height at 6.5 °C per km. They describe the grid cell, not a weather station: a cell on the coast mixes sea and land and reads cooler than an inland station of the same city (Karachi coast), and on the edge of hills and plains the height move can read warm by about 1 °C; a 50-year value can lie above the highest temperature a station has recorded. Use them for screening; design values come from station records and the design code.' + heatCheckLine(A),
    'Standing measures: the seasonal values are the local calendar-day percentiles (15-day window, 30 recent years) of every day of the next 30 days, at the served height of the tehsil; the heat-season measure is listed only where that window reaches the heat-stress scale. When the forecast is past a seasonal value, the row says so.',
    'Every sentence is written by fixed rules from the figures shown; nothing in this report is written by an AI model.'];
  /* v91.17.283.49 merge: each bullet makes its own room (a long forecast-check line ran into the footer on real data, linter L13) */
  const bullet = (m) => { ensure(D.paraH(D.cw - 8, m, { size: 8.4 }) + 4); D.y += D.para(D.M + 8, D.y, D.cw - 8, m, { size: 8.4 }) + 2; };
  for (const m of meth) bullet('• ' + m);
  if (A.skill && A.skill.line) bullet('• Forecast check: ' + clean(A.skill.line));
  D.y += 8;
  /* A6 · sources and limitations */
  ensure(80); D.section('Sources and limitations', 'appendix').items = 1;
  for (const m of ['Sources: global and regional weather models, local weather observations, satellite rain and land records, the national and published glacial-lake inventories, terrain and land-cover maps; every dataset with its licence and required attribution is listed on the Methods & Verification page of NIGRAAN.',
    'Guidance (where shown): the published guidance of NDMA and the provincial PDMAs.',
    'Limitations: a forecast is not an observation and not an official warning; follow NDMA / PDMA warnings where they are issued. Levels are for the place and its tehsil, not a site survey or a design calculation. Times are Pakistan time (PKT).'])
    bullet('• ' + m);
  D.y += 8;
  /* A7 · evidence */
  /* v91.17.283.52 D · N22 (live test 52: page 5 held only the rest of the Evidence table): the evidence is built first and measured; when the
     table does not fit on the page in hand but the same items fit as one paragraph, they are printed as a paragraph on this page */
  const ev = [['Report', id], ['Report kind', kindTitle + (view === 'operator' ? ' (operator view)' : '')], ['Issued', pkt(o.generatedAt) || 'not available'], ['Place forecast of', pkt(A.issuedAt) || 'not available'], ['Forecast model run', runAt(A) ? pkt(runAt(A)) : 'not available'],
    ['Hazard levels issued', A.levelsAt ? pkt(A.levelsAt) : 'not available']];
  /* v91.17.283.52 D · #108: the place-answer id, analysis snapshot and data digest are operator evidence (the report id above is the customer's
     reference); the customer evidence is plain */
  if (view === 'operator') { ev.push(['Place answer', A.answerId || 'not available']); if (A.provenance && A.provenance.snapshot) ev.push(['Analysis snapshot', A.provenance.snapshot]); if (A.provenance && A.provenance.digest) ev.push(['Data digest (SHA-256)', A.provenance.digest]); }
  const ua = (A.unavailable || []).filter((u) => u.lastGood || view === 'operator');
  for (const u of ua) { const nm = UNAV_NAME[u.part] || null; if (!nm) continue; ev.push([nm, 'not available' + (u.lastGood ? ' (last good: ' + pkt(u.lastGood) + ')' : '')]); man.unavailableShown.push(u.part); }
  if (view === 'operator') { if (A.provenance && A.provenance.chainId) ev.push(['Forecast chain', A.provenance.chainId]); if (A.levelsIssueId) ev.push(['Levels issue', A.levelsIssueId]);
    for (const [k, v] of Object.entries((A.skill && A.skill.measured) || {})) if (Array.isArray(v) && v.length) ev.push(['Measured skill: ' + k, clean(v[0])]); }
  { const bottom = D.H - 50, rowH = (r) => Math.max(D.wrap(String(r[0]), 0.3 * D.cw - 8, 8.4, true).length, D.wrap(String(r[1] == null ? '' : r[1]), 0.7 * D.cw - 8, 8.4, false).length) * 8.4 * 1.25 + 6;
    const hTable = 23 + 15 + ev.reduce((a, r) => a + rowH(r), 0), para = ev.map((r) => r[0] + ': ' + r[1]).join(' · ') + '.', hPara = 23 + D.paraH(D.cw, para, { size: 8.2 }) + 4;
    if (D.y + hTable > bottom && D.y + hPara <= bottom) { D.section('Evidence', 'appendix').items = ev.length; D.y += D.para(D.M, D.y, D.cw, para, { size: 8.2 }) + 4; D.tables.push({ title: 'Evidence', sig: JSON.stringify(ev) }); }
    else { ensure(Math.min(hTable, 90)); D.section('Evidence', 'appendix').items = 1; table(D, [{ t: 'Item', w: 0.3, b: true }, { t: 'Value', w: 0.7 }], ev, { title: 'Evidence', part: 'appendix' }); } }

  footers(D, { id });
  man.pages = D.cv.pages.length; man.parts = D.parts.slice(); man.customerPages = D.parts.filter((p) => p === 'customer').length;
  man.sections = D.sections.map((s) => ({ title: s.title, part: s.part, page: s.page, items: s.items })); man.tables = D.tables.map((t) => ({ title: t.title, sig: t.sig }));
  man.actions = acts.map((a) => ({ title: a.title, action: a.action, trigger: a.trigger }));
  return { cv: D.cv, manifest: man, title };
}
const UNAV_NAME = { levels: 'Hazard levels', hazardCount: 'Hazard levels', smog: 'Air quality', air: 'Air quality', ensemble: '15-day ensemble', reportContext: 'Outlook and actions', siteScreening: 'Site screening', river: 'River', glof: 'Glacial lakes', scenario: 'Saved scenario', facts: 'Place facts', siteLevels: 'Site levels' };
/* v91.17.283.51 · the drawing pieces, for the kinds and the multi-site layout of repkinds.mjs (one look for every report) */
export { Doc, header, footers, tiles, tileRows, airRow, table, placeMap, tagPill, frame, chartTitle, caption, legendItem, axisY, meteogram, days415, ahead, airChart, screening, groundPanel, glofPanel, riverPanel, scenarioPanel, gauge, SHORT_WHY, standingTitle, tehsils, inRing, UNAV_NAME };
export const H = { fin, r1, n1, n0, dObj, dayLab, pkt, pktShort, cap, WORDS, MON, WD, AQI_COL, dueText };
