/* ══ v91.17.172 · CUSTOMER SCRUB: supplier names out of customer JSON, server side ═════════════════════════════════════
   Audit E-3 step 3, E-14, O-9 (5 Oct 2026): /api/report/context (subseasonal.model, seasonal.model, standing[].evidence,
   watch[].source, air notes), /api/ai/chat answers ("the ERA5 bias correction", "ERA5 7-28 cm and 28-100 cm") and the
   limits evaluation ("ECMWF IFS run", "GloFAS control run") carried supplier names whatever the view. The page's own screen
   rules (build/operator_ui.html) only rewrite text after it is painted, so an API consumer or a printed report read the names.

   One function, one rule source (data/source-labels.json, read through refmode label()):
     1. customerRules_v172.rules   CAMS / NASA FIRMS / Open-Meteo / Visual Crossing / IEM / Ogimet wording and the licence line
     2. screenRules_v76.rules      the existing v76 role-word rules (ECMWF ENS/IFS/SEAS5/EC46, ERA5, GloFAS, NOAA, PMD, FFD ...)
     3. customerNames_v172.rules   safety net: any supplier token left, also inside an identifier or a file name
   Keys are renamed with customerNames_v172.keyRules (pm25Cams → pm25Aq, ifsEra5 → ifsReanalysis); no page reads those keys.
   Operator and internal views never pass through here, so they keep the names. SUPARCO (namedPublic) is never touched. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { label } from './refmode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = () => join(process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data'), 'source-labels.json');

let C = null, Cat = 0, Cm = 0;
/* ══ v91.17.283.38 · item 1 · THE SAME TEXT IS SCRUBBED ONCE ═════════════════════════════════════════════════════════════════════════
   Live 30 Oct: the event loop stopped for 4-9 s many times an hour; profiled on the test server under page load, the longest stops were
   the customer scrub of the place answers (17.5 s in one stretch: every string of a 1.8 MB answer through every rule, twice, then the
   whole answer serialised twice more to see whether anything changed). A place answer repeats the same strings (labels, sources, reasons)
   and the next answer of the same place repeats nearly all of them: each rule set now keeps the result per input string (strings up to
   4 KB, at most 60,000 per set; the sets are emptied whenever the rules are read again from data/source-labels.json). The output is
   the same text: a kept result is the result the rules gave for that exact string. */
const MEMO_MAX = 60000, MEMO_LEN = 4096;
const MEMO = { text: new Map(), key: new Map(), client: new Map(), agency: new Map() };
const memoClear = () => { for (const m of Object.values(MEMO)) { m.clear(); try { MEMO_N.delete(m); } catch (_) {} } };
/* v91.17.283.51 · memory · each set is also bounded by the characters it holds (key + result, NIGRAAN_SCRUB_MEMO_MCHARS, default 6 M chars, about
   12 MB): a sweep of new places brings new strings with every answer, and 60,000 strings of up to 4 KB per set could hold hundreds of MB */
const MEMO_CHARS = Math.max(1, Number(process.env.NIGRAAN_SCRUB_MEMO_MCHARS) || 6) * 1e6, MEMO_N = new Map();
function memo(m, s, f) { if (s.length > MEMO_LEN) return f(s); const h = m.get(s); if (h !== undefined) return h; const r = f(s);
  const add = s.length + (typeof r === 'string' ? r.length : 16); let n = (MEMO_N.get(m) || 0) + add;
  if (m.size >= MEMO_MAX || n > MEMO_CHARS) { m.clear(); n = add; } MEMO_N.set(m, n); m.set(s, r); return r; }
