#!/usr/bin/env node
/* v91.17.71 · NAME-ABSENCE TEST (agent D, data + naming)
   The CEO decision of 25 Sep 2026: the station, lake-inventory and river-limit data AGN receives under its data-sharing
   arrangements is used by default, and the suppliers are NOT named anywhere a customer can see. This test fetches a broad
   set of customer GET routes on the DEFAULT path (no NIGRAAN_INTERNAL_REF) and the built client artefact, and FAILs on
   any term in data/source-labels.json `forbiddenInCustomerOutput`, matched as a whole word (never inside a CSS colour, a
   hash or base64). It also FAILs when a value carrying tier B or C is labelled "MACH-verified" or carries the ●●● mark:
   tier A stays reserved for AGN's own MACH stations.

   node scripts/tests71/names.test.mjs [baseUrl] [--artefact <file>]      (default http://127.0.0.1:8787)
   PASS / FAIL / INFO lines; exit 1 on any FAIL. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
const artIdx = args.indexOf('--artefact');
const ARTEFACT = artIdx >= 0 ? args[artIdx + 1] : join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');

const SL = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8'));
const TERMS = SL.forbiddenInCustomerOutput || [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* whole word: no letter, digit or underscore on either side (Unicode-aware, so ÆGIS is bounded too) */
const RE = TERMS.map((t) => ({ t, re: new RegExp('(?<![\\p{L}\\p{N}_])' + esc(t) + '(?![\\p{L}\\p{N}_])', 'giu') }));
/* base64 / data URIs / long hex are not text: removed before matching */
const unB64 = (s) => s.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, ' ').replace(/[A-Za-z0-9+/]{120,}={0,2}/g, ' ').replace(/#[0-9a-fA-F]{3,8}\b/g, ' ');

let fails = 0, passes = 0;
const PASS = (m) => { passes++; console.log('PASS ' + m); };
const FAIL = (m) => { fails++; console.log('FAIL ' + m); };
const INFO = (m) => console.log('INFO ' + m);

function hits(text) {
  const s = unB64(text); const out = [];
  for (const { t, re } of RE) { re.lastIndex = 0; let m; while ((m = re.exec(s))) out.push({ t, at: m.index, ctx: s.slice(Math.max(0, m.index - 70), m.index + t.length + 70).replace(/\s+/g, ' ') }); }
  return out;
}
/* tier B/C values must never carry the MACH-verified label or the tier-A mark */
function machAbuse(j, path = '$', out = []) {
  if (Array.isArray(j)) { j.forEach((x, i) => machAbuse(x, path + '[' + i + ']', out)); return out; }
  if (!j || typeof j !== 'object') return out;
  const tier = typeof j.tier === 'string' ? j.tier.trim().toUpperCase() : null;
  if (tier === 'B' || tier === 'C') {
    for (const [k, v] of Object.entries(j)) if (typeof v === 'string' && (/MACH[\s-]*verified/i.test(v) || v.includes('●●●'))) out.push(path + '.' + k + ' = ' + v.slice(0, 80) + ' (tier ' + tier + ')');
  }
  for (const [k, v] of Object.entries(j)) if (v && typeof v === 'object') machAbuse(v, path + '.' + k, out);
  return out;
}

async function get(p, timeoutMs = 60000) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), timeoutMs);
  try { const r = await fetch(BASE + p, { signal: ac.signal }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, text: t, json: j }; }
  catch (e) { return { status: 0, text: '', json: null, error: e.message }; } finally { clearTimeout(tm); }
}