let CHG = 0;   /* agencyBody: how many strings or keys the walk changed (none: the body is sent unchanged, with no re-serialisation) */
function compile(list) {
  const out = [];
  for (const r of (Array.isArray(list) ? list : [])) {
    if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
    try { out.push([new RegExp(r[0], r[1] || 'g'), String(r[2] ?? '').replace(/\{(\w+)\}/g, (m, k) => label(k))]); } catch (_) { /* a bad rule is skipped, never fatal */ }
  }
  return out;
}
function rules() {
  const now = Date.now();
  if (C && now - Cat < 60000) return C;
  let m = 0; try { m = statSync(FILE()).mtimeMs; } catch (_) {}
  if (C && m === Cm) { Cat = now; return C; }
  let L = {}; try { L = existsSync(FILE()) ? JSON.parse(readFileSync(FILE(), 'utf8')) : {}; } catch (_) { L = {}; }
  const pre = compile(L.customerRules_v172 && L.customerRules_v172.rules);
  const v76 = compile(L.screenRules_v76 && L.screenRules_v76.rules);
  const net = compile(L.customerNames_v172 && L.customerNames_v172.rules);
  const keys = compile(L.customerNames_v172 && L.customerNames_v172.keyRules);
  const client = compile(L.clientRules_v28328 && L.clientRules_v28328.rules);   /* v283.28 S8: the page name table, moved here */
  C = { text: [...pre, ...v76, ...net], keys, client }; Cat = now; Cm = m; memoClear(); return C;
}

export function scrubText(s) {
  if (typeof s !== 'string' || !s) return s;
  const R = rules(); return memo(MEMO.text, s, (x) => { let t = x; for (const [re, rep] of R.text) { re.lastIndex = 0; t = t.replace(re, rep); } return t; });
}
function scrubKey(k) { const R = rules(); return memo(MEMO.key, k, (x) => { let t = x; for (const [re, rep] of R.keys) { re.lastIndex = 0; t = t.replace(re, rep); } return t; }); }

/* deep copy with every string value rewritten and every supplier-named key renamed */
export function customerScrub(x, depth = 0) {
  if (depth > 40) return x;
  if (typeof x === 'string') return scrubText(x);
  if (Array.isArray(x)) return x.map((v) => customerScrub(v, depth + 1));
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[scrubKey(k)] = customerScrub(v, depth + 1); return o; }
  return x;
}

/* the supplier tokens the audit greps for; used by tests and by a last check before a customer response leaves */
export const SUPPLIER_RE = /ECMWF|ERA5|Open-Meteo|NOAA|CAMS|GloFAS|Visual Crossing|WeatherKit|Apple Weather|Ogimet|(?<![\w-])(?:IEM|PMD|FFD)(?![\w-])/i;   /* v91.17.269 · + the further secondary forecast (never named to clients) */

/* ══ v91.17.283.1 · CUSTOMER-VIEW AGENCY SCRUB AT THE RESPONSE POINT ═══════════════════════════════════════════════════════════════
   Owner rule: the two national agencies (PMD, FFD) are never named to clients; that is internal only. The owner's laptop run of the
   permanent lint (N2) found the names in four customer answers whose text comes from data files the route passes through as written
   (data/asset-operations.json sources, data/drought-chirps.json provisionalRule, data/model-skill.json verification / zones): those routes
   had no customerScrub of their own. Fixing route by route leaves the next data file open, so server.mjs applies agencyScrub to EVERY
   /api answer of a customer request (installAgencyScrub, the same response point as the wire compression); operator and internal views
   are never passed through it and keep the names. Only the two agencies are rewritten (other supplier wording stays with customerScrub
   and its routes); the India Meteorological Department may be named. Phrases first, in neutral wording that still reads as a sentence,
   then a safety net for any token left. Keys are rewritten only when they carry a name. */