/* ── the customer routes (default path) ─────────────────────────────────────────────────────────────── */
const GB = { name: 'Gilgit', lat: 35.92, lon: 74.31 }, PLAINS = { name: 'Lahore City', lat: 31.55, lon: 74.34 };
const ROUTES = [
  '/api/health', '/api/v1/health', '/api/sources', '/api/v1/sources', '/api/skill', '/api/idf',
  '/api/v1/national/snapshots/latest', '/api/v1/national/hazards/heat', '/api/outlook/national', '/api/outlook/status',
  `/api/outlook/unit?unit=${encodeURIComponent(GB.name)}&lat=${GB.lat}&lon=${GB.lon}`,
  `/api/outlook/unit?unit=${encodeURIComponent(PLAINS.name)}&lat=${PLAINS.lat}&lon=${PLAINS.lon}`,
  '/api/glof/national', `/api/point?lat=${GB.lat}&lon=${GB.lon}`, '/api/glof/live', '/api/glof/events', '/api/glof/bulletins', '/api/glof/outlook',
  '/api/flood/national', '/api/flood/status', '/api/flood/point?id=guddu', '/api/flood/snapped',
  '/api/climatology/thresholds', `/api/point?lat=${PLAINS.lat}&lon=${PLAINS.lon}`,   /* v91.17.283.19: the glof and climatology parts are in the place bundle */
  '/api/obs/bias', '/api/obs/bias/table', '/api/verification/wet-hours', `/api/obs/bias/point?lat=${GB.lat}&lon=${GB.lon}`,
  '/api/case/families', '/api/case/status', '/api/ops/health', '/api/checks', '/api/limits/vars', '/api/verification/grades',
  '/api/mos/status', '/api/fleet/status', '/api/ai/status', '/api/map/layers',
  `/api/report/context?unit=${encodeURIComponent(GB.name)}`, `/api/report/context?unit=${encodeURIComponent(PLAINS.name)}`,
  ...['temperature in Gilgit tomorrow', 'flood risk in Sukkur this week', 'glacial lake outburst risk in Hunza'].map((q) => '/api/ai/evidence?prompt=' + encodeURIComponent(q) + '&compact=1'),
];