const AG_ADJ = '(?:valley|mountain|city|plains|synop(?:tic)?|AWS|ARG|EWS|automatic|station|stations|gauge|gauges|network|networks|bulletin|bulletins|record|records|data|observations?|daily|rainfall|reported|portal|portals|export|feed|inventory|register|lake|10-minute|river|flow|limits?|sheets?|Karachi|Lahore|Multan|Islamabad|\\d{4})';
const AGENCY_RULES = [
  /* v91.17.283.28 · S8 · the phrases the Customize page's own table had (NIGRAAN_3 CLEAN), now here first */
  [/, Flood Forecasting Division, PMD \u2014 limits published in lacs /g, ', official river flood-warning limits, published in lacs '],
  [/Flood Forecasting Division, Pakistan Meteorological Department/g, 'official river flood-warning limits (under data-sharing arrangements)'],
  [/PMD holds official warning authority\./g, 'Official warnings are issued by the national warning authorities.'],
  [/\bofficial FFD flood limits\b/g, 'official flood limits'], [/\(FFD observed-equivalent factor/g, '(gauge observed-equivalent factor'],
  [/India Meteorological Department\s*\/\s*PMD rainfall intensity classes \(24-hour\)/g, 'standard 24-hour rainfall intensity classes (India Meteorological Department scale)'],
  [/(India Meteorological Department|\bIMD\b)\s*(?:\/|and|&)\s*(?:PMD|Pakistan Meteorological Department)(?![\w-])/g, '$1'],
  [/(?<![\w-])(?:PMD|Pakistan Meteorological Department)\s*(?:\/|and|&)\s*(India Meteorological Department|IMD\b)/g, '$1'],
  [/(?:\b(?:the|The) )?independent PMD[- ]EWS valley (?:gauges|stations|AWS)/g, (m) => (m[0] === 'T' ? 'The' : 'the') + ' independent valley gauge network'],
  [/PMD[- ]EWS valley (?:gauges|stations|AWS)/g, 'independent valley gauge network'],
  [/PMD[- ]EWS(?=[ -](?:gauges?|stations?|check|AWS|record|records|data|file|append|network|archive))/g, 'valley-network'],
  [/PMD[- ]EWS/g, 'the independent valley gauge network'],
  [/(?:\b(?:the|The) )?Pakistan Meteorological Department(?: \(PMD\))?/g, (m) => (m[0] === 'T' ? 'The' : 'the') + ' national meteorological service'],
  [/(?:\b(?:the|The) )?Flood Forecasting Division(?: \(FFD\))?/g, (m) => (m[0] === 'T' ? 'The' : 'the') + ' national flood-warning service'],
  [/(?<![\w-])PMD's/g, 'the national station network\'s'],
  [/(?<![\w-])FFD's/g, 'the national flood-warning service\'s'],
  [new RegExp('(?<![\\w-])PMD(?=[ -]' + AG_ADJ + '\\b)', 'g'), 'national-network'],
  [new RegExp('(?<![\\w-])FFD(?=[ -]' + AG_ADJ + '\\b)', 'g'), 'national flood-warning'],
  /* v91.17.283.28 · S8 · the partner network's own names (EWS, "partner network") are never shown to a client either */
  [/(?<![\w-])EWS(?=[ -](?:gauges?|stations?|AWS|network|record|records|data|hydrology|weather|valley))/g, 'valley-network'],
  [/(?:\b(?:the|The) )?(?<![\w-])EWS(?![\w-])/g, (m) => (m[0] === 'T' ? 'The' : 'the') + ' independent valley gauge network'],
  [/\b(?:a|the|The|A) partner[- ]network\b/g, (m) => (m[0] === 'T' || m[0] === 'A' ? 'The' : 'the') + ' independent station network'],
  [/\bpartner[- ]network\b/gi, 'independent station network'],
  [/(?:\b(?:the|The) )?\bPMD\b/g, (m) => (m[0] === 'T' ? 'The' : 'the') + ' national station network'],
  [/(?:\b(?:the|The) )?\bFFD\b/g, (m) => (m[0] === 'T' ? 'The' : 'the') + ' national flood-warning service'],
];
export const AGENCY_RE = /\bPMD\b|Pakistan Meteorological Department|\bFFD\b|Flood Forecasting Division|(?<![\w-])EWS(?![\w-])|partner[- ]network/i;
export function agencyText(s) {
  if (typeof s !== 'string' || !s) return s;
  return memo(MEMO.agency, s, (x) => { if (!AGENCY_RE.test(x)) return x; let t = x; for (const [re, rep] of AGENCY_RULES) { re.lastIndex = 0; t = t.replace(re, rep); } return t; });
}
/* == v91.17.283.28 · S8 · ONE HOME FOR CLIENT WORDING AT THE RESPONSE POINT ===========================================================
   Every customer /api answer passes agencyBody (server.mjs installAgencyScrub). A SENTENCE (a string holding white space) is rewritten by
   the page's former name table (data/source-labels.json clientRules_v28328, NIGRAAN_3's CLEAN) and the supplier rule sets
   (customerRules_v172, screenRules_v76, customerNames_v172), then by the agency rules; a single token (an id, a model key, an enum value
   the page code compares) gets the agency rules only, so no identifier the pages read is changed. Keys: the agency rule only. */
export const CLIENT_TRIGGER = /PMD|FFD|EWS|Pakistan Meteorological|Flood Forecasting|partner[- ]network|ECMWF|ERA5|Open-?Meteo|NOAA|NWS|CAMS|GloFAS|Visual ?Crossing|Ogimet|IEM|USGS|MET Norway|Met Office|NASA|IMERG|SEAS5|EC46|IFS|AIFS|HRES|Google|DeepMind|GraphCast|WeatherNext|DWD|KNMI|M\u00e9t\u00e9o-France|GHS-POP|ISD-Lite|GLOF-II|AEGIS|Akin Gump|Copernicus|JRC|NDMA|HAND|HighResMIP|WeatherKit|Apple Weather|era5|ecmwf|open-?meteo/;
/* a licence credit (CC BY attribution, a "Sources:" methods line, a licence or attribution text) names its source by obligation: only the
   agency rule applies to it */
export const LICENCE_LINE = /^Sources(?: and licences)?:|\bCC[ -]BY\b|\blicen[cs]e[ds]?\b|\battribution\b|\bcredited\b/i;
/* v91.17.283.33 · owner live check (29 Oct, Scenario tab): customer text never shows file or function names of the code ("utcilevel.mjs
   heatCellOf", "server/science/modules", "data/rain-return-levels.json"). In a SENTENCE a parenthesis naming a code file is dropped and a
   remaining code file or folder reference is removed; single tokens (ids, paths the pages read) are untouched. Operators see the full text. */
export const CODE_RE = /[\w-]+\.(?:mjs|json|py)\b|\b(?:server|data|scripts|station-lake)\/[\w./-]+/;
export function codeText(s) {
  if (typeof s !== 'string' || !/\s/.test(s) || !CODE_RE.test(s)) return s;
  let t = s.replace(/\s*\([^()]*?(?:[\w-]+\.(?:mjs|json|py)\b|\b(?:server|data|scripts|station-lake)\/)[^()]*?\)/g, '');
  t = t.replace(/\s*(?:[\w-]+\/)*[\w-]+\.(?:mjs|json|py)\b(?:\s+[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*(?:\(\))?)?/g, '');
  t = t.replace(/\s*\b(?:server|data|scripts|station-lake)\/[\w./-]+/g, '');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s*\)/g, '').trim();
  return t || s;
}
export function clientText(s) {
  if (typeof s !== 'string' || !s) return s;
  rules(); return memo(MEMO.client, s, clientText0);
}
function clientText0(s) {
  if (/\s/.test(s) && CODE_RE.test(s) && !LICENCE_LINE.test(s)) s = codeText(s);
  if (!/\s/.test(s) || !CLIENT_TRIGGER.test(s) || LICENCE_LINE.test(s)) return agencyText(s);
  let t = agencyText(s); const R = rules(); for (const [re, rep] of R.client) { re.lastIndex = 0; t = t.replace(re, rep); }
  for (const [re, rep] of R.text) { re.lastIndex = 0; t = t.replace(re, rep); }
  return agencyText(t);
}
function agencyOnly(x, depth = 0) { if (depth > 60) return x; if (typeof x === 'string') { const r = agencyText(x); if (r !== x) CHG++; return r; } if (Array.isArray(x)) return x.map((v) => agencyOnly(v, depth + 1));
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) { const k2 = AGENCY_RE.test(k) ? agencyText(k) : k; if (k2 !== k) CHG++; o[k2] = agencyOnly(v, depth + 1); } return o; } return x; }
/* deep copy with every string (and every key that carries a name) rewritten; untouched values keep their identity */
export function agencyScrub(x, depth = 0) {
  if (depth > 60) return x;
  if (typeof x === 'string') { const r = clientText(x); if (r !== x) CHG++; return r; }
  if (Array.isArray(x)) return x.map((v) => agencyScrub(v, depth + 1));
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) { const k2 = AGENCY_RE.test(k) ? agencyText(k) : k; if (k2 !== k) CHG++; o[k2] = LICENCE_KEY.test(k) ? agencyOnly(v, depth + 1) : agencyScrub(v, depth + 1); } return o; }
  return x;
}
/* v91.17.283.28 · a value held under a licence-credit key (attribution, licence, credit, citation, copyright) is the credit the licence
   requires ("Contains modified Copernicus ... information"): only the agency rule applies to it, as to a licence line */