async function main() {
  INFO('base ' + BASE + ' · terms: ' + TERMS.join(', '));
  const H = await get('/api/health', 10000);
  if (H.status !== 200) { FAIL('server not reachable at ' + BASE + ' (' + (H.error || H.status) + ')'); process.exit(1); }
  const Fs = await get('/api/flood/status');
  if (Fs.json && Fs.json.internalRef === true) FAIL('the server runs with NIGRAAN_INTERNAL_REF=1: this test reads the DEFAULT customer path; restart without it');
  /* the map layers named in the catalogue are fetched too (first 12) */
  const cat = await get('/api/map/layers');
  const layerIds = [];
  try { const L = cat.json && (cat.json.layers || cat.json.catalogue || cat.json); (Array.isArray(L) ? L : Object.values(L || {})).forEach((x) => { const id = x && (x.id || x.key); if (id && layerIds.length < 12) layerIds.push(id); }); } catch (_) {}
  const routes = ROUTES.concat(layerIds.map((id) => '/api/map/layer?id=' + encodeURIComponent(id)));
  let routeHits = 0, fetched = 0; const perTerm = {};
  for (const p of routes) {
    const r = await get(p, 90000);
    if (!r.status) { INFO('no answer: ' + p + ' (' + r.error + ')'); continue; }
    fetched++;
    const h = hits(r.text);
    if (h.length) { routeHits += h.length; h.forEach((x) => { perTerm[x.t] = (perTerm[x.t] || 0) + 1; }); FAIL('names in ' + p + ' (HTTP ' + r.status + '): ' + h.length + ' × ' + [...new Set(h.map((x) => x.t))].join(', ') + ' · e.g. …' + h[0].ctx + '…'); }
    else PASS('no supplier name in ' + p + ' (HTTP ' + r.status + ', ' + r.text.length + ' bytes)');
    if (r.json) { const ab = machAbuse(r.json); if (ab.length) FAIL('tier B/C labelled MACH-verified in ' + p + ': ' + ab.slice(0, 3).join(' | ')); }
  }
  INFO('routes fetched ' + fetched + ' of ' + routes.length + '; supplier-name occurrences on routes: ' + routeHits + (routeHits ? ' ' + JSON.stringify(perTerm) : ''));

  /* ── the built client artefact ─────────────────────────────────────────────────────────────── */
  if (!existsSync(ARTEFACT)) { FAIL('artefact not found: ' + ARTEFACT); }
  else {
    const A = readFileSync(ARTEFACT, 'utf8');
    const { visible, comments } = splitArtefact(A);
    const hv = hits(visible), hc = hits(comments);
    const byT = (h) => h.reduce((o, x) => (o[x.t] = (o[x.t] || 0) + 1, o), {});
    INFO('artefact ' + ARTEFACT.split('/').pop() + ': ' + A.length + ' bytes · occurrences in strings/visible text: ' + hv.length + ' ' + JSON.stringify(byT(hv)) + ' · in code comments (not shown): ' + hc.length + ' ' + JSON.stringify(byT(hc)));
    if (hv.length) { FAIL('artefact carries ' + hv.length + ' supplier name(s) in strings or visible text'); hv.slice(0, 25).forEach((x) => INFO('  artefact: ' + x.t + ' · …' + x.ctx + '…')); }
    else PASS('artefact: no supplier name in strings or visible text');
    const mv = (visible.match(/[^\n]{0,60}MACH[\s-]*verified[^\n]{0,60}/gi) || []).filter((s) => /tier\s*[BC]\b|●●○|●○○/i.test(s));
    if (mv.length) FAIL('artefact: "MACH-verified" beside a tier B/C mark: ' + mv.slice(0, 3).join(' | ')); else PASS('artefact: no "MACH-verified" beside a tier B/C mark');
  }
  console.log(`\n${passes} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
}

/* Split the artefact into what can reach a reader (HTML text, attribute values, JS/CSS string literals) and code comments.
   <style> blocks are dropped (colours, not text). In <script>, a small tokenizer tracks strings, template literals,
   regex literals and comments; identifiers and code tokens are dropped, so FFD_CAL or ffdNearest are not text. */
function splitArtefact(src) {
  let visible = '', comments = '';
  const html = src.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let last = 0, m;
  while ((m = re.exec(html))) {
    const before = html.slice(last, m.index);
    visible += before.replace(/<!--([\s\S]*?)-->/g, (_, c) => { comments += c + '\n'; return ' '; }) + '\n';
    const r = scanJs(m[1]); visible += r.strings + '\n'; comments += r.comments + '\n';
    last = re.lastIndex;
  }
  visible += html.slice(last).replace(/<!--([\s\S]*?)-->/g, (_, c) => { comments += c + '\n'; return ' '; });
  return { visible, comments };
}
function scanJs(s) {
  const strs = [], coms = []; let i = 0; const n = s.length; let prev = '';
  const regexOK = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of|delete|void|throw|new|else|do)$/.test(prev);
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { const e = s.indexOf('\n', i); const j = e < 0 ? n : e; coms.push(s.slice(i + 2, j)); i = j; continue; }
    if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; coms.push(s.slice(i + 2, j - 2)); i = j; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; } strs.push(s.slice(i + 1, j)); i = j + 1; prev = 'x'; continue; }
    if (c === '`') { let j = i + 1, buf = ''; let depth = 0;
      while (j < n) { const ch = s[j]; if (ch === '\\') { buf += s[j + 1] || ''; j += 2; continue; } if (depth === 0 && ch === '`') break; if (ch === '$' && s[j + 1] === '{' ) { depth++; buf += ' '; j += 2; continue; } if (depth > 0 && ch === '}') { depth--; j++; continue; } if (depth > 0 && (ch === '"' || ch === "'")) { let k = j + 1; while (k < n && s[k] !== ch && s[k] !== '\n') { if (s[k] === '\\') k++; k++; } buf += ' ' + s.slice(j + 1, k) + ' '; j = k + 1; continue; } if (depth === 0) buf += ch; j++; }
      strs.push(buf); i = j + 1; prev = 'x'; continue; }
    if (c === '/' && regexOK()) { let j = i + 1, cls = false; while (j < n && s[j] !== '\n') { const ch = s[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; j++; } i = j + 1; while (i < n && /[a-z]/i.test(s[i])) i++; prev = 'x'; continue; }
    if (!/\s/.test(c)) { if (/[A-Za-z0-9_$]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_$]/.test(s[j])) j++; prev = s.slice(i, j); i = j; continue; } prev = c; }
    i++;
  }
  return { strings: strs.join('\n'), comments: coms.join('\n') };
}

main().catch((e) => { console.log('FAIL test crashed: ' + e.stack); process.exit(1); });