export const LICENCE_KEY = /^(attribution|licen[cs]e|credits?|citation|copyright|requiredAttribution)$/i;
/* a whole response body: JSON is parsed, scrubbed and written back in the same layout (compact, or the 2-space indent of server.mjs json());
   any other text is scrubbed as text. Returns null when the body carries no name (the bytes are sent unchanged). */
/* o.licence: an answer that is a licence register (GET /api/sources): its names are the licence credits, only the agency rule applies */
/* v91.17.283.53 · C · event loop: a large customer answer (a place bundle is 1-2 MB) was parsed, walked and written again at the response point
   every time it was sent (0.5-1 s of the server's one thread per send; the completion read and every repeat view send the same bytes). The
   result for the same bytes is now kept (bodies over 64 KB, at most 48 MB, keyed by kind, length and sha-1 of the bytes; cleared when the
   name rules are reloaded): the same bytes out for the same bytes in. */
const BODY = new Map(); let BODY_BYTES = 0, BODY_RULES = null;
export function agencyBody(buf, type, o = {}) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  if (text.length < 65536) return agencyBody0(text, type, o);
  const R0 = rules(); if (R0 !== BODY_RULES) { BODY.clear(); BODY_BYTES = 0; BODY_RULES = R0; }
  const k = (o.licence ? 'L' : 'C') + (/json/i.test(String(type || '')) ? 'j' : 't') + '|' + text.length + '|' + createHash('sha1').update(text).digest('base64');
  if (BODY.has(k)) { const v = BODY.get(k); BODY.delete(k); BODY.set(k, v); return v; }
  const r = agencyBody0(text, type, o);
  BODY.set(k, r); BODY_BYTES += (r ? r.length : 0) + 64;
  while (BODY_BYTES > 48 * 1048576 && BODY.size) { const [k0, v0] = BODY.entries().next().value; BODY.delete(k0); BODY_BYTES -= (v0 ? v0.length : 0) + 64; }
  return r;
}
function agencyBody0(text, type, o = {}) {
  if (!AGENCY_RE.test(text) && !CLIENT_TRIGGER.test(text) && !CODE_RE.test(text)) return null;   /* v283.33 · + code references */
  if (/json/i.test(String(type || ''))) {
    let j; try { j = JSON.parse(text); } catch (_) { j = undefined; }
    /* v283.38 item 1: a walk that changed no string and no key leaves the body as it was (sent unchanged, as before) without serialising
       it twice to find that out; a walk that changed something is serialised once */
    if (j !== undefined) { const ind = /^[[{]\n {2}"/.test(text) ? 2 : 0; CHG = 0; const out = o.licence ? agencyOnly(j) : agencyScrub(j); if (!CHG) return null; const t2 = JSON.stringify(out, null, ind || undefined); return t2 === text ? null : Buffer.from(t2); }
  }
  const out = o.licence ? agencyText(text) : clientText(text); return out === text ? null : Buffer.from(out);
}
