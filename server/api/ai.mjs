/* Reasoning for the AI Decision chat, through a free-tier OpenAI-compatible provider.
   The key stays on this server. The model explains numbers NIGRAAN issued; it does
   not produce governed numbers (the artefact's aiNumberFirewall), and the reply is
   checked for governed-kind numbers that were not in the grounding before it returns. */
/* v91.17.283.8 · science audit · the landslide number the AI quotes: the observed ratio of the model's class (landslideodds.mjs observedOf) */
const LS_NOTE = 'how often a rain-triggered landslide happened, in the held-out test, on days the model put in the same class, against an ordinary day here at this time of year (observedTimesOrdinaryDay: quote this number, never a model multiplier); the classes rank days, they are not a probability';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { newId, nowIso } from './core.mjs';
import { stationData, internalNames, label } from './refmode.mjs';   /* v91.17.71 · data use vs naming */
import { customerScrub } from './customerscrub.mjs';   /* v91.17.172 · audit E-14 */
import { utci as utciF, tmrt as tmrtF, sunElev as sunElevF, utciClass as utciClassF } from './utci.mjs';
import { meanRadiantTemperature, cosSolarZenith, FIXED_ALBEDO } from './thermal.mjs';   /* v91.17.101 · N1 */
import { unitAtPoint } from './unitresolve.mjs';   /* v91.17.266 · the dashboard point → its tehsil */
import { servedUnit, servedNational, levelTag, NOT_ASSESSED } from './served.mjs';   /* v91.17.283 · WS4 · the one served-levels function */
import { skillEvidence, evidenceLines } from './evidence.mjs';   /* v91.17.283 · WS4 · measured skill, generated from the evidence files */
import { LAYER_NAME } from './engine.mjs';   /* v91.17.283 · WS4 · one client name per hazard (the engine's) */
import { clientWhy } from './clientwhy.mjs';   /* v91.17.283 · INTEG (F4): plain reasons, never raw exception text */
import { measuredRain24 } from './ewsrain.mjs';   /* v91.17.283.44 · measured past-24 h rain at a nearby mountain gauge (switch NIGRAAN_EWS_RAIN24, OFF) */
import { GUIDANCE_ON, WHAT_TO_DO_Q, guidanceAnswer } from './guidance.mjs';   /* v91.17.283.48 · "What to do here" (GUIDANCE_PANEL=1) */

const PROVIDERS = {
  /* Prefer Llama / Qwen first: gpt-oss-120b on Groq's free tier often answers HTTP 413 (8k TPM) for a full facts pack. */
  groq:       { base: 'https://api.groq.com/openai/v1', prefer: [/llama-3\.3-70b/, /llama-4/, /qwen/, /llama/, /gpt-oss-120b/] },
  cerebras:   { base: 'https://api.cerebras.ai/v1', prefer: [/llama-3\.3-70b/, /qwen/, /llama/, /gpt-oss-120b/] },
  openrouter: { base: 'https://openrouter.ai/api/v1', prefer: [/deepseek.*:free/, /llama-3\.3-70b.*:free/, /qwen.*:free/, /:free$/] },
  ollama:     { base: 'http://127.0.0.1:11434/v1', prefer: [/qwen3/, /llama3\.3/, /gpt-oss/, /llama/, /./] },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/openai', prefer: [/gemini-2\.5-flash$/, /gemini-.*flash$/, /gemini/] },
};

/* v91.17.70 · data-source decision option 2: PMD and SUPARCO material is internal-only. The old facts (station-lake notes,
   the airport-thermometer guard, the reanalysis "verification") come back only with NIGRAAN_INTERNAL_REF=1. */
/* v91.17.71 · every gate below controls NAMES or station-measured figures (the mountain-network notes, the airport guard, the
   reanalysis diagnostic): internalNames(). The station-derived DATA reaches the facts through the served national records
   (calibrated, tier B), the climatology and the zone-basis point forecast; scrubNames() keeps supplier names out of every
   facts pack on the default path. */
const INTERNAL = () => internalNames();
let FORBID = null, FORBIDat = 0;
export function namesRegex(dataDir) {
  if (FORBID && Date.now() - FORBIDat < 60000) return FORBID;
  try { const f = join(dataDir || process.env.NIGRAAN_DATA_DIR || join(process.cwd(), 'data'), 'source-labels.json'); const L = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')).forbiddenInCustomerOutput || []) : [];
    FORBID = L.length ? new RegExp('(?<![\\p{L}\\p{N}_])(' + L.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')(?![\\p{L}\\p{N}_])', 'giu') : null; } catch (_) { FORBID = null; }
  FORBIDat = Date.now(); return FORBID;
}
/* the facts pack on the default path: a supplier name in any string (a label another module wrote) becomes the generic
   credit line; keys are left alone (the renderer never prints a key) */
export function scrubNames(x, re, repl) {
  if (!re) return x;
  if (typeof x === 'string') { re.lastIndex = 0; if (!re.test(x)) return x; re.lastIndex = 0; return x.replace(re, repl); }
  if (Array.isArray(x)) return x.map((v) => scrubNames(v, re, repl));
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = scrubNames(v, re, repl); return o; }
  return x;
}

/* ══ v91.17.70 · SLOT RENDERING: EVERY NUMBER IN AN AI ANSWER IS WRITTEN BY CODE ═════════════════════════════════
   The board (seat_ai_ml.md W6) measured the old firewall passing 7 of 9 invented-number strings: it allowed any number
   that appeared ANYWHERE in the facts JSON, including digits inside key names ("pr25" let "a 25% chance of a flood"
   through) and dates ("2026-09-30" let "30 C" through); spelled numbers and Urdu digits were never checked.
   [measured: audit/board/seat_ai_ml_checks/fw_test.out]

   The rule is now structural, not a presence check:
   1. slotPack(facts) gives every number in the facts an id ({n12}) and every date an id ({d3}). The model is shown the
      token beside the value and must write the token; renderSlots() puts the value in from the facts. {fact:path} is
      accepted as well (the path into the facts pack).
   2. After rendering, a sentence that still carries a digit the model typed itself - ASCII, Arabic-Indic ٠-٩,
      Extended Arabic-Indic (Urdu) ۰-۹, full-width, any Unicode decimal digit - is removed whole. A token that mixes
      letters and digits (F-10, PM2.5, GL1) passes only if it is a word of a string value in the facts.
   3. Spelled-out numbers (four ... ninety, hundred, thousand, million, lakh, crore; the Urdu words) are removed.
   4. A probability or return-period phrase ("% chance", "probability", "1 in 50 year", "once in a century",
      Urdu فیصد / امکان / احتمال) stands only beside a slot whose facts path is a probability (chance/pct/share) or a
      return period, and a probability of a named hazard only beside a slot whose path names that hazard.
   5. A class word (Act, Watch, Monitor, Clear, Severe, High, Moderate, Low, Minimal, Extreme) said of a hazard stands
      only if the facts carry that class for that hazard.
   Sentences split on . ! ? and on the Urdu full stop ۔ and question mark ؟. */
/* ══ v91.17.266 · A TYPO OF A WEATHER WORD IS NOT A PLACE (CEO build v266) ═══════════════════════════════════════════════════════
   MEASURED on the dashboard: "frecast 7 days" went to the gazetteer as a place name. The question words people type are a short
   closed list; a token of five letters or more within two edits (optimal string alignment: insert, delete, substitute, swap two
   neighbours) of one of them is that word mistyped, never a place, UNLESS the token is itself a unit name (tehsil, district,
   province: an exact place beats a fuzzy word). Shorter tokens count only when spelt exactly. */
export const INTENT_WORDS = ['forecast', 'forecasts', 'weather', 'rain', 'rains', 'rainy', 'raining', 'rainfall', 'shower', 'showers', 'precipitation',
  'heat', 'heatwave', 'hot', 'temperature', 'temperatures', 'temp', 'temps', 'warm', 'cold', 'cool', 'frost', 'freezing', 'snow', 'snowfall',
  'wind', 'winds', 'windy', 'gust', 'gusts', 'storm', 'storms', 'thunderstorm', 'thunder', 'lightning', 'flood', 'floods', 'flooding',
  'smog', 'fog', 'haze', 'dust', 'pollution', 'humidity', 'humid', 'drought', 'outlook', 'cloud', 'clouds', 'cloudy', 'sunny', 'sunshine',
  'today', 'tonight', 'tomorrow', 'week', 'weekly', 'weekend', 'days', 'hourly', 'daily', 'monsoon', 'landslide', 'landslides', 'glacier', 'glacial',
  'earthquake', 'cyclone', 'quality', 'visibility', 'feels', 'chance', 'chances', 'probability'];
const INTENT_SET = new Set(INTENT_WORDS);
export function editDistance(a, b) {
  a = String(a || ''); b = String(b || ''); const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}
/* the intent word a token is (exactly, or as a typo), or null. isPlace(token) -> true keeps an exact unit name a place. */
export function intentWordOf(tok, isPlace) {
  const w = String(tok || '').toLowerCase().replace(/[^a-z]/g, ''); if (!w) return null;
  if (INTENT_SET.has(w)) return w;
  if (w.length < 5 || (isPlace && isPlace(w))) return null;
  let best = null, bd = 3;
  for (const x of INTENT_WORDS) { if (Math.abs(x.length - w.length) > 2) continue; const e = editDistance(w, x); if (e < bd) { bd = e; best = x; } }
  return bd <= 2 ? best : null;
}
/* how many days the question asks for, and from when: "7 days", "7-day", "a week", "10 day outlook", "tomorrow", "today"; null when none */
export function daysAsked(prompt, isPlace) {
  const t = String(prompt || '').toLowerCase(); const toks = t.split(/[^a-z0-9]+/).filter(Boolean); const w = new Set(toks.map((x) => intentWordOf(x, isPlace) || x));
  const m = t.match(/\b(\d{1,2})\s*-?\s*(?:days?|dys?|dayz)\b/) || t.match(/\bnext\s+(\d{1,2})\b/);
  if (m) return { n: Math.max(1, Math.min(15, Number(m[1]))), from: 'today' };
  if (/\b(fortnight|two weeks|2 weeks)\b/.test(t)) return { n: 14, from: 'today' };
  if (w.has('week') || w.has('weekly')) return { n: 7, from: 'today' };
  if (w.has('tomorrow')) return { n: 1, from: 'tomorrow' };
  if (w.has('today') || w.has('tonight')) return { n: 1, from: 'today' };
  if (w.has('forecast') || w.has('weather') || w.has('outlook')) return { n: 3, from: 'today' };
  return null;
}
const DIGIT = /\p{Nd}/u;
const NUMBER_WORDS = /\b(double|doubled|triple|tripled|treble|quadruple|twice|thrice|twofold|threefold|tenfold|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|lakh|lakhs|crore|crores|dozen|dozens)\b/i;
const URDU_NUMBER_WORDS = /(^|[^؀-ۿ])(تین|چار|پانچ|چھ|سات|آٹھ|دس|بیس|پچیس|تیس|چالیس|پچاس|ساٹھ|ستر|اسی|نوے|سو|ہزار|لاکھ|کروڑ|ارب)(?=$|[^؀-ۿ])/;
const PROB_PHRASE = /(%|٪|\bper ?cent\b|\bpercentage\b|\bprobabilit|\blikelihood\b|\blikely\s+to\s+(?:flood|burst|fail)|\bchances?\b|\bodds\b|\bexceedance\b|\bAEP\b|فیصد|امکان|احتمال)/i;
const RETURN_PHRASE = /(\breturn[ -]period\b|\brecurrence\b|\bone[ -]in[ -]\w+|\b\p{Nd}+\s*(?:-|\s)in(?:-|\s)\p{Nd}+|\bonce[ -]in[ -]a[ -](?:lifetime|century|decade|generation)|\b\w+[ -](?:year|yr)[ -](?:flood|event|storm|rain|return)|\bcentennial\b|سال میں ایک)/iu;
const HAZARD_OF_PROB = [['flood', /flood|inundat/i, /flood|river|discharge|above\dyr|return/i], ['glof', /glof|outburst|glacial lake/i, /glof|lake|outburst|loaded/i], ['landslide', /landslide|slope fail|debris flow/i, /landslide|slide|giri/i], ['earthquake', /earthquake|seismic|quake/i, /seismic|quake|pga/i], ['cyclone', /cyclone|storm surge/i, /cyclone|surge/i], ['drought', /drought/i, /drought|spi|spei/i]];
const PROB_PATH = /(chance|pct|prob|share|percent|(^|[.\[])p\d|p[TP]\d|pRain|pWet)/i;
const RETURN_PATH = /(return|rp\d|above\dyr|yr\b|year)/i;
const CLASS_HAZARD = /\b(flood(?:ing)?|glof|outburst|landslide|drought|cyclone|earthquake|seismic|(?:heat|cold|wind|rain|air|smog|frost|snow)\s+(?:risk|hazard|danger|threat|class|level|warning|alert|score|index)|(?:risk|hazard|danger|threat)(?:\s+level)?)\b[^.۔]{0,60}?\b(act|watch|monitor|clear|severe|very high|high|moderate|low|minimal|extreme)\b/i;
const MIXED_OK = new Set(['PM2.5', 'PM10', 'N95', 'KN95', 'FFP2', 'FFP3', 'CO2', 'NO2', 'SO2', 'O3', 'SPI-90', 'SPEI-90', 'SPI-30', 'SPEI-30', 'EC46', 'SEAS5', 'ERA5', 'ERA5-Land', 'GLO-90', 'Sentinel-1', 'Sentinel-2', 'H/W']);

export function slotPack(facts) {
  const slots = new Map(); const byPath = new Map(); const strTokens = new Set(); const classRecs = [];
  let n = 0, d = 0;
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?$/.test(s);
  const walk = (v, path) => {
    if (typeof v === 'number') { if (!Number.isFinite(v)) return v; const id = 'n' + (++n); slots.set(id, { id, path, value: v, kind: 'number' }); byPath.set(path, id); return '{' + id + '} ' + v; }
    if (typeof v === 'string') {
      if (isDate(v)) { const id = 'd' + (++d); slots.set(id, { id, path, value: v, kind: 'date' }); byPath.set(path, id); return '{' + id + '} ' + v; }
      for (const t of v.match(/[\p{L}\p{N}][\p{L}\p{N}.\-\/]*/gu) || []) if (DIGIT.test(t) && /\p{L}/u.test(t)) strTokens.add(t.replace(/[.\-\/]+$/, ''));
      return v;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, path + '[' + i + ']'));
    if (v && typeof v === 'object') {
      const o = {}; const strs = [];
      for (const [k, x] of Object.entries(v)) { o[k] = walk(x, path ? path + '.' + k : k); if (typeof x === 'string') strs.push(k + '=' + x); }
      const cls = Object.entries(v).filter(([k, x]) => typeof x === 'string' && /(class|verdict|band|level|state|category)$/i.test(k)).map(([, x]) => x);
      if (cls.length) classRecs.push({ path, context: (path + ' ' + strs.join(' ')).toLowerCase(), classes: cls.join(' | ').toLowerCase() });
      return o;
    }
    return v;
  };
  const slotted = walk(facts == null ? {} : facts, '');
  return { slotted, slots, byPath, strTokens, classRecs };
}
function getPath(obj, path) {
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let v = obj; for (const p of parts) { if (v == null) return undefined; v = v[p]; } return v;
}
/* a value as the facts hold it, without binary-float noise (27.099999999999998 -> 27.1); no rounding beyond that */
const fmtSlot = (v) => typeof v === 'number' ? String(+v.toPrecision(12)) : String(v);
/* {nK} / {dK} / {fact:path} -> the value from the facts; unknown tokens are recorded, never guessed */
export function renderSlots(text, facts, pack) {
  const P = pack || slotPack(facts); const used = []; const unknown = [];
  const out = String(text || '').replace(/\{\s*(?:(n\d+|d\d+)|fact\s*:\s*([A-Za-z0-9_.\[\]]+))\s*\}/g, (m, id, path) => {
    if (id) { const s = P.slots.get(id); if (!s) { unknown.push(m); return '\u0000'; } used.push(s); return fmtSlot(s.value); }
    const v = getPath(facts, path); const sid = P.byPath.get(path.replace(/^\./, ''));
    if (typeof v === 'number' && Number.isFinite(v)) { used.push(sid ? P.slots.get(sid) : { id: 'fact', path, value: v, kind: 'number' }); return fmtSlot(v); }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) { used.push({ id: 'fact', path, value: v, kind: 'date' }); return v; }
    unknown.push(m); return '\u0000';
  });
  return { text: out, used, unknown };
}
/* v91.17.125 · external audit A06 · MEANING, not only digits. The firewall blocked invented digits but let a fact keep its digits and
   change its meaning: a 35 C temperature written as 35 mm of rain, 35 km/h of gusts, PKR 35 of loss, in another city or on another day.
   Each slot now carries a quantity type from its fact path; the unit written after it and the quantity named just before it must agree
   with that type; a place NIGRAAN knows that is not in the facts, a weekday that is not one of the facts' dates, and "next <weekday>"
   are refused. */
const QTY = [['temperature', /(temp|tmax|tmin|tmean|utci|apparent|feels|dew|wet_?bulb|wbgt|heat_?index|\btc\b|_c$|C$)/i],
  ['rain', /(rain|precip|mm\b|Mm$|_mm)/i], ['wind', /(wind|gust|kmh|Kmh|_ms\b)/i], ['money', /(pkr|loss|cost|value|usd|price|exposure)/i],
  ['percent', /(chance|pct|prob|share|percent|(^|[.\[])p\d|p[TP]\d|pRain|pWet)/i]];
const qtyOfPath = (path) => { const p = String(path || ''); for (const [k, re] of QTY) if (re.test(p)) return k; return null; };
const UNIT_AFTER = [['temperature', /^\s*(°\s*C|℃|degrees?\b|°)/i], ['rain', /^\s*(mm\b|millimet)/i], ['wind', /^\s*(km\s*\/\s*h|kmh|kph|m\s*\/\s*s|knots?)/i],
  ['percent', /^\s*(%|percent|per cent)/i], ['money', /^\s*(million|billion|lakh|crore)?\s*(pkr|rupees?|rs\b|usd|\$)/i]];
const NOUN_BEFORE = [['money', /(pkr|rs\.?|rupees?|loss|damage|cost|\$)\s*$/i], ['rain', /(rain(fall)?|precipitation)\s+(of|is|will be|reaches?|totals?|about|around)?\s*$/i],
  ['wind', /(gusts?|wind(s| speed)?)\s+(of|is|will|reach(es)?|up to|about|around)?\s*(reach\s*)?$/i]];
let KNOWN_PLACES = null;
export function setKnownPlaces(names) { KNOWN_PLACES = new Set([...(names || [])].map((n) => String(n || '').toLowerCase().trim()).filter((n) => n.length >= 4)); }
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function meaningCheck(sent, facts, P, r) {
  const why = [];
  const re = /\{\s*(?:(n\d+|d\d+)|fact\s*:\s*([A-Za-z0-9_.\[\]]+))\s*\}/g; let m;
  while ((m = re.exec(sent))) {
    const path = m[1] ? (P.slots.get(m[1]) || {}).path : m[2]; const q = qtyOfPath(path); if (!q || q === 'percent') { if (q !== 'percent') continue; }
    const after = sent.slice(m.index + m[0].length, m.index + m[0].length + 24), before = sent.slice(Math.max(0, m.index - 40), m.index);
    for (const [k, u] of UNIT_AFTER) if (u.test(after) && k !== q && !(k === 'temperature' && q === 'percent')) { why.push('a ' + q + ' fact written as ' + k); break; }
    if (why.length) break;
    for (const [k, u] of NOUN_BEFORE) if (u.test(before) && k !== q) { why.push('a ' + q + ' fact given as ' + k); break; }
    if (why.length) break;
  }
  if (!why.length && KNOWN_PLACES && KNOWN_PLACES.size) {
    const fx = JSON.stringify(facts == null ? {} : facts).toLowerCase(); const low = ' ' + String(sent).toLowerCase().replace(/[^\p{L}\s-]+/gu, ' ') + ' ';
    for (const w of low.split(/\s+/)) if (w.length >= 4 && KNOWN_PLACES.has(w) && !fx.includes(w)) { why.push('a place (' + w + ') the facts are not about'); break; }
  }
  if (!why.length) {
    const low = String(sent).toLowerCase();
    if (/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|week)\b/.test(low)) why.push('a day the facts do not cover');
    else { const days = new Set(); JSON.stringify(facts == null ? {} : facts).replace(/\b(\d{4}-\d{2}-\d{2})/g, (x, d) => { const t = Date.parse(d + 'T12:00:00Z'); if (Number.isFinite(t)) days.add(WEEKDAYS[new Date(t).getUTCDay()]); return x; });
      const wd = WEEKDAYS.find((w) => new RegExp('\\b' + w + '\\b').test(low)); if (wd && days.size && !days.has(wd)) why.push('a day (' + wd + ') the facts do not cover'); }
  }
  return why;
}
/* the sentence-level check, on the model's own text (slots still in place) */
export function checkSentence(sent, facts, pack) {
  const P = pack || slotPack(facts);
  const r = renderSlots(sent, facts, P);
  const own = String(sent).replace(/\{\s*(?:n\d+|d\d+|fact\s*:\s*[A-Za-z0-9_.\[\]]+)\s*\}/g, ' ');
  const why = [];
  if (r.unknown.length) why.push('unknown slot ' + r.unknown[0]);
  for (const t of own.match(/[\p{L}\p{N}.\-\/]*\p{Nd}[\p{L}\p{N}.\-\/]*/gu) || []) {
    const tok = t.replace(/^[.\-\/]+|[.\-\/]+$/g, '');
    if (!DIGIT.test(tok)) continue;
    if (/\p{L}/u.test(tok) && (MIXED_OK.has(tok) || P.strTokens.has(tok))) continue;
    why.push('a number the model wrote itself (' + tok + ')'); break;
  }
  if (NUMBER_WORDS.test(own) || URDU_NUMBER_WORDS.test(own)) why.push('a number written out in words');
  const probSlot = r.used.filter((s) => s && PROB_PATH.test(s.path || ''));
  if (PROB_PHRASE.test(own)) {
    if (!probSlot.length) why.push('a probability that is not a slot from the facts');
    else for (const [, said, pathRe] of HAZARD_OF_PROB) if (said.test(own) && !probSlot.some((s) => pathRe.test(s.path || ''))) { why.push('a probability of a hazard the facts give no probability for'); break; }
  }
  if (RETURN_PHRASE.test(own) && !r.used.some((s) => s && RETURN_PATH.test(s.path || ''))) why.push('a return period that is not in the facts');
  const m = own.match(CLASS_HAZARD);
  if (m) {
    const noun = m[1].toLowerCase(), cls = m[2].toLowerCase();
    const key = /glof|outburst/.test(noun) ? /glof|lake|outburst/ : /flood/.test(noun) ? /flood/ : /landslide/.test(noun) ? /landslide/ : /drought/.test(noun) ? /drought|spi|spei/
      : /cyclone/.test(noun) ? /cyclone/ : /earthquake|seismic/.test(noun) ? /seismic|quake/ : /^(heat|cold|wind|rain|air|smog|frost|snow)/.test(noun) ? new RegExp(noun.split(/\s+/)[0]) : null;
    const hit = P.classRecs.some((c) => new RegExp('\\b' + cls.replace(/\s+/g, '\\s+') + '\\b').test(c.classes) && (!key || key.test(c.context)));
    if (!hit) why.push('a hazard class (' + m[2] + ') that NIGRAAN did not issue for it');
  }
  if (!why.length) why.push(...meaningCheck(sent, facts, P, r));
  return { ok: !why.length, why, text: r.text, used: r.used };
}
/* v91.17.283.34 · AI Assistant · the number chips: every value the code put into the answer, with the record path it came from (in words)
   and the time of that record. The page shows each number of the answer as a chip; a click shows this source. Words only, no code text. */
const PATH_WORDS = { askedUnits: 'place', selectedUnit: 'selected place', forecast: 'forecast', days: 'day', hours: 'hour', tmaxC: 'highest temperature', tminC: 'lowest temperature',
  rainMm: 'rain', gustMaxKmh: 'strongest gust', windMaxKmh: 'strongest wind', feelsMaxC: 'feels-like', utciMaxC: 'heat stress (UTCI)', rh: 'humidity', level: 'level', word: 'level',
  hazards: 'hazard', heat: 'heat', cold: 'cold', rain: 'rain', wind: 'wind', flood: 'flooding', landslide: 'landslide', drought: 'drought', now: 'now', tempC: 'temperature', pRain: 'chance of rain' };
export function chipsOf(used, facts) {
  const out = []; const seen = new Set();
  const at = (path) => { const parts = String(path || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); let v = facts, best = null, place = null, date = null;
    for (const p of parts) { if (v == null) break; v = v[p]; if (v && typeof v === 'object') { best = v.issuedAt || v.runAt || v.at || best; place = v.name || v.unitName || place; date = typeof v.date === 'string' ? v.date : date; } }
    return { at: best || (facts && (facts.issuedAt || facts.generatedAt)) || null, place, date, parts }; };
  for (const u of used || []) { if (!u || u.value == null) continue; const key = u.path + '|' + u.value; if (seen.has(key)) continue; seen.add(key);
    const A = at(u.path); const words = A.parts.filter((p) => !/^\d+$/.test(p)).map((p) => PATH_WORDS[p] || p.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
    out.push({ value: typeof u.value === 'number' ? String(+u.value.toPrecision(12)) : String(u.value), kind: u.kind, source: [A.place, A.date, words.slice(-2).join(' · ')].filter(Boolean).join(' › '), path: 'place record › ' + words.join(' › '), at: A.at }); }
  return out;
}
export function firewallAnswer(answer, facts, pack) {
  const P = pack || slotPack(facts);
  let removed = 0, kept = 0; const reasons = []; const used = [];
  const out = String(answer || '').split('\n').map((line) => {
    if (!line.trim()) return line;
    /* . ! ? need a space after them (21.4 is one number); the Urdu full stop and question mark do not */
    const parts = line.split(/(?<=[.!?])\s+|(?<=[۔؟])\s*/);
    return parts.map((sent) => {
      if (!sent.trim() || !/[\p{L}\p{N}]/u.test(sent)) return sent;
      const c = checkSentence(sent, facts, P);
      if (c.ok) { kept++; if (Array.isArray(c.used)) used.push(...c.used); return c.text; }
      removed++; reasons.push(c.why[0]);
      return '[Removed: ' + c.why[0] + '.]';
    }).join(' ');
  }).join('\n');
  return { text: out, removed, kept, removedUngoverned: removed, reasons, slots: P.slots.size, used, rule: 'slot rendering: numbers come from the facts by code; the model writes none' };
}

export function createAI(app, root) {
  try { const U = (app.units && app.units.tehsil) || []; let amb = []; try { amb = JSON.parse(readFileSync(join(app.dataDir || join(process.cwd(), 'data'), 'ai-common-words.json'), 'utf8')).removedAsUnitNames || []; } catch (_) {} const AMB = new Set(amb.map((x) => String(x).toLowerCase())); setKnownPlaces([...U.map((u) => u.name), ...U.map((u) => u.district), ...U.map((u) => u.province), 'Karachi', 'Lahore', 'Peshawar', 'Quetta', 'Multan', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Hyderabad', 'Gilgit', 'Skardu'].filter((n) => n && !AMB.has(String(n).toLowerCase()))); } catch (_) {}   /* v91.17.125 · A06 · place names that are also ordinary English words (tank, ...) are not treated as places */
  /* v91.17.101 · registry finding urban-heat (L1/L2): the heat-island model was calibrated on two pairs and, scored at 23 fleet
     points against the rural airport, does not rank them (Spearman under 0.3). Until it does, a within-city difference in
     modelled potential is urban form, not a measured temperature gap, and is said so. */
  const damCache = { j: null, m: 0 };   /* v91.17.101 · dam-exposure.json */
  function damsOf(unitId) { return (() => { try { const f2 = join(root, 'data', 'dam-exposure.json'); if (!existsSync(f2)) return null; const DX = damCache.j && damCache.m === statSync(f2).mtimeMs ? damCache.j : (damCache.j = JSON.parse(readFileSync(f2, 'utf8')), damCache.m = statSync(f2).mtimeMs, damCache.j);
        const ds = DX.units && DX.units[unitId]; return ds ? { large: ds.filter(e => e.cls === 'mega').map(e => ({ name: e.name, heightM: e.heightM, km: e.km })), small: ds.filter(e => e.cls === 'small').length, farm: ds.filter(e => e.cls === 'mini').length, rule: 'river path within ' + DX.reachKm.mega + ' / ' + DX.reachKm.small + ' / ' + DX.reachKm.mini + ' km of large / small / farm dams; a screening list, not an inundation model' } : null; } catch (_) { return null; } })(); }   /* v91.17.101 · dams upstream (dam-exposure.json) */
  let _uhiV = null, _uhiAt = 0;
  const uhiVerdict = () => { if (Date.now() - _uhiAt > 3600e3) { _uhiAt = Date.now(); try { const c = app.fleetHistory && app.fleetHistory.uhiCheck ? app.fleetHistory.uhiCheck() : null; _uhiV = c && c.verdict ? c.verdict : null; } catch (_) { _uhiV = null; } } return _uhiV; };
  const uhiRanked = () => { const v = uhiVerdict(); return !!(v && v.spearman >= 0.3); };
  let cfg = null, modelList = null;
  function load() {
    let key = process.env.NIGRAAN_AI_KEY || '', provider = process.env.NIGRAAN_AI_PROVIDER || '', model = process.env.NIGRAAN_AI_MODEL || '';
    const f = join(root, 'ai.key');
    if (!key && existsSync(f)) {
      const txt = readFileSync(f, 'utf8').trim();
      if (/=/.test(txt)) for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/); if (!m) continue; if (m[1] === 'key') key = m[2]; if (m[1] === 'provider') provider = m[2]; if (m[1] === 'model') model = m[2]; }
      else key = txt;
    }
    let base = process.env.NIGRAAN_AI_BASE || '';
    try { const f2 = join(root, 'ai.key'); if (existsSync(f2)) { const m = readFileSync(f2, 'utf8').match(/^\s*base\s*=\s*(\S+)/m); if (m) base = m[1]; } } catch {}
    /* v91.17.70 · LOCAL BY DEFAULT, CLOUD BY OPT-IN (seat_ai_ml.md §2.5). A key with no provider named used to be sent to
       Groq; an ai.key naming only a model went nowhere. Now: no provider named -> the local Ollama, unless the key is a
       recognisable cloud key. A cloud provider (the question and the facts pack leave this machine) is used only with
       NIGRAAN_AI_CLOUD=1 or a line "cloud=yes" in ai.key; without it the assistant stays on local retrieval and the
       status says why. */
    let cloudOptIn = /^(1|yes|true|on)$/i.test(String(process.env.NIGRAAN_AI_CLOUD || ''));
    try { const f3 = join(root, 'ai.key'); if (existsSync(f3)) { const m = readFileSync(f3, 'utf8').match(/^\s*cloud\s*=\s*(\S+)/mi); if (m && /^(1|yes|true|on)$/i.test(m[1])) cloudOptIn = true; } } catch {}
    if (!provider && !key && (model || base)) provider = 'ollama';
    if (!key && provider === 'ollama') key = 'ollama';
    if (!key) return null;
    if (!provider) provider = key.startsWith('gsk_') ? 'groq' : key.startsWith('sk-or-') ? 'openrouter' : key.startsWith('AIza') ? 'gemini' : key.startsWith('csk-') ? 'cerebras' : 'ollama';
    if (!PROVIDERS[provider]) return null;
    const b = base || PROVIDERS[provider].base;
    const local = provider === 'ollama' || /127\.0\.0\.1|localhost/.test(b);
    if (!local && !cloudOptIn) { cloudRefused = { provider, why: 'ai.key names the cloud provider ' + provider + ', which sends the question and the facts off this machine; set cloud=yes in ai.key (or NIGRAAN_AI_CLOUD=1) to allow it. Until then the assistant answers by local retrieval.' }; return null; }
    cloudRefused = null;
    return { key, provider, model, base: b, local, cloudOptIn };
  }
  let cloudRefused = null;
  cfg = load();

  let modelNote = null, modelCheckedAt = 0;
  /* ══ v91.17.50 · THE SERVER STARTS OLLAMA ITSELF ══════════════════════════════════════════════
     Measured on the operator's machine: "HTTP 504 — fetch failed" with Ollama installed, ai.key correct and the
     model in deploy\.ollama. "fetch failed" is not a timeout: nothing was listening at 127.0.0.1:11434, because
     RUN_NIGRAAN.bat's start line had not taken (a console started another way, or the tray app quit). The server
     no longer depends on the launcher: when a local Ollama refuses the connection it finds ollama.exe (PATH, then
     %LOCALAPPDATA%\Programs\Ollama, then %ProgramFiles%\Ollama; `ollama` on Linux/macOS), starts `ollama serve`
     detached with OLLAMA_MODELS on deploy\.ollama\models when that store exists, waits up to 25 s for /models,
     and records what it did in the status. A refusal is reported as 503 provider_unreachable with the reason. */
  const isLocal = () => !!cfg && (cfg.provider === 'ollama' || /127\.0\.0\.1|localhost/.test(cfg.base || ''));
  const refused = (e) => { const c = e && (e.cause && e.cause.code || e.code); return /ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN/.test(String(c || '')) || /fetch failed/i.test(String(e && e.message || '')); };
  let localStart = { attempts: 0, at: null, exe: null, started: false, why: null };
  function ollamaExe() {
    const cands = [];
    if (process.platform === 'win32') {
      const la = process.env.LOCALAPPDATA, pf = process.env.ProgramFiles, pf86 = process.env['ProgramFiles(x86)'];
      if (la) cands.push(join(la, 'Programs', 'Ollama', 'ollama.exe'));
      if (pf) cands.push(join(pf, 'Ollama', 'ollama.exe'));
      if (pf86) cands.push(join(pf86, 'Ollama', 'ollama.exe'));
    } else cands.push('/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama');
    for (const c of cands) if (existsSync(c)) return c;
    return 'ollama';   /* PATH */
  }
  async function ensureLocalProvider() {
    if (!isLocal() || cfg.provider !== 'ollama') return false;
    if (localStart.at && Date.now() - localStart.at < 60000) return localStart.started;
    localStart = { attempts: localStart.attempts + 1, at: Date.now(), exe: null, started: false, why: null };
    try {
      const { spawn } = await import('node:child_process');
      const exe = ollamaExe(); localStart.exe = exe;
      const store = join(root, '..', '.ollama', 'models'); const env = { ...process.env };
      if (existsSync(store)) env.OLLAMA_MODELS = store;
      const child = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', env, windowsHide: true });
      child.on('error', (e) => { localStart.why = 'could not start ' + exe + ': ' + e.message; });
      child.unref();
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try { await listModels(); localStart.started = true; localStart.why = 'started ' + exe + ' serve' + (env.OLLAMA_MODELS ? ' on ' + env.OLLAMA_MODELS : ''); try { console.log('  ai         ' + localStart.why); } catch {} return true; } catch (e) { if (localStart.why && /could not start/.test(localStart.why)) break; }
      }
      if (!localStart.why) localStart.why = exe + ' serve did not answer at ' + cfg.base + ' within 25 s';
    } catch (e) { localStart.why = 'start failed: ' + e.message; }
    return false;
  }
  /* ══ v91.17.51 · THE TRAY OLLAMA IS ON THE WRONG STORE: COPY THE MODEL INTO ITS STORE ═══════════════
     Measured on the operator's machine after v50: Ollama answers (the tray app, started at login on the default
     store %USERPROFILE%\.ollama) and "lists no models at all", while qwen3:1.7b sits in deploy\.ollama\models. A
     running Ollama cannot change its store, and starting a second one fails on the port. The durable fix is to
     put the model where that Ollama looks: the manifest and its blobs are copied from the deploy store into the
     store the running Ollama uses (OLLAMA_MODELS if set, else the user's .ollama\models), blobs already there are
     skipped, and the list is read again. About 1.4 GB for qwen3:1.7b, once; it survives reboots. */
  let adopt = { at: null, done: false, why: null, copiedMB: 0 };
  async function adoptDeployStore(wanted) {
    if (adopt.at && Date.now() - adopt.at < 300000) return adopt.done;
    adopt = { at: Date.now(), done: false, why: null, copiedMB: 0 };
    try {
      const fs = await import('node:fs'); const os = await import('node:os');
      const src = join(root, '..', '.ollama', 'models');
      const dst = process.env.OLLAMA_MODELS || join(os.homedir(), '.ollama', 'models');
      if (!existsSync(src)) { adopt.why = 'no deploy store at ' + src; return false; }
      if (join(src) === join(dst)) { adopt.why = 'the running Ollama already uses the deploy store; the model is missing from it (ollama pull ' + wanted + ')'; return false; }
      const [name, tag = 'latest'] = String(wanted).split(':');
      const man = join(src, 'manifests', 'registry.ollama.ai', 'library', name, tag);
      if (!existsSync(man)) { adopt.why = 'the deploy store has no manifest for ' + wanted + ' (' + man + ')'; return false; }
      const m = JSON.parse(readFileSync(man, 'utf8'));
      const digests = [m.config && m.config.digest, ...(m.layers || []).map(l => l.digest)].filter(Boolean).map(d => String(d).replace(':', '-'));
      fs.mkdirSync(join(dst, 'blobs'), { recursive: true }); fs.mkdirSync(join(dst, 'manifests', 'registry.ollama.ai', 'library', name), { recursive: true });
      for (const d of digests) {
        const from = join(src, 'blobs', d), to = join(dst, 'blobs', d);
        if (!existsSync(from)) { adopt.why = 'blob missing in the deploy store: ' + d; return false; }
        if (existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
        await fs.promises.copyFile(from, to + '.part'); fs.renameSync(to + '.part', to); adopt.copiedMB += Math.round(fs.statSync(from).size / 1048576);
      }
      fs.copyFileSync(man, join(dst, 'manifests', 'registry.ollama.ai', 'library', name, tag));
      adopt.done = true; adopt.why = 'copied ' + wanted + ' (' + adopt.copiedMB + ' MB new) from the deploy store into ' + dst;
      try { console.log('  ai         ' + adopt.why); } catch {}
      return true;
    } catch (e) { adopt.why = 'copy failed: ' + e.message; return false; }
  }
  /* ══ v91.17.53 · THE SECOND ROUTE INTO THE RUNNING OLLAMA'S STORE: `ollama create` ══════════════════
     When the copy into the other store cannot be done or did not register (a store elsewhere, a permission, a
     different Ollama layout), the running Ollama is asked to IMPORT the model from the deploy blob itself: a
     Modelfile with FROM <the GGUF blob> and the deploy manifest's template and parameters, then `ollama create
     <model> -f Modelfile`. Ollama writes the result into whatever store it is using. Once, up to 4 minutes. */
  let importer = { at: null, done: false, why: null };
  async function importDeployModel(wanted) {
    if (importer.at && Date.now() - importer.at < 600000) return importer.done;
    importer = { at: Date.now(), done: false, why: null };
    try {
      const fs = await import('node:fs'); const os = await import('node:os'); const { spawn } = await import('node:child_process');
      const src = join(root, '..', '.ollama', 'models'); const [name, tag = 'latest'] = String(wanted).split(':');
      const man = join(src, 'manifests', 'registry.ollama.ai', 'library', name, tag);
      if (!existsSync(man)) { importer.why = 'no deploy manifest for ' + wanted; return false; }
      const m = JSON.parse(readFileSync(man, 'utf8')); const blob = (d) => join(src, 'blobs', String(d).replace(':', '-'));
      const layer = (t) => (m.layers || []).find(l => String(l.mediaType || '').indexOf(t) >= 0);
      const model = layer('image.model'); if (!model || !existsSync(blob(model.digest))) { importer.why = 'model blob missing in the deploy store'; return false; }
      let mf = 'FROM ' + blob(model.digest).replace(/\\/g, '/') + '\n';
      const tpl = layer('image.template'); if (tpl && existsSync(blob(tpl.digest))) mf += 'TEMPLATE ' + '"""' + readFileSync(blob(tpl.digest), 'utf8') + '"""' + '\n';
      const prm = layer('image.params'); if (prm && existsSync(blob(prm.digest))) { try { const P = JSON.parse(readFileSync(blob(prm.digest), 'utf8')); for (const [k, v] of Object.entries(P)) { for (const x of (Array.isArray(v) ? v : [v])) mf += 'PARAMETER ' + k + ' ' + (typeof x === 'string' ? JSON.stringify(x) : x) + '\n'; } } catch {} }
      const mfPath = join(os.tmpdir(), 'nigraan-' + name + '-' + tag + '.Modelfile'); fs.writeFileSync(mfPath, mf);
      const exe = ollamaExe(); const env = { ...process.env, OLLAMA_HOST: (cfg.base || '').replace(/\/v1\/?$/, '') };
      const out = await new Promise((res) => { let log = ''; const ch = spawn(exe, ['create', wanted, '-f', mfPath], { env, windowsHide: true }); const t = setTimeout(() => { try { ch.kill(); } catch {} res({ code: -1, log: log + ' (timed out after 240 s)' }); }, 240000);
        ch.stdout.on('data', d => { log += d; }); ch.stderr.on('data', d => { log += d; }); ch.on('error', e => { clearTimeout(t); res({ code: -2, log: 'could not start ' + exe + ': ' + e.message }); }); ch.on('close', code => { clearTimeout(t); res({ code, log }); }); });
      importer.done = out.code === 0; importer.why = (out.code === 0 ? 'imported ' + wanted + ' into the running Ollama with ollama create' : 'ollama create failed (' + out.code + '): ' + String(out.log).slice(-200));
      try { console.log('  ai         ' + importer.why); } catch {}
      return importer.done;
    } catch (e) { importer.why = 'import failed: ' + e.message; return false; }
  }
  /* v91.17.80 · Gemma is retired (A/B test 27 Sep: 1/25 with timeouts against Qwen). It is never chosen as a fallback,
     even while its files are still in the Ollama store; ai.key can still name it explicitly for a bench run. */
  const RETIRED = /gemma/i;
  async function listModels() {
    const r = await fetch(cfg.base + '/models', { headers: { authorization: 'Bearer ' + cfg.key }, signal: AbortSignal.timeout(10000) });
    const j = await r.json(); return (j.data || []).map(m => String(m.id).replace(/^models\//, '')).filter(id => !RETIRED.test(id) || (cfg && cfg.model === id));
  }
  async function pickModel() {
    /* v91.17.43 · a named model that the provider does not hold is not sent blindly: with Ollama the tray app often runs on
       the default store, where the deploy's models are not, and the answer was a 404 shown to the operator as "HTTP 502".
       The list is checked (once a minute), the nearest available model is used, and the status says so. */
    if (cfg.model) {
      if (Date.now() - modelCheckedAt < 60000 && modelList) return modelList;
      try {
        let ids = await listModels(); modelCheckedAt = Date.now();
        if (ids.includes(cfg.model)) { modelNote = null; return (modelList = cfg.model); }
        if (cfg.provider === 'ollama' && isLocal() && await adoptDeployStore(cfg.model)) { ids = await listModels(); if (ids.includes(cfg.model)) { modelNote = 'ollama ran on another store; ' + adopt.why; return (modelList = cfg.model); } }
        if (cfg.provider === 'ollama' && isLocal() && !ids.includes(cfg.model) && await importDeployModel(cfg.model)) { ids = await listModels(); if (ids.includes(cfg.model)) { modelNote = importer.why; return (modelList = cfg.model); } }
        const base = cfg.model.split(':')[0]; let hit = ids.find(id => id.split(':')[0] === base);
        if (!hit) for (const re of PROVIDERS[cfg.provider].prefer) { hit = ids.find(id => re.test(id)); if (hit) break; }
        if (!hit) hit = ids[0];
        modelNote = hit ? `ai.key asks for ${cfg.model}, which ${cfg.provider} does not hold (it has: ${ids.slice(0, 6).join(', ') || 'no models'}); using ${hit}` + (cfg.provider === 'ollama' ? '. If Ollama was already running from the tray it uses its default store, not deploy\\.ollama: quit it from the tray and run RUN_NIGRAAN.bat again, or  ollama pull ' + cfg.model : '')
                       : `ai.key asks for ${cfg.model} and ${cfg.provider} lists no models at all` + (adopt.why ? ' · ' + adopt.why : '') + (cfg.provider === 'ollama' ? ' (ollama pull ' + cfg.model + ', or quit the tray Ollama and run RUN_NIGRAAN.bat so it starts on deploy\\.ollama)' : '');
        return (modelList = hit || null);
      } catch (e) {
        if (refused(e) && await ensureLocalProvider()) { modelCheckedAt = 0; return pickModel(); }
        modelNote = `${cfg.provider} did not answer at ${cfg.base}: ${e.message}` + (cfg.provider === 'ollama' ? (localStart.why ? ' · ' + localStart.why : '') + ' (Ollama is installed at ' + ollamaExe() + '; the server tries to start it; if it keeps failing run  ollama serve  in a terminal and watch its error)' : ''); return cfg.model; }
    }
    if (modelList) return modelList;
    try {
      const ids = await listModels();
      for (const re of PROVIDERS[cfg.provider].prefer) { const hit = ids.find(id => re.test(id)); if (hit) return (modelList = hit); }
      return (modelList = ids[0]);
    } catch { return null; }
  }

  function latestRun() { return app.store.all('runs').filter(r => r.unit_level === 'tehsil' && ['complete', 'partial'].includes(r.status) && !r.records_pruned).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))[0]; }
  function unitFacts(u) {
    const f = { name: u.name, key: u.key || null, district: u.district, province: u.province, disputed: !!u.disputed, lat: u.lat, lon: u.lon };   /* v283 INTEG: key = the page's unit name ("Khanpur (Haripur)") */
    const run = latestRun(); const rec = run && app.store.find('records', x => x.runId === run.run_id && x.unitKey === u.unitId);
    if (rec) f.forecast = { runId: run.run_id, retrievedAt: rec.retrievedAt, biasCorrected: !!rec.biasCorrected, calibration: rec.biasCorrected ? label('calibration') + ' (tier B, from ' + label('network') + ')' : null, leads: rec.leads, units: { temperature_2m: '°C', relative_humidity_2m: '%', precipitation: 'mm/h', wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h' } };
    const sk = app.store.filter('unitSkill', r => r.unitId === u.unitId).map(r => { const g = app.verification.guarded && app.verification.guarded(u.unitId, r.lead_hours); return { lead_hours: r.lead_hours, rmse_raw_c: r.rmse_raw, rmse_served_c: g ? r.rmse_raw : r.rmse_served, corrected: r.correction_applied && !g, station_guard: g ? { station: g.station, km: g.km, station_rmse_raw_c: g.raw, station_rmse_if_corrected_c: g.candidate, why: 'correction switched off: the airport thermometer says it made the forecast worse (ERA5 is biased here)' } : undefined, hours: r.n }; });
    try { const sm = app.smog && app.smog.unit(u.unitId); if (sm) f.airAndSmog = { source: 'CAMS PM2.5 forecast (under-reads Punjab winter smog) plus afternoon ventilation, morning inversion and fog from the weather forecast; not verified against monitors', days: sm.days.map(d => ({ date: d.date, pm25_ugm3: d.pm25, pm25_class: sm.classes[d.pmClass], us_aqi_max: d.aqi != null ? d.aqi : null, aqi_category: d.aqiCategory || null, dispersion: sm.dispersion[d.dispersion], afternoon_ventilation_m2s: d.afternoonVentilation, inversion_hours: d.inversionHours, fog_hours: d.fogHours, smog_day: d.smogDay })) }; } catch {}
    try { const sz = app.outlook && app.outlook.seasonalUnit(u.unitId); if (sz) f.weeksAndSeason = { weeksAhead: sz.subseasonal.weeks.map(w => ({ week_start: w.start, temp_anomaly_c: w.tAnom, chance_above_normal_pct: w.pT0, chance_over_1c_pct: w.pT1, rain_anomaly_mm: w.pAnom, chance_wetter_pct: w.pP0 })), seasonAhead: sz.seasonal.months.map(m => ({ month: m.month, mean_temp_c: m.tMean, temp_anomaly_c: m.tAnom, rain_mm: m.pMean, rain_anomaly_mm: m.pAnom, rain_anomaly_pct: m.pPct })), note: 'an outlook only: anomalies against the model\'s own climate, no verified skill in Pakistan yet, so no action is raised from it' }; } catch {}   /* v91.17.283 · WS4 · B-8: no supplier name in a key; outlook wording */
    try { const o = app.outlook && app.outlook.unitSummary(u.unitId, 10); if (o) f.outlook = o; const sun = app.outlook && app.outlook.sunshine(u.unitId); if (sun && sun.today) f.sunshineToday = { satellite_mj: sun.today.sat_mj, model_mj: sun.today.model_mj, ratio: sun.today.ratio, typicalRatio: sun.typicalRatio, hoursMatched: sun.today.hours, reading: sun.today.verdict }; } catch {}
    /* v91.17.70 · the per-unit "verification" is model against its own reanalysis (circular) and the guard is an airport
       thermometer (PMD synop via ISD, WMO Res. 40): internal diagnostics, not customer facts */
    if (sk.length && INTERNAL()) f.verification = { reference: 'ERA5 reanalysis, independent test month', variable: 'temperature_2m', skill: sk, internalDiagnostic: true };
    return f;
  }
  /* v91.17.283 · INTEG (permanent check L4) · "<tehsil>, <district>" names ONE tehsil. Before, "Khanpur, Haripur" matched every
     tehsil called Khanpur (Rahim Yar Khan, Shikarpur, Haripur) plus the Haripur tehsil, and the top three by name length dropped the one
     asked for; "Rajanpur (Tribal Area), Rajanpur" never matched because the punctuation of the unit name was not normalised like the text.
     Now names and text are normalised the same way; when a tehsil is named together with its own district, its namesakes elsewhere are
     dropped, and a tehsil that only repeats that district's name (the qualifier) is not a second place. */
  function unitsInText(text) {
    const nz = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const t = ' ' + nz(text) + ' ', has = (x) => { const n = nz(x); return n.length >= 3 && t.includes(' ' + n + ' '); };
    let hits = [];
    for (const u of app.units.tehsil) if (has(u.name)) hits.push(u);
    if (!hits.length) for (const u of app.units.tehsil) { const d = nz(u.district); if (has(u.district) && nz(u.name) === d) hits.push(u); }
    const qualified = hits.filter((u) => nz(u.name) !== nz(u.district) && has(u.district));
    if (qualified.length) { const qn = new Set(qualified.map((u) => nz(u.name))), qd = new Set(qualified.map((u) => nz(u.district)));
      hits = hits.filter((u) => qn.has(nz(u.name)) ? qualified.includes(u) : !(qd.has(nz(u.name)) && nz(u.name) === nz(u.district))); }
    return hits.sort((a, b) => b.name.length - a.name.length).slice(0, 3);
  }
  /* ══ v91.17.6 · NAMED PLACE RESOLUTION ═══════════════════════════════════════
     THE DEFECT (reported from the running dashboard, 2026-09-18). unitsInText()
     matches only the 577 AGN tehsil and district names. "naran temp" matched
     nothing, grounding() fell through to selectedUnit, and the answer came back
     about whatever the dashboard had selected at the time — Gojal, 300 km away
     in Hunza, at a different altitude. Nothing in the answer said the question
     had been re-pointed. A confidently wrong place is worse than a refusal.

     THE FIX. When no unit matches, the named place goes through the Pakistan
     gazetteer: AGN's own units, then the alias table, then Open-Meteo geocoding
     with countryCode=PK so the country cut is made before the ranking rather
     than after it. A place that resolves gets a live point forecast at its own
     coordinates, labelled as a point product — no bias correction, no per-unit
     verification, because neither is defined off the unit grid. A place that
     does not resolve is reported as unresolved. In BOTH cases the dashboard's
     selected unit is withheld from the facts, so it cannot be substituted for
     what was asked; what was on screen is recorded separately as ignored.

     Measured: "naran" -> Naran, Mansehra District, Khyber Pakhtunkhwa,
     34.905 N 73.649 E, 2,437 m. The second hit is a different Naran in
     Muzaffarabad District (1,586 m); both are carried so the answer can say
     which one it used. */
  const STOP = new Set(('what whats what’s is are the a an in at of for on to me my our your and or about tell show give please how much many there here now today tonight tomorrow yesterday this that it its will be do does can could would should like weather forecast temp temperature temperatures hot cold heat warm cool rain rainfall precipitation wet dry wind winds gust gusts storm humid humidity snow snowfall smog aqi air quality fog haze dust flood floods drought score scores risk hazard level levels chance chances probability outlook week weeks day days month months season next last say says over under above below than then compare comparison vs versus degree degrees celsius centigrade please also good bad high low max min maximum minimum average mean expected one two three four five six seven eight nine ten first second third short long brief paragraph sentence sentences line lines list bullet bullets words word summary answer answers question questions explain describe hours hour minute minutes morning evening afternoon noon night nights people home house area areas zone city cities town towns village villages district districts province provinces region regions unit units place places location locations where which when what why who whom whose with without within between through across along around into onto from before after during again ever never always often sometimes usually maybe thanks thank hello okay yes not none nothing something anything everything just only very really quite still yet soon later time date year years crop crops water land road roads school schools hospital hospitals market markets').split(' '));
  const normName = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  /* ══ v91.17.76 · A · B-02 · AN ORDINARY WORD IS NOT A PLACE ═══════════════════════════════════════════════════════
     MEASURED (UX audit v91.17.75 B-02, 2/2 runs): the "Explain · Why the signal changed" chip asks "Explain the current top
     risk and its main drivers." and the answer was about two villages, Top (Bajaur) and Main (Mansehra). Every token that is
     not in STOP goes to the gazetteer, and 205,377 places include villages spelt like English words. STOP is a hand list of
     the words people type in a weather question; it cannot hold the language.
     Now: a single word (or a phrase made only of such words) that is an ordinary English word - data/ai-common-words.json,
     the SCOWL/hunspell en_US stems minus every tehsil, district, division and province name token (so Swat, Tank, Hub, Dir
     stay places) - is a place only when the question clearly names it: capitalised AND after in/at/near/around/from/to/
     towards/for/of/about/over, or followed by ", <district or province>", or joined to a place-type word ("Top village"
     is not; "Main bazar" is). "flood in Top" still resolves Top; "the current top risk" never does. The v54 rule (a
     sentence-initial "One" is not a chak) and the Karachi split-city rule are unchanged; the harness checks both. */
  let CW = null;
  function commonWords() {
    if (CW) return CW;
    try { const j = JSON.parse(readFileSync(join(app.dataDir || join(process.cwd(), 'data'), 'ai-common-words.json'), 'utf8')); CW = new Set(String(j.words || '').split(' ').filter(Boolean)); }
    catch (_) { CW = new Set(); }
    return CW;
  }
  function isCommonWord(w) {
    w = normName(w); if (!w) return false;
    const S = commonWords(); if (!S.size) return false;
    if (w.includes(' ')) return w.split(' ').every((x) => isCommonWord(x));
    if (!/^[a-z]{3,}$/.test(w)) return false;
    const c = [w];
    if (w.endsWith('ies')) c.push(w.slice(0, -3) + 'y');
    if (w.endsWith('es')) c.push(w.slice(0, -2));
    if (w.endsWith('s')) c.push(w.slice(0, -1));
    if (w.endsWith('ed')) c.push(w.slice(0, -2), w.slice(0, -1));
    if (w.endsWith('ing')) c.push(w.slice(0, -3), w.slice(0, -3) + 'e');
    if (w.endsWith('ly')) c.push(w.slice(0, -2));
    if (/(ing|ed)$/.test(w)) { const b = w.replace(/(ing|ed)$/, ''); if (/([b-df-hj-np-tv-z])\1$/.test(b)) c.push(b.slice(0, -1)); }
    return c.some((x) => x.length >= 3 && S.has(x));
  }
  const PLACE_PREP = /(?:^|[^A-Za-z])(?:in|at|near|around|from|to|towards|toward|for|of|about|over)\s+$/i;
  function clearlyNamed(prompt, cand) {
    const raw = String(prompt || ''), c = String(cand || '').trim(); if (!c) return false;
    const re = new RegExp('(^|[^A-Za-z])(' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'gi');
    let m;
    while ((m = re.exec(raw))) {
      const at = m.index + m[1].length, word = m[2];
      if (!/^[A-Z]/.test(word)) continue;   /* a place the user names is written as a name */
      const before = raw.slice(Math.max(0, at - 16), at), after = raw.slice(at + word.length, at + word.length + 48);
      if (PLACE_PREP.test(before)) return true;
      const nx = after.match(/^\s*,\s*([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)/);
      if (nx) { const n = normName(nx[1]); if ((app.units.tehsil || []).some((u) => normName(u.district) === n || normName(u.province) === n || normName(u.name) === n)) return true; }
      const ty = after.match(/^[ -]([A-Za-z]{3,})/); if (ty && TYPE_WORD.test(ty[1])) return true;
    }
    return false;
  }
  /* candidates: capitalised runs first (people write "Naran"), then any
     non-vocabulary token (they also write "naran temp"). */
  /* ══ v91.17.11 · A LONGER NAME BEATS A SHORTER ONE ═══════════════════════
     Measured: "compare I-8 Islamabad and Raja Bazar Rawalpindi" resolved to
     RAJA, a village in Sargodha District 300 km away, because the candidate
     list handed single lowercase tokens to the geocoder and "raja" is an
     exact name match somewhere in Pakistan. It is the Naran/Gojal defect in a
     new place: an exact match to the wrong thing.

     Two changes. Multi-word phrases and sector codes are extracted first and
     tried first, so "Raja Bazar" is asked before "raja" ever is. And a single
     token that is merely the first word of a longer phrase in the same prompt
     is dropped entirely - it can only be the wrong half of a name. */
  const SECTOR_RE = /\b([A-Z]-?\d{1,2}(?:\/\d)?)\b/g;
  const TYPE_WORD = /^(airport|aerodrome|airbase|cantt|cantonment|bazar|bazaar|market|mandi|hospital|university|college|school|road|chowk|chok|fort|dam|barrage|canal|stadium|park|garden|station|port|harbour|mall|plaza|interchange|flyover|bridge|town|colony|society|scheme|mor|morr|adda|gate|tomb|shrine|mosque|masjid|church|temple|lake|valley|pass|peak|glacier|island|beach)$/i;
  /* "Allama Iqbal airport" resolved -> "Allama Iqbal" must not then resolve
     again as a second place. Strips one trailing type word. */
  const bareOf = (c) => { const m = String(c || '').match(/^(.*\S)[ -]([A-Za-z]{3,})$/); return m && TYPE_WORD.test(m[2]) ? m[1] : null; };
  /* v91.17.266 · a word is a place word when it is a unit name (tehsil, district, province) or an exact name in the place index */
  let UNW = null;
  const unitWords = () => { if (UNW) return UNW; UNW = new Set(); for (const u of (app.units && app.units.tehsil) || []) for (const k of [u.name, u.district, u.province]) for (const w of normName(k).split(' ')) if (w) UNW.add(w); return UNW; };
  const isPlaceWord = (w) => { const n = normName(w); if (!n) return false; if (unitWords().has(n)) return true; try { return !!(app.places && app.places.hasName(n)); } catch (_) { return false; } };
  const intentTok = (w) => intentWordOf(w, isPlaceWord);
  /* a phrase loses intent words at either end ("Frecast Gilgit" is Gilgit) */
  const trimIntent = (ph) => { const w = String(ph).split(/[ -]/); while (w.length && intentTok(w[0])) w.shift(); while (w.length && intentTok(w[w.length - 1])) w.pop(); return w.join(' '); };
  function placeCandidates(text) {
    const raw = String(text || '');
    const phrases = [], singles = [];
    for (const m of raw.match(SECTOR_RE) || []) phrases.push(m);
    for (const c0 of raw.match(/\b[A-Z][a-zA-ZÀ-ɏ]{2,}(?:[ -][A-Z][a-zA-Z]{2,}){1,2}\b/g) || []) { const c = trimIntent(c0); if (!c) continue; if (c.includes(' ')) phrases.push(c); else singles.push(c); }
    for (const c of raw.match(/\b[A-Z][a-zA-ZÀ-ɏ]{2,}\b/g) || []) if (!STOP.has(c.toLowerCase()) && !intentTok(c)) singles.push(c);
    for (const w of raw.toLowerCase().split(/[^a-z0-9؀-ۿ]+/)) if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !intentTok(w)) singles.push(w);
    /* every word of an extracted phrase, not just its head: "Raja Bazar
       Rawalpindi" must not leave "bazar" free to match a village in Swabi. */
    /* ══ v91.17.13 · A LOWERCASE TYPE WORD IS PART OF THE NAME ═════════════
       MEASURED: "compare the night time urban heat between Lahore Cantt and
       Allama Iqbal airport" answered for 31.5021, 74.2685 - Lower Mehran
       Block in Allama Iqbal TOWN, 13 km from the airport and 40% built,
       against an airport at 31.5195, 74.4010. The phrase regex above requires
       every word to be capitalised, so it captured "Allama Iqbal" and left
       "airport" to fall through as a lowercase single that STOP then dropped.
       Nominatim, asked for "Allama Iqbal airport", returns the aerodrome as
       its only hit; asked for "Allama Iqbal" it returns five places in the
       town. The information needed to get this right was in the question and
       was being discarded - the same failure as "Raja Bazar" matching a
       village 300 km away, one level down.

       A closed list, not "join any lowercase word": joining freely would
       swallow ordinary words and turn a good name into a name that matches
       nothing. The joined form is tried FIRST and the bare phrase stays in
       the list behind it, so a type word that OSM does not carry costs one
       lookup and then resolves exactly as before. */
    const joined = [];
    /* a single capitalised word takes a type word as well: "Neelum valley",
       "Karachi port", "Attock fort". The first version of this only looked at
       multi-word phrases, so "Allama Iqbal airport" joined and "Neelum valley"
       did not. */
    const heads = phrases.concat((raw.match(/\b[A-Z][a-zA-Z\u00C0-\u024F]{2,}\b/g) || []).filter((w) => !STOP.has(w.toLowerCase())));
    for (const ph of heads) {
      const i = raw.indexOf(ph);
      if (i < 0) continue;
      const after = raw.slice(i + ph.length).match(/^[ -]([A-Za-z]{3,})/);
      if (after && TYPE_WORD.test(after[1]) && !joined.some((j) => j.full === ph + ' ' + after[1])) joined.push({ full: ph + ' ' + after[1], bare: ph, type: after[1] });
    }
    const phraseHeads = new Set();
    for (const ph of phrases) for (const w of String(ph).split(/[ -]/)) { const n = normName(w); if (n) phraseHeads.add(n); }
    /* the type word is part of a name now, so it must not float free as a
       single and go looking for a "Bazar" or an "Airport" of its own */
    for (const j of joined) { const n = normName(j.type); if (n) phraseHeads.add(n); }
    const seen = new Set(); const uniq = [];
    for (const c of phrases) {
      const j = joined.find((x) => x.bare === c);
      if (j) { const nj = normName(j.full); if (nj && !seen.has(nj)) { seen.add(nj); uniq.push(j.full); } }
      const n = normName(c); if (n && !seen.has(n)) { seen.add(n); uniq.push(c); }
    }
    for (const c of singles) {
      const n = normName(c);
      if (!n || seen.has(n)) continue;
      /* a word that is only part of a longer name is suppressed, and so is
         any type-word form built from it: "Allama Iqbal airport" must not also
         produce "Iqbal airport", and "Raja Bazar Rawalpindi" must not also
         produce "Raja Bazar" as a second place. Both were measured doing
         exactly that. */
      if (phraseHeads.has(n)) continue;
      const j = joined.find((x) => normName(x.bare) === n);
      if (j) { const nj = normName(j.full); if (nj && !seen.has(nj)) { seen.add(nj); uniq.push(j.full); } }
      if (seen.has(n)) continue;
      seen.add(n); uniq.push(c);
    }
    return uniq.slice(0, joined.length ? 6 : 4);
  }
  /* a sector code or a multi-word phrase goes straight to OpenStreetMap: the
     provider geocoder has none of them, and the unit index has none of them. */
  const isFineGrained = (c) => /^[A-Z]-?\d/.test(String(c)) || String(c).trim().includes(' ');
  /* a city name in the prompt, to disambiguate a sector code that repeats */
  function cityHintIn(text) {
    const m = String(text || '').match(/\b(Islamabad|Rawalpindi|Karachi|Lahore|Faisalabad|Multan|Peshawar|Quetta|Hyderabad|Sialkot|Gujranwala|Sukkur|Bahawalpur|Sargodha|Abbottabad|Mardan|Larkana|Sahiwal|Rahim Yar Khan|Nawabshah|Mirpur|Muzaffarabad|Gilgit|Skardu)\b/i);
    return m ? m[1] : null;
  }
  /* ══ v91.17.13 · A CITY HINT BELONGS TO ONE CANDIDATE, NOT THE PROMPT ════
     MEASURED on "compare I-8 and Raja Bazar Rawalpindi temperature": the only
     city named is Rawalpindi, so the prompt-wide hint was appended to I-8 as
     well, and I-8 resolved to 33.5915, 73.0537 - Rawalpindi Saddar, 8 km from
     the I-8 sector. Asked bare, "I-8" returns 33.6689, 73.0730 as its first
     hit, which is right. The hint made a correct answer wrong.

     Worse, it did so silently. Nominatim asked for "I-8 Rawalpindi" does not
     return nothing - it returns RAWALPINDI, place/city, importance 0.570. So
     the existing "no hits, retry without the hint" path never fired: there was
     a hit, and it was the hint itself wearing the candidate's name.

     Two changes. The hint is now taken only from the words around the
     candidate, so "Raja Bazar Rawalpindi" keeps its city and a bare "I-8" in
     the same sentence does not borrow it. And any hit that is merely the hint
     city - a place/city or place/town whose name IS the hint - is rejected and
     the lookup retried without the hint, which is the backstop for every case
     adjacency does not catch. */
  const CITY_RE = /\b(Islamabad|Rawalpindi|Karachi|Lahore|Faisalabad|Multan|Peshawar|Quetta|Hyderabad|Sialkot|Gujranwala|Sukkur|Bahawalpur|Sargodha|Abbottabad|Mardan|Larkana|Sahiwal|Rahim Yar Khan|Nawabshah|Mirpur|Muzaffarabad|Gilgit|Skardu)\b/i;
  function cityHintFor(prompt, cand) {
    const raw = String(prompt || ''), c = String(cand || '');
    const i = raw.indexOf(c);
    if (i < 0) return null;
    const after = raw.slice(i + c.length, i + c.length + 26);
    const before = raw.slice(Math.max(0, i - 26), i);
    const m = after.match(CITY_RE) || before.match(CITY_RE);
    return m ? m[1] : null;
  }
  /* a hit that is just the hint city, returned because the rest of the query
     matched nothing there */
  const isHintCityItself = (row, hint) => !!hint && !!row && row.osmClass === 'place'
    && /^(city|town|municipality|administrative)$/.test(String(row.osmType || ''))
    && normName(row.name) === normName(hint);
  /* a place was named at all: either a capitalised token, or "in|at|for|about X" */
  const namesAPlace = (text) => /\b(?:in|at|for|about|near|around)\s+[a-zA-ZÀ-ɏ]{3,}/i.test(String(text || '')) || /\b[A-Z][a-zA-Z]{2,}\b/.test(String(text || '').replace(/^\s*\S+/, ''));

  const placeCache = new Map();   /* normalised candidate -> { at, res } , 1 h */
  const pointCache = new Map();   /* lat,lon -> { at, fc } , 10 min */

  /* ══ v91.17.11 · SUB-CITY PLACES, WITHOUT TYPING THEM IN ═══════════════════
     Measured against the two chains this build already had: the AGN unit index
     holds 577 tehsils and no sector; Open-Meteo geocoding restricted to
     Pakistan finds Clifton, Korangi, Gulberg and Bahria Town but returns
     NOTHING for "I-8", "H-8", "Raja Bazar" or "DHA". Those are exactly the
     places people compare, and it is why three of them ended up hand-typed
     into a PROFILES array with their coordinates and their NDVI written out by
     hand as a "provisional expert demonstration".

     OpenStreetMap holds them. Nominatim, restricted to countrycodes=pk, is the
     last link in the chain - used only when the unit index and the provider
     geocoder have both come back empty. One request per second, cached for an
     hour, and identified by User-Agent as the policy requires. A failure here
     leaves the question unresolved and says so; it never falls back to a
     different place.

     Checked: "I-8 Islamabad" -> 33.6689, 73.0730 and "Raja Bazar Rawalpindi"
     -> 33.6123, 73.0563 - the same coordinates that were typed into the two
     hardcoded profiles. Those profiles were an OSM lookup done by hand once. */
  /* v91.17.34 · AUDIT A4 · the free OpenStreetMap Nominatim service is no longer called. The rule for
     this build is the paid provider only, and no free-tier geocoding. Fine-grained places go through
     the same paid geocoding the gazetteer uses (countryCode=PK). Results are shaped as before, so the
     callers below are unchanged; a place the paid index does not hold is reported as not found. */
  async function finePlace(q, cityHint) {   /* was nominatim(): same shape, paid geocoding behind it */
    if (!app.places) return [{ error: 'no place table' }];
    try {
      const res = await app.places.search(q + (cityHint ? ' ' + cityHint : ''), { limit: 5 });
      /* v91.17.62 · a spelling or prefix candidate is a suggestion for a person, never a resolution for the assistant:
         "Nowhere Kalan" must stay unresolved even though the gazetteer now offers "Nowshera Kalan" as a near spelling */
      return ((res && res.results) || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && !x.fuzzy && x.score >= 3)   /* v283.18: a name or alternate name of a record (3; 3.5 inside a named unit), never the start of a name or a spelling */.map((x) => ({
        name: x.name, displayName: [x.name, x.district, x.province].filter(Boolean).join(', '), lat: x.lat, lon: x.lon,
        osmClass: null, osmType: x.level || null, importance: null, source: x.source || 'NIGRAAN place table' }));
    } catch (e) { return [{ error: e.message }]; }
  }

  async function resolveAskedPlace(prompt, covered) {
    if (!app.places) return { tried: [], place: null, alternatives: [] };
    const cands0 = placeCandidates(prompt).filter((c) => !(covered && covered.has(normName(c))));
    const tried = [];
    /* v91.17.76 · A · B-02 · ordinary words are not places unless clearly named (see isCommonWord) */
    const cands = cands0.filter((c) => {
      if (/^[A-Z]-?\d/.test(String(c))) return true;
      if (!isCommonWord(c) || clearlyNamed(prompt, c)) return true;
      tried.push({ candidate: c, skipped: 'an ordinary English word, not named as a place' });
      return false;
    });
    if (cands0.length && !cands.length) return { tried, place: null, alternatives: [], candidate: null, commonWordsOnly: true };
    for (const c of cands) {
      if (isFineGrained(c)) {
        /* the hint is only useful when the candidate does not already name a
           city. Appending "Islamabad" to "Raja Bazar Rawalpindi" produced no
           hit at all, and the resolver then fell through to a bare "Bazar". */
        const own = cityHintIn(c);
        const useHint = own ? null : cityHintFor(prompt, c);
        const ok = 'osm:' + normName(c) + '|' + normName(useHint || '');
        let rows = null; const oh = placeCache.get(ok);
        if (oh && Date.now() - oh.at < 3600e3) rows = oh.res;
        else { rows = await finePlace(c, useHint); (placeCache.size > 300 && placeCache.delete(placeCache.keys().next().value), placeCache.set(ok, { at: Date.now(), res: rows })); }
        if (useHint && rows && rows.length && !rows[0].error && rows.every((r) => isHintCityItself(r, useHint))) rows = null;
        if ((!rows || !rows.length || rows[0].error) && useHint) rows = await finePlace(c, null);
        if (rows && rows.length && !rows[0].error) {
          const pl = rows[0];
          tried.push({ candidate: c, via: 'paid geocoding', hits: rows.length });
          return { tried, place: { name: c, district: null, province: null, lat: pl.lat, lon: pl.lon,
                                   elevM: null, level: 'settlement', source: pl.source, displayName: pl.displayName },
                   alternatives: [], candidate: c, viaOsm: true };
        }
        tried.push({ candidate: c, via: 'paid geocoding', hits: 0 });
        continue;
      }
      const k = normName(c);
      let res = null; const hit = placeCache.get(k);
      if (hit && Date.now() - hit.at < 3600e3) res = hit.res;
      else { try { res = await app.places.search(c, { limit: 5 }); placeCache.set(k, { at: Date.now(), res }); } catch (e) { tried.push({ candidate: c, error: e.message }); continue; } }
      const rows = (res && res.results) || [];
      /* the name must match what was asked. Without this "naran" would accept
         "Naranj" in Buner, 60 km away and 1,400 m lower. */
      const exact = rows.filter((r) => normName(r.name) === k);
      tried.push({ candidate: c, hits: rows.length, exactNameMatches: exact.length });
      if (exact.length) return { tried, place: exact[0], alternatives: exact.slice(1, 3), candidate: c };
      /* ══ v91.17.13 · KARACHI COULD NOT BE ASKED ABOUT ══════════════════
         MEASURED on the twenty-two largest Pakistani cities: twenty-one
         resolve and ONE does not. "temperature in Karachi", "smog in Karachi",
         "air quality in Karachi" and "Karachi weather" all returned "I could
         not find a place name in the question" - for the largest city in the
         country. The gazetteer finds it perfectly well: /api/geo/search?q=
         Karachi returns five rows. They are named Central Karachi, East
         Karachi, South Karachi, West Karachi and Korangi, because this index
         splits the city into eighteen town tehsils and no unit is called plain
         "Karachi". The exact-name rule above - which exists for a good reason,
         to stop "naran" accepting "Naranj" 60 km away - then rejected all five
         and the chain stopped there instead of carrying on to the geocoder.
         Karachi is the only one of the twenty-two where every unit name
         carries a direction in front of the city name, which is why it is the
         only one that failed.

         So: a name that is a whole word inside several unit names is a city
         this index has split, not a miss. The point comes from the geocoder,
         as it does for any settlement off the unit grid, and the answer says
         which units the city is split into so the next question can name one.
         A name that matches nothing is still refused, unchanged. */
      const whole = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
      /* v91.17.54 · MEASURED: "…next 24 hours? One short paragraph." resolved "One" to a canal-colony chak in Bahawalpur
         ("One R/Two R Kiranj Minor"): the split-city rule counted SETTLEMENT rows that merely contain the word. A split city
         is a name inside several UNIT names (Central/East/South/West Karachi); settlement rows never make one. */
      const spans = rows.filter((r) => (r.level === 'tehsil' || r.level === 'district') && (whole.test(normName(r.name)) || whole.test(normName(r.district || ''))));
      if (spans.length >= 2) {
        let pt = null;
        const ok = 'osm:' + k + '|';
        const oh = placeCache.get(ok);
        let orows = (oh && Date.now() - oh.at < 3600e3) ? oh.res : null;
        if (!orows) { orows = await finePlace(c, null); placeCache.set(ok, { at: Date.now(), res: orows }); }
        if (orows && orows.length && !orows[0].error) pt = orows[0];
        /* the count must come from the full unit index, not from a search
           capped at five rows: an earlier version of this note said Karachi is
           "split across 4" because that is how many the capped search
           returned. Counted against pk-tehsils.json it is 9 tehsils in 4
           districts that carry the word Karachi in the unit or district name.
           (Korangi and Malir are Karachi city and do not carry the word, so
           they are outside what this sentence claims - it is a statement about
           what this index calls Karachi, not about the city's boundary.)
           A number in an answer is either right or absent. */
        const allIn = app.units.tehsil.filter((u) => whole.test(normName(u.name)) || whole.test(normName(u.district || '')));
        const districts = [...new Set(allIn.map((u) => u.district).filter(Boolean))];
        const unitNames = districts.length ? districts.slice(0, 8) : [...new Set(spans.map((r) => r.district || r.name))].slice(0, 8);
        const nUnits = allIn.length;
        tried.push({ candidate: c, via: pt ? 'paid geocoding (city split across units)' : 'unit index (city split across units)', spans: spans.length });
        if (pt) return { tried, candidate: c, viaOsm: true, alternatives: [],
          place: { name: c, district: null, province: spans[0].province || null, lat: pt.lat, lon: pt.lon,
            elevM: null, level: 'city', source: pt.source, displayName: pt.displayName,
            splitAcrossUnits: unitNames,
            splitNote: c + ' is not one unit in this index' + (nUnits ? ' - it is ' + nUnits + ' tehsil' + (nUnits === 1 ? '' : 's') + (unitNames.length ? ' across ' + unitNames.length + ' districts (' + unitNames.join(', ') + ')' : '') : '')
              + '. The point above is the city; the tehsil products below are rolled up from the one tehsil that point falls in, not averaged over the city. Name a tehsil or district for a value that is its own.' } };
        return { tried, candidate: c, alternatives: spans.slice(1, 3),
          place: Object.assign({}, spans[0], { splitAcrossUnits: unitNames,
            splitNote: c + ' is not one unit in this index' + (nUnits ? ' - it is ' + nUnits + ' tehsil' + (nUnits === 1 ? '' : 's') + (unitNames.length ? ' across ' + unitNames.length + ' districts (' + unitNames.join(', ') + ')' : '') : '') + '; this answer is for ' + (spans[0].name || spans[0].tehsil) + ' alone.' }) };
      }
    }
    /* nothing in the unit index or the provider geocoder. Try OSM for the whole
       phrase, which is what carries sector and bazaar names. */
    /* v91.17.266 · only when the question held a place-like word at all (a question of weather words alone names no place), and
       a hit counts only when its name is written in the question (a confident match, not the geocoder's best guess) */
    const phrase = cands.length ? String(prompt || '').replace(/[?!.]+$/, '').trim().slice(0, 90) : '';
    const inPrompt = (nm) => { const a = normName(nm), b = ' ' + normName(prompt) + ' '; return !!a && b.includes(' ' + a + ' '); };
    if (phrase) {
      const k = 'osm:' + normName(phrase);
      let rows = null; const hit = placeCache.get(k);
      if (hit && Date.now() - hit.at < 3600e3) rows = hit.res;
      else { rows = await finePlace(phrase); placeCache.set(k, { at: Date.now(), res: rows }); }
      if (rows && rows.length && !rows[0].error && rows.some((x) => inPrompt(x.name))) {
        rows = rows.filter((x) => inPrompt(x.name));
        const p = rows[0];
        tried.push({ candidate: phrase, via: 'paid geocoding', hits: rows.length });
        return { tried, place: { name: p.name, district: null, province: null, lat: p.lat, lon: p.lon,
                                 elevM: null, level: 'settlement', source: p.source, displayName: p.displayName },
                 alternatives: rows.slice(1, 3).map((x) => ({ name: x.name, lat: x.lat, lon: x.lon, displayName: x.displayName })),
                 candidate: phrase, viaOsm: true };
      }
      if (rows && rows[0] && rows[0].error) tried.push({ candidate: phrase, via: 'paid geocoding', error: rows[0].error });
      else if (rows && rows.length) tried.push({ candidate: phrase, via: 'paid geocoding', hits: 0, skipped: 'no hit is named in the question' });
    }
    return { tried, place: null, alternatives: [], candidate: cands[0] || null };
  }

  /* ══ v91.17.11 · "COMPARE X AND Y" IS TWO PLACES, NOT ONE ═════════════════
     Reported from the dashboard: the question was "compare islamabad different
     sector temp" and the answer was a single centroid forecast for Islamabad.
     Both the comparison and the word "sector" were dropped, because the
     resolver returned the FIRST place it matched and stopped.

     This resolves every named place in the prompt, up to four, so a comparison
     has both sides. Each one carries its own point forecast and its own urban
     morphology, which is where an intra-city difference actually lives: the
     provider's model grid is far coarser than the distance between two sectors
     of one city and will return nearly the same air temperature for both. */
  async function resolveAskedPlaces(prompt, covered) {
    const first = await resolveAskedPlace(prompt, covered);
    const out = first.place ? [first] : [];
    /* ══ v91.17.13 · AN UNRESOLVED PLACE SAID NOTHING AT ALL ════════════════
       MEASURED: "temperature in Neelum" answered "I could not find a place
       name in the question" — the message for a question with no place in it —
       and "landslide in Neelum" answered with NOTHING about the place at all,
       because the hazard block had already put lines on the page so the
       no-place-named message was skipped too. The correct answer, which this
       module already knows how to write, is "I could not find Neelum in
       Pakistan. Searched: the 577 units, the alias table, then Open-Meteo
       geocoding restricted to PK."

       It could never be written. That branch needs r.candidate, and when
       resolveAskedPlaces (added for multi-place questions) resolved nothing it
       returned only { list, tried } — the candidate the inner resolver had
       tried was dropped on the floor. So the specific refusal became
       unreachable the moment the plural resolver was introduced. It is carried
       out now. */
    if (!first.place) return { list: out, tried: first.tried, candidate: first.candidate || null };
    const marks = (r) => { const a = [normName(r.place && r.place.name), normName(r.candidate || '')];
      const b = bareOf(r.candidate); if (b) a.push(normName(b)); return a.filter(Boolean); };
    const seen = new Set(marks(first));
    const cov = new Set([...(covered || []), ...seen]);
    for (let i = 0; i < 3; i++) {
      const nxt = await resolveAskedPlace(prompt, cov);
      if (!nxt.place) break;
      const m = marks(nxt);
      if (m.every((x) => seen.has(x))) break;
      for (const x of m) { seen.add(x); cov.add(x); }
      /* a general backstop, independent of how the candidate was spelled: two
         candidates that land within 500 m of each other are one place. Name
         dedupe alone let "Raja Bazar Rawalpindi" and "Raja Bazar" through as
         two places at identical coordinates. */
      const near = out.some((o) => o.place && nxt.place
        && Math.abs(o.place.lat - nxt.place.lat) < 0.005 && Math.abs(o.place.lon - nxt.place.lon) < 0.005);
      if (near) continue;
      out.push(nxt);
    }
    return { list: out, tried: first.tried, candidate: first.candidate || null };
  }

  async function pointForecast(lat, lon) {
    const k = Number(lat).toFixed(4) + ',' + Number(lon).toFixed(4);
    const hit = pointCache.get(k);
    if (hit && Date.now() - hit.at < 600e3) return hit.fc;
    /* ten variables exactly: the provider's weighting is
       locations x max(1, vars/10) x max(1, days/14), so this costs one unit. */
    /* v91.17.71 · the zone temperature basis (data/model-zone.json via mos.requestModels, folded by verification.mergeZone)
       and the served correction, as national.mjs and fleet.mjs do: a mountain point was read as raw best_match here
       (s70 CHANGES_temperature open item 4) */
    /* v91.17.149 · audit D4 · the AI reads the SAME served chain as the pages (proxy /px: zone members, national model, airport and
       synop terms, the live MACH layer, days from the served curve), asked as the point card asks it (5 decimals, the 30 m height).
       Before, it called the provider with no hourly series, so the national model, the curve rule and the height never applied. The
       old direct path stays as the fallback when the proxy does not answer. */
    let body = null, corrected = false;
    try { let el = null; try { const rw = app.places.pointRow(Number(lat), Number(lon)); el = rw && (rw.forecastElevM != null ? rw.forecastElevM : rw.elevM); } catch (_) { el = null; }
      const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: Number(lat).toFixed(5), longitude: Number(lon).toFixed(5), timezone: 'Asia/Karachi', forecast_days: '7',
        hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,shortwave_radiation,direct_radiation,cloud_cover',   /* v91.17.157 · the /state radiant method needs direct and cloud (9 variables: one call) */
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,shortwave_radiation',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max' });
      if (Number.isFinite(el)) q.set('elevation', String(Math.round(el)));
      const r = await fetch(`http://127.0.0.1:${Number(process.env.PORT || 8787)}/px/v1/forecast?` + q.toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'ai-point' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) { body = await r.json(); corrected = Number(r.headers.get('x-agn-bias-corrected') || 0) > 0 || !!(body && (body.agn_national || body.agn_temperature_basis)); }
    } catch (_) { body = null; }
    if (!body || !body.daily || !Array.isArray(body.daily.temperature_2m_max)) {
      let zm = null; try { zm = app.mos && app.mos.requestModels ? app.mos.requestModels() : null; const Z = app.mos.zones && app.mos.zones(); const B = (Z && Z.clientBoxes) || []; if (zm && B.length && !B.some(z => lat >= z[0] && lat <= z[2] && lon >= z[1] && lon <= z[3])) zm = null; } catch (_) { zm = null; }
      body = await app.provider.call('forecast', '/v1/forecast', {
        latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 7,
        current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'shortwave_radiation'],
        daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_gusts_10m_max'],
        ...(zm ? { models: zm } : {}),
      }, { locations: 1, timeoutMs: 15000 });
      let merged = false; try { if (zm && app.verification && app.verification.mergeZone) merged = !!app.verification.mergeZone(body, Number(lat), Number(lon), zm); } catch (_) { merged = false; }
      if (zm && (!merged || !body || !body.daily || !Array.isArray(body.daily.temperature_2m_max))) {   /* the zone fold failed: read the plain series rather than suffixed keys */
        body = await app.provider.call('forecast', '/v1/forecast', { latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 7,
          current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'shortwave_radiation'],
          daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_gusts_10m_max'] }, { locations: 1, timeoutMs: 15000 }); }
      /* v91.17.207 · the one served chain after the zone fold (static chain, airport, weather MOS, synoptic and live terms, day card from
         the curve); before, this fallback applied the static chain only */
      corrected = false; try { if (stationData() && app.verification && app.verification.servedChain) corrected = app.verification.servedChain(body, Number(lat), Number(lon), {}).n > 0; } catch (_) { corrected = false; }
    }
    const c = { ...((body && body.current) || {}) }, d = (body && body.daily) || {};
    /* v91.17.149 · audit D4 · "now" is the current PKT hour of the served curve, the point card's hour, so the AI quotes the page's number */
    try { const H = body && body.hourly; if (H && Array.isArray(H.time)) { const nowH = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13), k = H.time.findIndex((t) => String(t).slice(0, 13) === nowH);
      if (k >= 0) { for (const v of ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'wind_speed_10m', 'wind_gusts_10m', 'shortwave_radiation', 'direct_radiation', 'cloud_cover']) if (Array.isArray(H[v]) && H[v][k] != null) c[v] = H[v][k]; c.time = H.time[k]; } } } catch (_) {}
    /* v91.17.101 · N1 · UTCI now: shade (Tmrt = air) and, with the sun up, sun (Tmrt from the short-wave radiation; an estimate) */
    let U = null; try { const v10 = c.wind_speed_10m != null ? c.wind_speed_10m / 3.6 : null; const sh = utciF(c.temperature_2m, c.temperature_2m, v10, c.relative_humidity_2m);
      const el = c.time ? sunElevF(Number(lat), Number(lon), Date.parse(c.time + (/[zZ]|[+-]\d\d:?\d\d$/.test(c.time) ? '' : 'Z')) - ((body && body.utc_offset_seconds) || 0) * 1000) : null;
      /* v91.17.157 · audit: one radiant-temperature method. With direct radiation and cloud held, the /state method (Di Napoli et al. 2020,
         ERA5-HEAT: Prata long-wave, albedo 0.20) is used, so the AI and /state give the same UTCI in sun for the same hour (they were ~10 K
         apart in Tmrt); without them the simpler Fanger estimate stays, and says so */
      const whenMs = c.time ? Date.parse(c.time + (/[zZ]|[+-]\d\d:?\d\d$/.test(c.time) ? '' : 'Z')) - ((body && body.utc_offset_seconds) || 0) * 1000 - 1800e3 : null;
      const mrtDN = (whenMs != null && c.shortwave_radiation > 0 && c.direct_radiation != null && c.cloud_cover != null && c.relative_humidity_2m != null) ? meanRadiantTemperature(c.temperature_2m, c.relative_humidity_2m, c.cloud_cover / 100, c.shortwave_radiation, c.direct_radiation, null, cosSolarZenith(Number(lat), Number(lon), whenMs), FIXED_ALBEDO).tmrt : null;
      const tr = (el != null && el > 0 && c.shortwave_radiation > 0) ? (mrtDN != null ? mrtDN : tmrtF(c.temperature_2m, c.shortwave_radiation, null, el, FIXED_ALBEDO)) : null; const su = tr != null ? utciF(c.temperature_2m, tr, v10, c.relative_humidity_2m) : null;
      if (sh != null) U = { utci_shade_c: sh, utci_sun_c: su, utci_class: utciClassF(sh), utci_class_basis: 'shade (v91.17.103: the class and severity come from shade; the sun value is an estimate and controls nothing)', utci_sun_estimated: su != null, utci_basis: 'UTCI (Broede 2012); sun value is ESTIMATED from a mean radiant temperature derived from forecast short-wave radiation, not validated against a globe thermometer' }; } catch (_) { U = null; }
    const fc = {
      retrievedAt: nowIso(),
      providerElevationM: body && body.elevation != null ? Math.round(body.elevation) : null,
      temperatureBasis: body && body.agn_temperature_basis ? { zone: body.agn_temperature_basis.zone, model: body.agn_temperature_basis.model, merged: !!body.agn_temperature_basis.merged } : null,
      calibration: corrected ? label('calibration') + ' (tier B)' : null,
      fallback: body && body.agn_fallback ? { source: body.agn_fallback.source, corrected: false, missing: body.agn_fallback.missing || [], say: 'the main forecast was unavailable; these numbers are from a secondary global forecast without NIGRAAN corrections, so confidence is reduced' } : null,   /* v91.17.157 · audit: the AI now knows when it reads the fallback */
      timezone: body && body.timezone || null,
      now: { ...(U || {}), time: c.time || null, temperature_c: c.temperature_2m, apparent_temperature_c: c.apparent_temperature, relative_humidity_pct: c.relative_humidity_2m, precipitation_mm_h: c.precipitation, wind_speed_kmh: c.wind_speed_10m, wind_gusts_kmh: c.wind_gusts_10m },
      days: (d.time || []).map((t, i) => ({ date: t, tmax_c: d.temperature_2m_max[i], tmin_c: d.temperature_2m_min[i], rain_mm: d.precipitation_sum[i], gust_max_kmh: d.wind_gusts_10m_max[i] })),
    };
    if (pointCache.size > 300) pointCache.delete(pointCache.keys().next().value);
    pointCache.set(k, { at: Date.now(), fc });
    return fc;
  }

  /* ══ v91.17.11 · THE PART OF THE TEMPERATURE THE GRID CANNOT SEE ══════════
     The provider's model grid is coarser than a city. Ask it for I-8 and for
     Raja Bazar, 6 km apart, and it returns very nearly the same air
     temperature, because within one grid box there is only one value. That is
     not a defect in the forecast; it is what a grid is. It does mean the
     forecast alone can never answer "which sector is hotter".

     The morphology can. Attached to every place and unit the answer uses, so
     the difference between two points in one city is stated from measured
     built fraction, building height, vegetation and canyon geometry rather
     than from two grid values that were always going to agree. */
  function urbanFacts(lat, lon) {
    if (!app.urbanHeat || !app.urbanHeat.ready()) return null;
    let e = null;
    try { e = app.urbanHeat.estimate(lat, lon, { at: nowIso() }); } catch (_) { return null; }
    if (!e || !e.ready) return null;
    if (!e.urban) return { urban: false, why: e.why, ...(e.withheld ? { withheld: true, heatIsland: 'Not assessed: ' + e.why } : {}) };   /* C12 */
    return {
      urban: true,
      builtSurfaceFraction: e.cell.builtFraction,
      meanBuildingHeightM: e.cell.meanBuildingHeightM,
      populationPerKm2: e.cell.populationPerKm2,
      ndvi: e.cell.ndvi,
      localClimateZone: e.lcz ? (e.lcz.class + ' - ' + e.lcz.name) : null,
      canyonAspectRatio: e.geometry.aspectRatio,
      skyViewFactor: e.geometry.skyViewFactor,
      heatIslandMaxC: e.heatIsland.maxC,
      heatIslandNowC: e.heatIsland.nowC,
      hoursFromSunset: e.heatIsland.hoursFromSunset,
      anthropogenicHeatWm2: e.anthropogenicHeat.qfWm2,
      cellSizeM: e.cell.cellSizeM,
      basis: 'GHS-BUILT-S and GHS-BUILT-V 2025 at about 270 m, GHS-POP 2025, MODIS NDVI August 2026, and the WUDAPT local climate zone map. Heat island from Oke (1981) canyon geometry, calibrated 0.559 by least squares against TWO urban/rural station pairs \u2014 Rawalpindi and Lahore, 49,555 concurrent hours 2018\u20132025 \u2014 and shaped by the Rawalpindi pair\'s measured diurnal curve. The Lahore pair peaks at a different hour of the night, so the timing is a one-city result.',
      limits: 'a nocturnal heat-island potential in kelvin ON TOP of the grid forecast, not a measured air temperature and not part of the provider forecast. One calibration pair, in one city. Differences between two places are better supported than the absolute value at either.',
    };
  }

  const sgn = (v) => (v == null ? 'n/a' : (v > 0 ? '+' : '') + v);
  const ord = (n) => { if (n == null) return 'n/a'; const t = n % 100; if (t >= 11 && t <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
  /* ══ v91.17.13 · A DROUGHT QUESTION HAS TO REACH THE DROUGHT INDICES ══════
     Measured: "drought in Lahore" returned a point forecast and the urban
     morphology, and never once said SPI, SPEI or soil moisture. The backend
     has all three per unit and the answer was not carrying them, so the one
     question the layer exists to answer was the one it did not answer.

     Attached to any unit the answer uses, and to a named point through the
     tehsil that contains it. */
  /* v91.17.101 · audit #80 · the event memory (station-lake/scripts/event_memory.py → data/event-memory.json) */
  let EVM = null, EVMt = 0;
  function eventMemory() { try { const f = join(root, 'data', 'event-memory.json'); if (!existsSync(f)) return null; const t = statSync(f).mtimeMs; if (!EVM || t !== EVMt) { EVM = JSON.parse(readFileSync(f, 'utf8')); EVMt = t; } return EVM; } catch (_) { return null; } }
  function droughtFacts(unitId) {
    if (!unitId || !app.climatology || !app.climatology.droughtNational) return null;
    let n = null;
    try { n = app.climatology.droughtNational(); } catch (_) { return null; }
    if (!n || !n.ready || !n.spi) return null;
    const t = n.spi[unitId]; if (!t) return null;
    const v = (f) => (t[f] && t[f].value != null) ? t[f].value : null;
    const why = (f) => (t[f] && t[f].value == null) ? t[f].why : null;
    return {
      asOf: n.asOf, rainSource: t.rainSource || 'ERA5', observed: true, basis: 'observed: computed from the observed drought index (rain SPI / SPEI over the last 30-90 days, with the soil and vegetation readings), not a forecast',   /* v91.17.283.2 */
      servedClass: t.drought ? (t.drought.class === 'Low' ? 'Normal (no drought signal)' : t.drought.class) : null, classRule: t.drought ? t.drought.rule : null, provisional: !!(t.drought && t.drought.provisional),
      spi30: v('spi30'), spi90: v('spi90'), spei30: v('spei30'), spei90: v('spei90'),
      spi90Class: t.spi90 && t.spi90.class, spei90Class: t.spei90 && t.spei90.class,
      rain90mm: t.spi90 && t.spi90.mm, waterBalance90mm: t.spei90 && t.spei90.mm,
      rootZoneSoilMoisture: t.smRoot && t.smRoot.value,
      rootZonePercentile: t.smRoot && t.smRoot.percentile,
      antecedent: t.api ? { api5Mm: t.api.api5Mm, api15Mm: t.api.api15Mm, rain7dMm: t.api.p7Mm, asOf: t.api.asOf } : null,   /* v91.17.38 */
      refusals: { spi90: why('spi90'), spei90: why('spei90'), smRoot: t.smRoot && t.smRoot.why },
      arid: !!((t.spi90 && t.spi90.arid) || (t.spei90 && t.spei90.arid)),   /* v91.17.36 · AUDIT R-11 */
      aridWhy: (t.spi90 && t.spi90.arid && t.spi90.why) || (t.spei90 && t.spei90.arid && t.spei90.why) || null,
      classes: n.classes,
      vegetation: (() => { try { const V = app.vegetation && app.vegetation.unit(unitId); return V && (V.vhi != null || V.canal) ? { week: V.week, vhi: V.vhi ?? null, vci: V.vci ?? null, tci: V.tci ?? null, level: V.level ?? null, stressShare: V.stressShare ?? null, why: V.vhi == null ? V.why : null, canalFed: !!(V.canal && V.canal.canalFed), canalKmPer100Km2: V.canal ? V.canal.kmPer100Km2 : null } : null; } catch (_) { return null; } })(),
      vegetationReading: (() => { try { return app.vegetation ? app.vegetation.reading(unitId, t.drought && t.drought.class) : null; } catch (_) { return null; } })(),
      basis: 'SPI: McKee et al. (1993) with the Thom (1958) mixed gamma. SPEI: Vicente-Serrano et al. (2010) log-logistic on P - ET0. Both fitted on 1991-2020 for this unit at the same end-pentad; rain from the satellite rainfall record (the global reanalysis where it is stale), ET0 from the global reanalysis. Soil moisture is ERA5 7-28 and 28-100 cm as a percentile of this unit\'s own record for this time of year.',
      reading: 'SPI and SPEI describe how unusual the rain and the water balance have been over the window. The soil-moisture percentile describes how wet the root zone is now against its own history. They can disagree, and where they do that is the finding - irrigation or antecedent storage covering a rainfall deficit, or heat and demand drying a root zone that had normal rain.',
    };
  }
  async function placeFacts(r) {
    const p = r.place;
    const f = {
      name: p.name, district: p.district, province: p.province, lat: p.lat, lon: p.lon,
      gazetteerElevationM: p.elevM, source: p.source,
      resolvedFrom: 'the place name in the question, resolved against NIGRAAN\'s place table (places, tehsils, districts and provinces of Pakistan)',
      isAgnUnit: p.level !== 'settlement',
      productNote: 'Direct point forecast at these coordinates. It is NOT a NIGRAAN tehsil product: the per-unit verification is defined on the tehsils and does not apply to a point off that grid. Hazard levels are those served for the tehsil the point lies in.',
    };
    if (r.alternatives && r.alternatives.length) f.otherPlacesWithThisName = r.alternatives.map((a) => ({ name: a.name, district: a.district, province: a.province, elevM: a.elevM, lat: a.lat, lon: a.lon }));
    if (p.displayName) f.osmDisplayName = p.displayName;
    try { const rv = app.places.resolvePoint(p.lat, p.lon); if (rv && rv.label) f.whereThisIs = rv.label + (rv.town ? ' (' + rv.town.distanceKm + ' km ' + rv.town.bearing + ' of ' + rv.town.name + ')' : ''); } catch (_) {}   /* v91.17.47 */
    if (p.splitNote) { f.splitNote = p.splitNote; f.splitAcrossUnits = p.splitAcrossUnits || null; }
    try { f.forecast = await pointForecast(p.lat, p.lon); } catch (e) { f.forecastUnavailable = clientWhy(e); }
    try { const pd = await pointDaysAt(p.lat, p.lon); if (pd && pd.length) f.pointDays = pd; } catch (_) {}   /* v91.17.283 · D32 */
    /* v91.17.283 · WS4 · item 8 · the served hazard levels of the tehsil the point lies in (the console's levels for that tehsil) */
    try { const h = unitAtPoint(app, p.lat, p.lon); if (h && h.unit && !h.unit.disputed) { const m = mapLevelsOf(h.unit.unitId); if (m) f.servedUnit = { tehsil: h.unit.name, unitId: h.unit.unitId, mapLevels: m };
      /* v91.17.283.52 D · N14: the asked place carries the place summary (weather hazards + served air quality) like the selected place */
      try { const SU = servedUnit(app, h.unit.unitId, false); if (SU && SU.summary) f.placeSummary = { state: SU.summary.state, raised: SU.summary.raised, headline: SU.summary.headline, air: SU.summary.air }; } catch (_) {} } } catch (_) {}
    const uh = urbanFacts(p.lat, p.lon); if (uh) f.urbanMorphology = uh;
    try {
      const un = (app.urbanHeat && app.urbanHeat.unitAt) ? app.urbanHeat.unitAt(p.lat, p.lon) : null;
      if (un) {
        /* ══ v91.17.13 · ONE POINT IS NOT A CITY ═══════════════════════════════
           Measured: "drought in Lahore" resolved to 31.5005, 74.4315 - a
           low-built patch near the airport - and reported an urban heat island
           of 0.00 C for LAHORE. The point value was right for that point and
           useless as an answer about the city. The tehsil's
           population-weighted value is carried beside it, which is the heat
           island the average resident of that tehsil is in. */
        try {
          const nat = app.urbanHeat.national();
          const uu = nat && nat.ready && nat.units && nat.units[un.uid];
          if (uu) f.urbanUnit = { tehsil: un.tehsil, district: un.district,
            popWeightedC: uu.popWeightedC, medianC: uu.medianC, maxC: uu.maxC, spreadC: uu.spreadC, cells: uu.cells,
            warmestCell: uu.warmestCell,
            note: 'population-weighted over the tehsil this point falls in - the heat island the average resident of it is in. The point value above is for one 270 m cell and can be far lower if that cell is a park, an airfield or open ground.' };
        } catch (_) {}
        const dr = droughtFacts(un.uid);
        if (dr) { f.drought = dr; f.droughtUnit = { unitId: un.uid, tehsil: un.tehsil, district: un.district, province: un.province,
          note: 'the drought indices are defined on the 577 tehsils, so these are for the tehsil this point falls in, not for the point' }; }
        /* ══ v91.17.13 · AIR QUALITY HAD NO ROLL-UP, SO IT WAS NEVER ANSWERED ══
           MEASURED: "air quality in Lahore tomorrow" and "smog in Lahore"
           returned a temperature forecast with no PM2.5 and no AQI in 2,923
           characters. "air quality in Lahore City tomorrow" - naming the
           tehsil - returned the full five-day PM2.5 table. The difference is
           that bare "Lahore" resolves to a gazetteer POINT, and the air and
           smog product is defined on the 577 tehsils, so the branch that
           prints it only ever ran for a unit. Drought and urban heat were
           given a roll-up to the containing tehsil earlier in this version;
           air was not, and fell through silently.

           Recording a measurement error of my own with it: an earlier pass of
           the sixteen-question battery scored this question PASS, because the
           check looked for /PM2.5|AQI|air/ and the bare word "air" appears in
           the forecast text. The question had been failing the whole time. The
           honest before/after for that battery is 9/16, not 10/16. */
        try {
          const sm = app.smog && app.smog.unit(un.uid);
          if (sm && sm.days && sm.days.length) f.airAndSmog = {
            source: 'CAMS PM2.5 forecast (under-reads Punjab winter smog) plus afternoon ventilation, morning inversion and fog from the weather forecast; not verified against monitors',
            unit: { unitId: un.uid, tehsil: un.tehsil, district: un.district, province: un.province },
            note: 'air and smog are defined on the 577 tehsils, so this is for ' + un.tehsil + ', the tehsil this point falls in, not for the point itself',
            days: sm.days.map((d) => ({ date: d.date, pm25_ugm3: d.pm25, pm25_class: sm.classes[d.pmClass], us_aqi_max: d.aqi != null ? d.aqi : null, aqi_category: d.aqiCategory || null,
              dispersion: sm.dispersion[d.dispersion], afternoon_ventilation_m2s: d.afternoonVentilation,
              inversion_hours: d.inversionHours, fog_hours: d.fogHours, smog_day: d.smogDay })) };
        } catch (_) {}
        /* v91.17.44 · S7 · the suggestion library, the floodplain and the catchment wetness are tehsil products: rolled up
           to the tehsil this point falls in, and said so */
        try { const uu = (app.units.tehsil || []).find(x => x.unitId === un.uid);
          if (uu) { const sg = app.report && app.report.suggestions && app.report.suggestions(uu); if (sg) f.suggestions = { ...sg, unit: un.tehsil, note: sg.note + '; for ' + un.tehsil + ', the tehsil this point falls in' };
            const h = app.hand && app.hand.of(un.uid); if (h) f.floodplain = { unit: un.tehsil, basis: h.basis || h.why || null, floodplainShare: h.floodplainShare ?? null, where: h.where || null, note: 'HAND and TWI on GLO-90 at 180 m for the tehsil this point falls in: where water spreads or collects, not a depth and not a probability' };
            /* v91.17.101 · the same served products for the tehsil a named point falls in */
            try { const rc = app.rainChance && app.rainChance.unit(un.uid); if (rc && rc.ready) f.rainChance = { unit: un.tehsil, days: rc.days.map(d => ({ date: d.date, forecastMm: d.fcMm, chancePct: { atLeast1mm: d.p['1'], atLeast10mm: d.p['10'], atLeast25mm: d.p['25'] } })), note: 'calibrated chance of a satellite-measured day total at or above the amount, for the tehsil this point falls in' }; } catch (_) {}
            try { const E = app.engine && app.engine.unit(un.uid, false); if (E && E.ready) f.mapLevels = { unit: un.tehsil, note: 'the hazard levels the NIGRAAN map shows for ' + un.tehsil + ', the tehsil this point falls in (day basis: the day\'s peak); quote these words, do not re-derive a level', computedAt: E.at, stale: E.stale, days: E.days.map(d => ({ date: d.date, hazards: Object.values(d.layers).map(x => ({ hazard: x.name, level: x.word })) })) }; } catch (_) {}   /* v91.17.106 */
            try { const G = app.glof && app.glof.national && app.glof.national(false); const g = G && G.ok && G.units && G.units[un.uid]; if (g && g.applicable) f.glof = { unit: un.tehsil, ...glofCtx(g), text: g.text || null }; } catch (_) {}
            try { const M = eventMemory(); const ev = M && M.units && M.units[un.uid]; if (ev && ev.length) f.pastEvents = { unit: un.tehsil, events: ev.slice(0, 8).map(e => e.text), sources: M.sources }; } catch (_) {}
            try { const L = app.landslideOdds && app.landslideOdds.unit(un.uid); if (L && L.ready) f.landslideRainTrigger = { unit: un.tehsil, note: LS_NOTE + '; rain-triggered slides only (not melt, thaw or earthquake slides)', days: L.days.filter(d => d.ratio != null).map(d => ({ date: d.date, observedTimesOrdinaryDay: d.observedRatio ?? null, modelClass: d.modelBand || null })) };   /* v91.17.283.8 · science audit: the observed ratio of the class, never the model multiplier */ } catch (_) {}   /* v91.17.112 */
            const w = app.wetness && (app.wetness.current ? app.wetness.current(un.uid) : null); if (!w && app.wetness && app.wetness.staleNote && app.wetness.staleNote()) f.catchmentWetness = app.wetness.staleNote(); /* v91.17.172 · audit E-4 */ if (w && !w.notDefined && w.now) f.catchmentWetness = { unit: un.tehsil, rootZoneWetness: w.now.ws, state: w.now.state, storageRemainingMm: w.now.awsMm, rainNext72Mm: w.rain.next72Mm, sensitivity: w.sensitivity, note: 'for the tehsil this point falls in; a model soil state against its own yearly range, not a gauge' }; } } catch (_) {}
      }
    } catch (_) {}
    return f;
  }

  /* v91.17.6 · a unit with no stored record used to answer "no stored forecast
     yet (the national run has not completed)". That is true and useless: the
     unit has coordinates, and a point forecast at them costs one provider call.
     The stored run stays the primary source — it is the bias-corrected, verified
     product — and this fallback is labelled so the two are never confused. */
  /* v91.17.283 · WS4 · item 8 · the served levels of one tehsil, in the shape every answer reads (hazard name, word, product type,
     not-assessed reason); the operator sees the same rules (hidden layers stay hidden in answers too: an answer is client text) */
  function mapLevelsOf(unitId) {
    let E = null; try { E = servedUnit(app, unitId, false); } catch (_) { E = null; }
    if (!E || !E.ready) return E && E.why ? { unavailable: true, why: E.why } : null;
    return { note: 'the hazard levels the NIGRAAN console and start page show for this tehsil, by forecast day (day basis: the day\'s peak); quote these words with their product type, do not re-derive a level; "Not assessed" is never Normal',
      computedAt: E.at, stale: E.stale, servedBy: E.servedBy,
      days: E.days.map((d) => ({ date: d.date, hazards: Object.entries(d.layers).map(([k, x]) => ({ layer: k, hazard: x.name, level: x.assessed === false ? 'Not assessed' : x.word, ...(x.levelLabel ? { levelLabel: x.levelLabel } : {}), productType: x.productType || null,
        ...(x.assessed === false ? { notAssessedWhy: x.notAssessedWhy } : {}), ...(x.canAlert === false && x.level >= 2 ? { raisesNoAlert: true } : {}), ...(x.basis ? { basis: x.basis } : {}), ...(x.held ? { heldFromIssue: true, ...(x.heldNote ? { heldNote: x.heldNote } : {}) } : {}) })) })),
      hidden: E.hidden || [], alerts: (E.alerts || []).map((a) => ({ alert: a.alert, hazard: a.hazard })), ...(E.alertsWithheld ? { alertsWithheld: E.alertsWithheld } : {}) };
  }
  /* v91.17.283 · WS4 · D32 · the day aggregates the panel shows: PKT-day max / min of the served hourly curve (point engine), and the gust
     maximum and rain total of the same hourly series, so the AI never quotes the provider's own daily fields beside the panel's */
  async function pointDaysAt(lat, lon) {
    if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return null;
    if (app.pointState) { try { const ps = await Promise.race([app.pointState.state(+lat, +lon, { noBuild: true }), new Promise((r) => setTimeout(() => r(null), 25000))]);   /* v91.17.283.12 · the point state's days */
      if (ps && ps.ok && Array.isArray(ps.days)) return ps.days.map((d) => ({ date: d.date, tmax_c: d.tmaxC, tmin_c: d.tminC, gust_max_kmh: d.gustMaxKmh, rain_mm: d.rainMm, hours: d.hoursHeld })); } catch (_) {} }
    return null;   /* v91.17.283.12: the point state only (no point-engine fallback) */
  }
  async function unitFactsFull(u, point, opts = {}) {
    const f = unitFacts(u);
    /* v91.17.122 · ONE "NOW" PER PLACE (CEO 2 Oct: Overview 25.4, Current conditions 26.4, AI 27.3 for the same Islamabad). The AI's
       "now" came from the stored national run (up to an hour old, tehsil point, no live-station step). It is now the point engine at
       the place the dashboard has selected (or the unit's own point for a named place): the same function the page shows. */
    if (!f.disputed && app.pointState) {
      const pt = (point && Number.isFinite(+point.lat) && Number.isFinite(+point.lon)) ? { lat: +point.lat, lon: +point.lon } : (u.lat != null && u.lon != null ? { lat: +u.lat, lon: +u.lon } : null);
      /* v91.17.283.12 · the AI's "now" is the point state (pointstate.mjs), the one record the Overview, the start page and the report read
         (owner 24 Oct: the AI said 9.3 where the screen said 11.5); the point engine only when the point state is not running */
      if (pt && app.pointState) { try { const ps = await Promise.race([app.pointState.state(pt.lat, pt.lon, { noBuild: true }), new Promise(r => setTimeout(() => r(null), 25000))]);
        if (ps && ps.ok && ps.now) { f.pointNow = { lat: ps.point.lat, lon: ps.point.lon, time: ps.now.time, temperature_c: ps.now.tempC, range90_c: [null, null], relative_humidity_pct: ps.now.rh, wind_kmh: ps.now.windKmh,
          apparent_temperature_c: ps.now.feelsC != null ? ps.now.feelsC : undefined, dew_point_c: ps.now.dewC != null ? ps.now.dewC : undefined, utci_shade_c: ps.now.utciShadeC, utci_class: ps.now.utciClass, heat_level: ps.now.heatLevel,
          chain: ps.source.chain, source: ps.source.kind, note: 'the point state of this place this hour, the same value every page shows' };
          f.pointDays = (ps.days || []).map((d) => ({ date: d.date, tmax_c: d.tmaxC, tmin_c: d.tminC, gust_max_kmh: d.gustMaxKmh, rain_mm: d.rainMm, hours: d.hoursHeld, heat_level: d.heat && d.heat.level })); } } catch (_) {} }
      /* v91.17.283.12: no second path: when the point state does not answer, the AI says the value is not available (no point-engine fallback) */
    }
    /* v91.17.266 · a question for days ahead reads the 7-day point forecast at the place asked (the dashboard point, else the unit's own) */
    if (opts.daily && !f.disputed) { const pt = (point && Number.isFinite(+point.lat) && Number.isFinite(+point.lon)) ? { lat: +point.lat, lon: +point.lon } : (u.lat != null && u.lon != null ? { lat: +u.lat, lon: +u.lon } : null);
      if (pt) { try { f.dailyForecast = await pointForecast(pt.lat, pt.lon); } catch (e) { f.dailyForecastUnavailable = clientWhy(e); }
        try { const pd = await pointDaysAt(pt.lat, pt.lon); if (pd && pd.length) f.pointDays = pd; } catch (_) {} } }
    if (!f.forecast && !f.disputed && u.lat != null && u.lon != null && !f.dailyForecast) {
      try {
        f.liveForecast = await pointForecast(u.lat, u.lon);
        f.liveForecastNote = 'No national run holds this unit yet, so this is a direct point forecast at the unit centroid on the zone temperature basis' + (f.liveForecast && f.liveForecast.calibration ? ', with ' + f.liveForecast.calibration : ', with no station calibration') + ' and no per-unit verification applied. The centroid is the middle of the whole unit, which in mountain districts can sit well above or below the main town - name the town itself for a point at the settlement.';
      } catch (e) { f.liveForecastUnavailable = clientWhy(e); }
    }
    if (u.lat != null && u.lon != null) { const uh = urbanFacts(u.lat, u.lon); if (uh) f.urbanMorphology = uh; }
    { const dr = droughtFacts(u.unitId); if (dr) f.drought = dr; }
    /* v91.17.110 · the heat-stress climate of this place: how unusual a given UTCI is here (context, not the level) */
    try { const th = app.climatology && app.climatology.thresholds(u.unitId, new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10)); const UC = app.climatology && app.climatology.utciClim(); const uc = UC && UC.units && UC.units[u.unitId];
      if (th && th.u90 != null && uc) f.heatClimate = { note: 'daily maximum shade UTCI for this place on this date, 1996-2025; how unusual today is here. The heat level itself is the absolute UTCI scale.', medianC: th.u50, p90C: th.u90, p95C: th.u95,
        daysPerYearAtLevel: Object.fromEntries(UC.levels.map((w, i) => [w, uc.daysPerYear[i]])) }; } catch (_) {}
    try { const th = app.climatology && app.climatology.thresholds(u.unitId, new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10)); const UC = app.climatology && app.climatology.utciColdClim && app.climatology.utciColdClim(); const uc = UC && UC.units && UC.units[u.unitId];
      if (th && th.c10 != null && uc) f.coldClimate = { note: 'daily minimum shade UTCI for this place on this date, 1996-2025; how unusual tonight is here. The cold level itself is the absolute UTCI cold-stress scale.', medianC: th.c50, p10C: th.c10, p05C: th.c05,
        daysPerYearAtLevel: Object.fromEntries(UC.levels.map((w, i) => [w, uc.daysPerYear[i]])) }; } catch (_) {}   /* v91.17.111 */
    /* v91.17.106 · the levels the map shows for this tehsil, from the server engine (the same engine as the map) */
    /* v91.17.283 · WS4 · item 8 · read through served.mjs: the same function (and the same gate client rules) as the console and start
       page, so the AI quotes the served word, its product type, and "Not assessed" with the reason where no level is held */
    { const m = mapLevelsOf(u.unitId); if (m) f.mapLevels = m; }
    /* v91.17.101 · audit #78-#81 · the analyst reads the same served products the map paints, and what happened here before */
    try { const rc = app.rainChance && app.rainChance.unit(u.unitId); if (rc && rc.ready) f.rainChance = { days: rc.days.map(d => ({ date: d.date, forecastMm: d.fcMm, chancePct: { atLeast1mm: d.p['1'], atLeast10mm: d.p['10'], atLeast25mm: d.p['25'] } })), note: 'calibrated chance of a satellite-measured day total at or above the amount (trained 2024-25, tested on 2026); the 50 mm chance is not issued' }; } catch (_) {}
    try { const G = app.glof && app.glof.national && app.glof.national(false); const g = G && G.ok && G.units && G.units[u.unitId]; if (g && g.applicable) f.glof = { ...glofCtx(g), text: g.text || null, basis: g.basis || null }; } catch (_) {}
    try { const dm = damsOf(u.unitId); if (dm) f.damsUpstream = dm; } catch (_) {}
    try { const M = eventMemory(); const ev = M && M.units && M.units[u.unitId]; if (ev && ev.length) f.pastEvents = { events: ev.slice(0, 8).map(e => e.text), sources: M.sources, note: 'what happened here before (open or AGN records); use it to say how today compares with past events, never to predict a date' }; } catch (_) {}
    /* v91.17.42 · catchment wetness: the state half of the sponge, with its basis and refusal */
    try { const sg = app.report && app.report.suggestions && app.report.suggestions(u); if (sg) f.suggestions = sg; } catch (_) {}   /* v91.17.44 · S7 */
    if (INTERNAL()) try { const mn = app.report && app.report.metNotes && app.report.metNotes(u); if (mn) f.stationLakeNotes = { note: 'what the PMD mountain network measured about the model at places like this; quote the caveat when the question is about wind, rain days, humidity or the freezing level', items: mn }; } catch (_) {}   /* v91.17.45 */
    try { const h = app.hand && app.hand.of(u.unitId); if (h) f.floodplain = { basis: h.basis || h.why || null, floodplainShare: h.floodplainShare ?? null, where: h.where || null, note: 'HAND and TWI on GLO-90 at 180 m: where water spreads or collects, not a depth and not a probability; the where-rain-collects share is context and does not scale the flood score' }; } catch (_) {}   /* v91.17.44 */
    /* v91.17.112 · rain-triggered landslide likelihood vs an ordinary day (a calibrated ratio, not a probability) */
    try { const L = app.landslideOdds && app.landslideOdds.unit(u.unitId); if (L && L.ready) f.landslideRainTrigger = { note: LS_NOTE + ' (tested on recorded landslides 2007-2017, each year held out); in dry months the ordinary day carries very little risk; rain-triggered slides only: slides from snow or ice melt, thaw or earthquakes are not in this measure', days: L.days.filter(d => d.ratio != null).map(d => ({ date: d.date, observedTimesOrdinaryDay: d.observedRatio ?? null, modelClass: d.modelBand || null, rainDayMm: d.rainDayMm, rain3Mm: d.rain3Mm })) };   /* v283 INTEG: the monotone model reads the day's and the 3-day rain */ } catch (_) {}
    try { const w = app.wetness && (app.wetness.current ? app.wetness.current(u.unitId) : null); if (!w && app.wetness && app.wetness.staleNote && app.wetness.staleNote()) f.catchmentWetness = app.wetness.staleNote();   /* v91.17.172 · audit E-4: an old soil-water run is named stale, not given as now */
      if (w) f.catchmentWetness = w.notDefined ? { notDefined: true, why: w.why } : { at: w.at, basis: w.basisText, rootZoneWetness: w.now.ws, state: w.now.state, storageRemainingMm: w.now.awsMm, in72h: w.plus72h ? { wetness: w.plus72h.ws, state: w.plus72h.state } : null, trend: w.trend, rainPast24Mm: w.rain.past24Mm, rainNext72Mm: w.rain.next72Mm, staticSponge: w.ssc, effectiveSponge: w.effectiveSponge, excessProxyMm: w.excessProxyMm, sensitivity: w.sensitivity, note: 'a state read from the model soil-moisture field against its own yearly range here; no soil-moisture gauge verifies it; sensitivity compares storage with forecast rain and is not a flood probability' }; } catch (_) {}
      try { const mr = measuredRain24(app.dataDir, u.lat, u.lon, u.elevM ?? null); if (mr && f.catchmentWetness && !f.catchmentWetness.notDefined) f.catchmentWetness.rainPast24Measured = mr; } catch (_) {}   /* v91.17.283.44 · OFF unless NIGRAAN_EWS_RAIN24=1 */
    /* v91.17.283.49 · 1.0.10 item 1 · the place summary every surface prints (served.mjs / placesummary.mjs): weather hazards plus the served
       air quality, so an answer never calls a place all-clear while its air is unhealthy */
    try { const SU = servedUnit(app, u.unitId, false); if (SU && SU.summary) f.placeSummary = { state: SU.summary.state, raised: SU.summary.raised, headline: SU.summary.headline, air: SU.summary.air, rule: SU.summary.rule }; } catch (_) {}
    return f;
  }

  /* ══ v91.17.13 · A HAZARD QUESTION WAS ANSWERED WITH THE WEATHER ════════
     MEASURED on sixteen questions put to this endpoint: six named a hazard and
     got back a plain forecast with the hazard never mentioned -

       "flood risk in Sukkur"                 -> temperature and rain, no flood
       "is there a GLOF risk in Chitral"      -> temperature and rain, no GLOF
       "landslide risk in Hunza"              -> temperature and rain, no slide
       "is a cyclone coming to Gwadar"        -> temperature and wind, no cyclone
       "what is the seismic hazard in Quetta" -> temperature and rain, no seismic
       "flood risk in Nowshera and Charsadda" -> temperature and rain, no flood

     The place resolved correctly every time. What was missing is that the
     `want` flags below know about temperature, rain, wind, humidity, air,
     outlook, season and sun, and know nothing about a hazard - so every one of
     these fell into the catch-all and printed the forecast. That is the
     "answer was about something else" failure, at its root.

     The scores themselves are NOT computed here, and deliberately: the hazard
     engine lives inside the sealed artefact, and this backend already refuses
     to publish a second one (see national.mjs, SERVER_ENGINE_NOT_DEPLOYED - a
     second implementation that disagrees with the first is the failure this
     product exists to prevent). So the page sends its own verdict with the
     question, in `hazardContext`, and this module renders what the engine
     said. When the verdict is absent - a direct API call, or a page that did
     not attach one - the answer SAYS the hazard was asked about and not
     answered, and says why. It never prints the forecast as though that were
     the answer. */
  const HAZARD_WORDS = [
    ['flood',      /\b(flood|flooding|inundat|deluge|riverine|pluvial|urban flooding|flood (?:level|alert|warning|class)s?)\b/],
    ['glof',       /\b(glof|glacial lake|lake outburst|glacier burst|glacial flood)\b/],
    ['landslide',  /\b(landslide|landslip|slope failure|rockfall|mudslide|debris flow)\b/],
    ['seismic',    /\b(seismic|earthquake|quake|tremor|pga|fault)\b/],
    ['cyclone',    /\b(cyclone|hurricane|typhoon|storm surge|tropical storm)\b/],
    ['heat',       /\b(heat ?wave|heatwave|heat stress|heat hazard|heat risk|heat (?:level|alert|warning|class)s?|utci|thermal stress)\b/],   /* v91.17.172 · audit O-8 · 'heat level' / alert / UTCI are hazard questions */
    ['cold',       /\b(cold ?wave|coldwave|cold spell|frost risk|cold hazard|cold stress|cold (?:level|alert|warning|class)s?|frost (?:level|alert|warning)s?)\b/],
    ['wind',       /\b(wind hazard|wind risk|gale|windstorm|(?:wind|gust) (?:level|alert|warning|class)s?)\b/],
    ['drought',    /\b(drought|dry spell|water stress|rainfall deficit)\b/],
  ];
  const HAZARD_LABEL = { flood: 'flood', glof: 'glacial lake outburst flood', landslide: 'landslide',
    seismic: 'seismic', cyclone: 'cyclone', heat: 'heat', cold: 'cold', wind: 'wind', drought: 'drought' };
  /* the layer ids the page's engine uses, for the hazards whose id differs */
  const HAZARD_LAYERS = { flood: ['flood', 'flood_riverine', 'flood_pluvial'], glof: ['glof'],
    landslide: ['landslide'], seismic: ['seismic'], cyclone: ['cyclone'],
    heat: ['heat'], cold: ['cold'], wind: ['wind'], drought: ['drought'] };
  const hazardsAsked = (text) => HAZARD_WORDS.filter(([, re]) => re.test(String(text || '').toLowerCase())).map(([k]) => k);
  /* the page's verdicts, taken as given and never recomputed or adjusted */
  function normaliseHazardContext(hc) {
    if (!Array.isArray(hc)) return [];
    return hc.slice(0, 40).map((x) => x && typeof x === 'object' ? {
      unit: String(x.unit || x.unitKey || x.name || '').slice(0, 80),
      hazard: String(x.hazard || x.layer || '').slice(0, 40),
      score: (typeof x.score === 'number' && isFinite(x.score)) ? x.score : null,
      publishedScore: (typeof x.publishedScore === 'number' && isFinite(x.publishedScore)) ? x.publishedScore : null,
      categorical: x.categorical === true,
      band: x.band == null ? null : String(x.band).slice(0, 80),
      /* v91.17.36 · AUDIT R-10 · the operational class (Act/Watch/Monitor/Clear) beside the display band */
      /* v91.17.68 · the assistant never derives a class from a score: the page demotes on coverage and this fallback did not (audit C9) */
      verdictClass: x.verdictClass == null ? null : String(x.verdictClass).slice(0, 12),
      verdictClassWhy: x.verdictClass == null ? 'class not issued by the page' : null,
      notApplicable: x.notApplicable === true || x.applicable === false,
      why: x.why == null ? null : String(x.why).slice(0, 400),
      basis: x.basis == null ? null : String(x.basis).slice(0, 400),
      day: x.day == null ? null : String(x.day).slice(0, 40),
    } : null).filter((x) => x && x.unit && x.hazard);
  }

  /* ══ v91.17.75 · P · B1 · A NATIONAL QUESTION GETS A NATIONAL ANSWER ═════════════════════════════════
     MEASURED (CEO, live product): "drought condition in paksitan" was answered about Gilgit - the dashboard selection - with
     'The dashboard indicates a "Clear" condition for Gilgit, but the risk band is "Screening not loaded" ... No drought-specific
     information is available'. Three faults: (1) nothing recognised "Pakistan" (let alone "paksitan") as the whole country, so
     the pack was the selected unit's; (2) the pack carried the page's screen text verbatim: "Screening not loaded" is the
     context() fallback when #aiBand is empty, which it is whenever the Predictions hazard has no 0-100 score (GLOF and every
     categorical hazard: aiBand(null) -> band null), and "Clear" is the sky word of the conditions card, read by the model as
     the retired GLOF class; (3) the national drought table on this server was never consulted.
     Now: a national (or province) question gets `national` - per hazard the tehsil count on each level of the one hazard
     scale (data/hazard-scale.json: Normal, Low, Moderate, High, Severe; "cannot occur here" and "index not defined" apart),
     the worst ten tehsils with their level, and the date. Drought (the server's combined class, arid units as index not
     defined), GLOF (the lake-routed class table) and the river reaches are read HERE from the server's own national data;
     the weather-screen hazards are scored only by the page's engine, so the page attaches them (`nationalContext`, asked for
     with `needNational`, as `needHazard` works for one unit). The dashboard selection is withheld from a national pack. */
  let HS = null, HSmt = 0;
  function hazardScale() {
    try { const f = join(app.dataDir || join(process.cwd(), 'data'), 'hazard-scale.json'); if (!existsSync(f)) return HS;
      const mt = statSync(f).mtimeMs; if (HS && mt === HSmt) return HS; HS = JSON.parse(readFileSync(f, 'utf8')); HSmt = mt; } catch (_) {}
    return HS;
  }
  const SCALE_WORDS = () => { const S = hazardScale(); return (S && S.levels) || ['Normal', 'Low', 'Moderate', 'High', 'Severe']; };
  function levelOfClass(c) { const S = hazardScale(); if (!S) return null; const L = S.operationalLadder || {}; return c == null ? (L.none || null) : (L[String(c)] || null); }
  /* v91.17.157 · audit · an engine class (drought, river reach, GLOF) is placed as the map and the site screen place it: the
     operational ladder, with the engine's 'Low' (no signal) read as Normal (hazard-scale.json levelFunction.classOnly). The
     drought level was placed by the score through the screening cuts, so score 50 (class Watch) read Moderate here and High on the map. */
  function levelOfEngineClass(c) { return c === 'Low' ? (SCALE_WORDS()[0] || 'Normal') : levelOfClass(c); }
  /* v91.17.221 · audit D-21 · the one GLOF class -> level rule, as on the map (map_ui catLevel, F7) and in data/hazard-scale.json: Low and
     the standing Monitor class read Normal (glofStandingLevel), Watch High, Act Severe. Two fact builders printed the raw class
     ('Monitor', 'Watch') as the level. */
  /* v91.17.283.24 · audit leftover · ONE GLOF table: data/hazard-scale.json glofLadder (glof.mjs words, hazsci.mjs issued level); the second
     home (glofStandingLevel for Monitor + the operational ladder for the rest) is removed. A class without a row has no level (never a guess). */
  function glofLevel(c) { const L = (hazardScale() || {}).glofLadder; return L ? (L[c == null ? 'none' : String(c)] || null) : null; }
  /* v91.17.283.47 · NIGRAAN 1.0.8 item 1 · no GLOF level in any answer: the lakes upstream are site context (susceptibility, not a
     warning); the AI quotes that context and says that no outburst level is issued (NIGRAAN_GLOF_LEVEL_WORDS=1 = 1.0.7) */
  const GLOF_NO_LEVEL = 'no glacial-lake outburst level is issued (no outburst trigger has passed its test); the glacial lakes upstream are site context: lake susceptibility, not a warning level';
  const glofCtx = (g) => process.env.NIGRAAN_GLOF_LEVEL_WORDS === '1' ? { level: glofLevel(g.class), engineClass: g.class } : { level: null, context: 'susceptibility', why: GLOF_NO_LEVEL };
  /* "Pakistan" with a typo or two: paksitan, pakstan, pakistn, pakisatn (optimal string alignment distance <= 2) */
  const osa = editDistance;   /* v91.17.266 · one edit-distance function (module level) */
  const isPakistanWord = (w) => { w = String(w || '').toLowerCase(); return w === 'pakistan' || (w.length >= 6 && w.length <= 10 && /^pa?k/.test(w) && osa(w, 'pakistan') <= 2); };
  const NATIONAL_PHRASE = /\b(national(?:ly)?|nation-?wide|country-?wide|across (?:the )?country|all over (?:the )?country|(?:the )?(?:whole|entire) country|all (?:of )?the country|every (?:tehsil|district|province)|which (?:districts|tehsils)|most exposed|priorit(?:y|ies)|needs? action)\b/i;   /* v91.17.172 · audit O-8 · ranking questions are national */
  const PROVINCE_WORDS = [
    ['Punjab', /\bpunjab\b/i], ['Sindh', /\bsindh?\b/i], ['Khyber Pakhtunkhwa', /\b(khyber[ -]?pakh?tunkhwa|kpk|kp)\b/i],
    ['Balochistan', /\bbal[ou]chistan\b/i], ['Gilgit Baltistan', /\bgilgit[ -]baltistan\b|\bGB\b/i], ['Azad Kashmir', /\b(azad (?:jammu (?:and |& )?)?kashmir|ajk)\b/i],
    ['Federal Capital', /\b(islamabad capital territory|ICT)\b/],
  ];
  /* null, or { level: 'national' | 'province', province, label } */
  function nationalScope(prompt) {
    const t = String(prompt || '');
    for (const [prov, re] of PROVINCE_WORDS) if (re.test(t) && (app.units.tehsil || []).some((u) => u.province === prov)) return { level: 'province', province: prov, label: prov };
    const words = t.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (NATIONAL_PHRASE.test(t) || words.some(isPakistanWord)) return { level: 'national', province: null, label: 'Pakistan' };
    return null;
  }
  /* the weather-screen hazards the page's engine scores (map layer ids); drought and GLOF are read on this server */
  /* v91.17.283.35 · owner "one server value": GLOF and drought national counts are the served levels too (their own tallies here were a second count) */
  const PAGE_NATIONAL = { flood: 'flood', heat: 'heat', cold: 'cold', wind: 'wind', landslide: 'landslide', seismic: 'seismic', cyclone: 'cyclone', rain: 'rain_hz', glof: 'glof', drought: 'drought' };
  // v91.17.270: one client name per hazard
  const NAT_LABEL = { flood: 'Flood', heat: 'Heat stress', cold: 'Cold stress (UTCI)', wind: 'Wind and gusts', landslide: 'Landslide', seismic: 'Earthquake (seismic zone)', cyclone: 'Cyclone', rain_hz: 'Heavy rain', drought: 'Drought', glof: 'Glacial lake outburst flood (GLOF)' };
  for (const [k, v] of Object.entries(LAYER_NAME)) if (k in NAT_LABEL) NAT_LABEL[k] = v;   /* v91.17.283 · WS4 · D17 · one naming source: the engine's */
  const ALL_NATIONAL = ['drought', 'glof', 'flood', 'heat', 'cold', 'wind', 'landslide', 'seismic', 'cyclone', 'rain'];
  /* a national question names the hazard with a plain noun ("national heat", "rain across the country"), which the unit
     question's hazard words (built to tell "heat" the hazard from "heat" the temperature) do not all catch */
  const NAT_HAZARD_NOUNS = [['drought', /\b(drought|dry spell|water stress)\b/i], ['glof', /\b(glof|glacial lakes?|lake outbursts?)\b/i], ['flood', /\bfloods?|flooding\b/i],
    ['heat', /\b(heat|heatwaves?|hot)\b/i], ['cold', /\b(cold|frost|cold ?waves?)\b/i], ['wind', /\b(wind|winds|gales?|windstorms?)\b/i], ['landslide', /\b(landslides?|landslips?)\b/i],
    ['seismic', /\b(seismic|earthquakes?|quakes?)\b/i], ['cyclone', /\b(cyclones?|storm surge)\b/i], ['rain', /\b(rain|rainfall|heavy rain|downpours?)\b/i]];
  const nationalHazards = (prompt, asked) => { const t = String(prompt || ''); const out = (asked || []).slice(); for (const [k, re] of NAT_HAZARD_NOUNS) if (re.test(t) && !out.includes(k)) out.push(k); return out; };
  /* the page's national levels, taken as given; only the shape is checked */
  function normaliseNational(nc) {
    if (!nc || typeof nc !== 'object' || !nc.hazards || typeof nc.hazards !== 'object') return null;
    const W = SCALE_WORDS(), okLayer = new Set(Object.values(PAGE_NATIONAL)); const out = { day: nc.day == null ? null : String(nc.day).slice(0, 60), lead: Number.isInteger(nc.lead) ? nc.lead : null, hazards: {} };
    const int = (v) => (Number.isInteger(v) && v >= 0 && v <= 1000) ? v : 0;
    for (const [hz, h] of Object.entries(nc.hazards).slice(0, 16)) {
      if (!okLayer.has(hz) || !h || typeof h !== 'object') continue;
      const counts = {}; let tot = 0; for (const w of W) { counts[w] = int(h.counts && h.counts[w]); tot += counts[w]; }
      if (tot + int(h.cannotOccur) + int(h.noData) > 700) continue;
      out.hazards[hz] = { levels: W.map((w) => ({ level: w, tehsils: counts[w] })), cannotOccur: int(h.cannotOccur), noData: int(h.noData),
        worst: (Array.isArray(h.worst) ? h.worst : []).slice(0, 10).filter((x) => x && typeof x.tehsil === 'string' && W.includes(x.level))
          .map((x) => ({ tehsil: String(x.tehsil).slice(0, 80), district: x.district ? String(x.district).slice(0, 80) : null, level: x.level, engine: x.engine ? String(x.engine).slice(0, 80) : null })) };
    }
    /* v91.17.76 · A · B-38 · a week question: the page's worst level per tehsil over its forecast days */
    if (nc.week && typeof nc.week === 'object' && nc.week.hazards && typeof nc.week.hazards === 'object') {
      const wk = { window: null, hazards: {} };
      const w0 = nc.week.window; if (w0 && typeof w0 === 'object') wk.window = { from: String(w0.from || '').slice(0, 10), to: String(w0.to || '').slice(0, 10), days: Number.isInteger(w0.days) && w0.days >= 0 && w0.days <= 16 ? w0.days : null, missing: Array.isArray(w0.missing) ? w0.missing.slice(0, 16).map((x) => String(x).slice(0, 10)) : [] };
      for (const [hz, h] of Object.entries(nc.week.hazards).slice(0, 16)) {
        if (!okLayer.has(hz) || !h || typeof h !== 'object') continue;
        const counts = {}; let tot = 0; for (const w of W) { counts[w] = int(h.counts && h.counts[w]); tot += counts[w]; }
        if (tot + int(h.cannotOccur) + int(h.noData) > 700) continue;
        wk.hazards[hz] = { levels: W.map((w) => ({ level: w, tehsils: counts[w] })), cannotOccur: int(h.cannotOccur), noData: int(h.noData),
          worst: (Array.isArray(h.worst) ? h.worst : []).slice(0, 10).filter((x) => x && typeof x.tehsil === 'string' && W.includes(x.level))
            .map((x) => ({ tehsil: String(x.tehsil).slice(0, 80), district: x.district ? String(x.district).slice(0, 80) : null, level: x.level, peakDay: x.peakDay ? String(x.peakDay).slice(0, 10) : null, engine: x.engine ? String(x.engine).slice(0, 80) : null })) };
      }
      if (Object.keys(wk.hazards).length) out.week = wk;
    }
    return (Object.keys(out.hazards).length || out.week) ? out : null;
  }
  /* ══ v91.17.76 · A · B-38 · "THIS WEEK" IS A WEEK, IN PAKISTAN TIME ═══════════════════════════════════════════════
     MEASURED (UX audit B-38): "What is the flood risk in Pakistan this week?" was answered with the levels at one lead and
     stamped "as of 2026-09-26 20:36 UTC". A week question now reads every forecast day the engines hold: the river reaches
     day by day from the flood ensemble (the worst class each reach reaches in the window, with its date), and the page's
     engine day by day for the weather-screen hazards (the worst level each tehsil reaches, with its day). Dates are Pakistan
     days, times PKT. The answer says which days the window covers; days no engine holds are named, not invented. */
  /* v91.17.226 · audit D-18 · the level is the one data/river-level-scale.json gives (served per reach by server/api/flood.mjs, the
     same knots the map paints with); v91.17.157 had moved this text to "High = 5-year" to match the generic Watch -> High mapping,
     which the map never used */
  /* v91.17.283.35 · audit A2: the meaning text names the same rule as the issued cell (hazsci.mjs riverCell): the official class first, unreduced */
  const RIVER_MEANING = 'river levels, one rule on every surface: where the river gauge of the tehsil\'s reach has an official class (measured today, or the last measurement carried forward up to 3 days with its tested persistence skill, or the official outlook), that class is the level (Low = Low, Medium = Moderate, High = High, Very High or Exceptional = Severe), never reduced; otherwise the reach\'s model flow is scored against the reach\'s own 1997-onward record. A tehsil off the floodplain (no ground within about 10 m above a major river) cannot have river flooding; the share of the tehsil on the floodplain is a separate fact, not part of the level. Model ladder (tested against the 2024-25 flood bulletins): Normal = below the model\'s 5-year flow, including flows that are high for the time of year, because at such flows the river most often stayed under the official Low flood limit (no flood signal); Moderate = the 5-year model flow or more, when the river most often reached Medium flood; High = the 20-year model flow or more (not yet tested: no 20-year days in the record); Severe = 1.5 times the 20-year flow (untested: always say "untested" with the Severe or High word). A flow between the 2- and 5-year flows stays Normal but is a watch: a share of such days reached the official Low flood limit (the row\'s note gives it). The band says 5- to 10-, 10- to 20- or 20-year or rarer. Never call a flow that is only high for the time of year a flood.';
  const WEEK_RE = /\b(this|next|coming|the)\s+(week|7\s*days|seven\s+days)\b|\bweek(?:ly)?\b|\b(?:7|seven)[- ]?days?\b/i;
  const pktNow = () => new Date(Date.now() + 5 * 3600e3);
  const pktDate = (d) => { const x = d || pktNow(); return x.toISOString().slice(0, 10); };
  const pktStamp = () => { const x = pktNow(); return Number(x.toISOString().slice(8, 10)) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()] + ' ' + x.toISOString().slice(11, 16) + ' PKT'; };
  const dayWords = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(iso || ''); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + Number(m[3]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]; };
  /* v91.17.283 · WS4 · audit S7 · the drought index order is the engine's (data/drought-class.json indexOrder), never typed here */
  function droughtIndexOrder() { try { const T = JSON.parse(readFileSync(join(app.dataDir || join(process.cwd(), 'data'), 'drought-class.json'), 'utf8')); if (Array.isArray(T.indexOrder) && T.indexOrder.length) return T.indexOrder.join(', else '); } catch (_) {} return 'the first index defined for the tehsil'; }
  function servedNationalFor(layer, scope, week) {
    const W = SCALE_WORDS(); const days = week ? [0, 1, 2, 3] : [0];
    const per = []; for (const d of days) { let r = null; try { r = servedNational(app, layer, d, false); } catch (_) { r = null; } if (r && r.ready) per.push(r); else if (r && r.hidden) return { hidden: true, why: r.why }; }
    if (!per.length) return null;
    const inScope = new Set((app.units.tehsil || []).filter((u) => !u.disputed && (!scope.province || u.province === scope.province)).map((u) => u.unitId));
    const best = new Map(); for (const r of per) for (const row of r.rows) { if (!inScope.has(row.unit)) continue; const b = best.get(row.unit); if (!b || row.i > b.i) best.set(row.unit, { ...row, date: r.date }); }
    const c = {}; for (const w of W) c[w] = 0; for (const v of best.values()) c[v.level] = (c[v.level] || 0) + 1;
    const unitName = (uid) => { const u = (app.units.tehsil || []).find((x) => x.unitId === uid); return u ? { tehsil: u.name, district: u.district, province: u.province } : { tehsil: uid }; };
    const worst = [...best.values()].filter((v) => v.level !== W[0]).sort((a, b) => b.i - a.i).slice(0, 10).map((v) => ({ ...unitName(v.unit), level: v.level, ...(week ? { date: v.date } : {}), productType: levelTag(app, layer, v.level).productType }));
    const r0 = per[0];
    return { source: 'the served hazard levels (the server engine, the same levels the console and start page show)' + (r0.basis ? '; ' + r0.basis : ''), asOf: r0.date, stale: r0.stale || undefined,
      productType: r0.productType, ...(r0.levelRules ? { byLevel: r0.levelRules } : {}), levels: W.map((w) => ({ level: w, tehsils: c[w] })),
      notAssessed: { tehsils: inScope.size - best.size, why: 'no level in the served run; each tehsil\'s state and reason is in notAssessedByState' }, ...(r0.notAssessed ? { notAssessedByState: r0.notAssessed } : {}),
      worst, worstNote: worst.length ? null : 'no tehsil is above ' + W[0], ...(week ? { window: { from: per[0].date, to: per[per.length - 1].date, days: per.length } } : {}) };
  }
  function nationalFacts(scope, asked, nationalContext, week) {
    const S = hazardScale() || {}; const W = SCALE_WORDS(); const SEP = S.separateStates || {};
    const inScope = (u) => !u.disputed && (!scope.province || u.province === scope.province);
    const units = (app.units.tehsil || []).filter(inScope);
    const disputed = scope.province ? 0 : (app.units.tehsil || []).filter((u) => u.disputed).length;
    const want = (asked && asked.length ? asked : ALL_NATIONAL).filter((h, i, a) => a.indexOf(h) === i);
    const out = { scope: scope.label, level: scope.level, tehsils: units.length, disputedNotScored: disputed || undefined,
      scale: W.join(', '), hazards: {}, asOfPkt: pktStamp(), week: week ? { from: pktDate(), days: 7 } : undefined,
      reading: 'Counts of tehsils on each level of the one hazard scale (' + W.join(', ') + '). "Cannot occur here" and "index not defined" are not levels. The worst list is ordered by level, then by the engine\'s own severity within the hazard.' };
    const blankCounts = () => { const c = {}; for (const w of W) c[w] = 0; return c; };
    if (want.includes('drought')) {
      let n = null; try { n = app.climatology && app.climatology.droughtNational ? app.climatology.droughtNational() : null; } catch (_) { n = null; }
      if (!n || !n.ready || !n.spi) out.hazards.drought = { available: false, why: 'the national drought table is not built on this server yet' };
      else {
        const c = blankCounts(); let notDefined = 0, noData = 0; const rows = [];
        for (const u of units) {
          const t = n.spi[u.unitId], d = t && t.drought;
          if (!d) { noData++; continue; }
          if (d.applicable === false) { notDefined++; continue; }
          const L = d.class ? levelOfEngineClass(d.class) : null; if (!L) { noData++; continue; }
          c[L]++;
          const iv = (x) => x && x.value != null ? x.value : null;
          rows.push({ tehsil: u.name, district: u.district, province: u.province, level: L, droughtClass: d.class || null, score: d.score,
                      index: d.index || null, indexValue: d.index === 'SPEI-90' ? iv(t.spei90) : d.index === 'SPI-90' ? iv(t.spi90) : d.index === 'SPEI-30' ? iv(t.spei30) : d.index === 'SPI-30' ? iv(t.spi30) : null,
                      soilPercentile: t.smRoot && t.smRoot.percentile != null ? t.smRoot.percentile : null });
        }
        const worst = rows.filter((r) => r.level !== W[0]).sort((a, b) => W.indexOf(b.level) - W.indexOf(a.level) || b.score - a.score || (a.indexValue == null ? 9 : a.indexValue) - (b.indexValue == null ? 9 : b.indexValue)).slice(0, 10).map(({ score, ...r }) => r);
        out.hazards.drought = { source: 'NIGRAAN drought engine on this server: the less severe of the rain / water-balance index (' + droughtIndexOrder() + '; each row names the index it used) and the root-zone soil-moisture percentile, after the US Drought Monitor convergence of evidence',
          asOf: n.asOf || null, levels: W.map((w) => ({ level: w, tehsils: c[w] })),
          indexNotDefined: { tehsils: notDefined, why: SEP.indexNotDefined || 'Drought index not defined (arid climate)' }, noData: noData || undefined,
          worst, worstNote: worst.length ? null : 'no tehsil is above ' + W[0], ...(week ? { standing: 'a slow index (rain and soil over 30 to 90 days): the level holds through the week' } : {}) };
      }
    }
    if (want.includes('glof')) {
      let g = null; try { g = app.glof && app.glof.national ? app.glof.national() : null; } catch (_) { g = null; }
      if (!g || !g.ok || !g.units) out.hazards.glof = { available: false, why: 'the national glacial-lake table is not built on this server yet' };
      else {
        const c = blankCounts(); let cannot = 0; const rows = [];
        for (const u of units) {
          const r = g.units[u.unitId];
          if (!r || r.applicable === false || !r.class) { cannot++; continue; }
          /* v91.17.153 · GLOF Monitor is standing lake susceptibility with no precursor, not a forecast: the same rule as the map (F7) */
          if (process.env.NIGRAAN_GLOF_LEVEL_WORDS !== '1') { rows.push({ tehsil: u.name, district: u.district, province: u.province, level: null, priorityLakes: r.priority != null ? r.priority : null, lakesGrowing: r.expanding != null ? r.expanding : null, index: 0 }); continue; }   /* v283.47 item 1: context, no level */
          const L = glofLevel(r.class); if (!L) { cannot++; continue; }
          c[L]++; rows.push({ tehsil: u.name, district: u.district, province: u.province, level: L, engineLevel: r.class === 'Monitor' ? 'Monitor (standing susceptibility, not a forecast)' : r.class, priorityLakes: r.priority != null ? r.priority : null, lakesGrowing: r.expanding != null ? r.expanding : null, index: r.index != null ? r.index : 0 });
        }
        const worst = rows.sort((a, b) => W.indexOf(b.level) - W.indexOf(a.level) || b.index - a.index).slice(0, 10).map(({ index, ...r }) => r);
        if (process.env.NIGRAAN_GLOF_LEVEL_WORDS !== '1') out.hazards.glof = { source: 'NIGRAAN glacial-lake context on this server: mapped glacial lakes routed downstream to each tehsil', asOf: g.builtAt ? String(g.builtAt).slice(0, 10) : null,
          noLevel: GLOF_NO_LEVEL, tehsilsWithLakesUpstream: rows.length, cannotOccur: { tehsils: cannot, why: SEP.cannotOccur || 'Cannot occur here' + ': no glacial lake upstream' } };
        else out.hazards.glof = { source: 'NIGRAAN glacial-lake level on this server: mapped glacial lakes routed downstream to each tehsil', asOf: g.builtAt ? String(g.builtAt).slice(0, 10) : null,
          levels: W.map((w) => ({ level: w, tehsils: c[w] })), cannotOccur: { tehsils: cannot, why: SEP.cannotOccur || 'Cannot occur here' + ': no glacial lake upstream' }, worst, ...(week ? { standing: 'a standing level from the mapped lakes: it holds through the week unless a lake signal is observed' } : {}) };
      }
    }
    if (want.includes('flood')) {
      let f = null; try { f = app.flood && app.flood.national ? app.flood.national(0) : null; } catch (_) { f = null; }
      if (week && f && f.ready && Array.isArray(f.rows)) {
        /* the worst class each reach reaches over the forecast days the ensemble holds (up to 7), with the date */
        const RK = { Low: 0, Monitor: 1, Watch: 2, Act: 3 }, rk = (r) => (r.levelIndex != null ? 10 + r.levelIndex : (RK[r.class] || 0)); const nD = Math.min(7, Array.isArray(f.days) ? f.days.length : 1);
        const best = new Map(); const dates = [];
        for (let d = 0; d < nD; d++) { let g = null; try { g = d ? app.flood.national(d) : f; } catch (_) { g = null; } if (!g || !g.ready) continue; if (g.date) dates.push(g.date);
          for (const r of g.rows) { if (scope.province && r.province !== scope.province) continue; const k = r.id || r.name; const b = best.get(k); if (!b || rk(r) > rk(b)) best.set(k, { ...r, peakDate: r.date || g.date }); } }
        const rows = [...best.values()]; const byClass = {}; for (const r of rows) byClass[r.class] = (byClass[r.class] || 0) + 1;
        const byLevel = {}; for (const r of rows) if (r.level) byLevel[r.level] = (byLevel[r.level] || 0) + 1;
        out.riverReaches = { source: 'river class per reach from the global flood ensemble: how rare the forecast flow is for the date at that reach; the worst class each reach reaches in the window', window: dates.length ? { from: dates[0], to: dates[dates.length - 1], days: dates.length } : null,
          date: dates[0] || f.date || null, reaches: rows.length, byLevel: Object.entries(byLevel).map(([k, v]) => ({ level: k, reaches: v })),
          aboveNormal: rows.filter((r) => r.level ? r.level !== 'Normal' : (r.class && r.class !== 'Low')).sort((a, b) => rk(b) - rk(a)).slice(0, 10).map((r) => ({ reach: r.name, river: r.river, level: r.level || levelOfEngineClass(r.class), band: r.band || null, peakDate: r.peakDate, meaning: r.word || null, ...(r.levelNote ? { note: r.levelNote } : {}), ...(r.untested ? { untested: true } : {}) })),
          meaning: RIVER_MEANING };
        f = null;
      }
      if (f && f.ready && Array.isArray(f.rows)) {
        const rows = f.rows.filter((r) => !scope.province || r.province === scope.province);
        const byLevel = {}; for (const r of rows) if (r.level) byLevel[r.level] = (byLevel[r.level] || 0) + 1;
        out.riverReaches = { source: 'river level per reach from the global flood ensemble: how rare the forecast flow is for the date at that reach', date: f.date || null, reaches: rows.length,
          byLevel: Object.entries(byLevel).map(([k, v]) => ({ level: k, reaches: v })),
          aboveNormal: rows.filter((r) => r.level ? r.level !== 'Normal' : (r.class && r.class !== 'Low')).slice(0, 10).map((r) => ({ reach: r.name, river: r.river, level: r.level || levelOfEngineClass(r.class), band: r.band || null, meaning: r.word || null, ...(r.levelNote ? { note: r.levelNote } : {}), ...(r.untested ? { untested: true } : {}) })),
          meaning: RIVER_MEANING };
      }
    }
    const pn = normaliseNational(nationalContext);
    const awaiting = [];
    for (const h of want) {
      const layer = PAGE_NATIONAL[h]; if (!layer) continue;
      /* v91.17.283 · WS4 · item 8 · the national counts come from the served levels (served.mjs: the engine's record with the gate's client
         rules) when the server engine holds the layer; the page's attached counts are the fallback for a layer the engine does not derive */
      const SN = servedNationalFor(layer, scope, week);
      if (SN) { out.hazards[layer] = SN; continue; }
      const p = pn && ((week && pn.week) ? pn.week.hazards[layer] : pn.hazards[layer]);
      if (p && week && pn.week) out.hazards[layer] = { source: 'the hazard engine of the dashboard page, every tehsil on every forecast day it holds; the worst level each tehsil reaches in the window', asOf: pn.day || null, window: pn.week.window || null, ...p, cannotOccur: { tehsils: p.cannotOccur, why: 'not assessed (outside method range)' } };
      else if (p && !week) out.hazards[layer] = { source: 'the hazard engine of the dashboard page, every tehsil at the ' + (pn.lead || 24) + ' h lead', asOf: pn.day || null, ...p, cannotOccur: { tehsils: p.cannotOccur, why: 'not assessed (outside method range)' } };
      else awaiting.push(layer);
    }
    if (awaiting.length) out.awaitingPage = awaiting;
    if (week && awaiting.length) out.awaitingWeek = true;
    out.order = want.map((h) => PAGE_NATIONAL[h] || h).filter((k) => out.hazards[k]);
    return out;
  }
  /* the page's screen text, cleaned before it reaches a model: a stale fallback is dropped, a retired word becomes its level */
  function sanitizeDashboard(ctx) {
    if (!ctx || typeof ctx !== 'object') return {};
    const S = hazardScale() || {}; const RW = S.retiredWords || { Minimal: 'Normal', minimal: 'Normal' };
    const o = {};
    for (const [k, v] of Object.entries(ctx)) {
      if (typeof v === 'string' && /screening not loaded|screening layer|not available for this location|^\s*—?\s*$/i.test(v) && /risk|band|score|driver/i.test(k)) continue;
      /* the sky word of the conditions card ("Clear", "Mainly clear") is not a hazard class; "clear" is the retired GLOF word */
      if (k === 'condition' && typeof v === 'string') { o.skyNow = v.replace(/\bclear\b/gi, (m) => m[0] === 'C' ? 'Cloudless' : 'cloudless') + ' (the sky, not a hazard level)'; continue; }
      o[k] = typeof v === 'string' ? v.replace(/\b(Minimal|minimal)\b/g, (m) => RW[m] || 'Normal') : v;
    }
    if (o.riskScore === '—') delete o.riskScore;
    return o;
  }

  /* ══ v91.17.266 · THE DASHBOARD PLACE ANSWERS A QUESTION THAT NAMES NO PLACE ══════════════════════════════════════════════════
     MEASURED: "weather" and "7 day forecast" with I-8 selected answered "I could not find a place name": the page sends the selected
     place as context.location ("I-8 / Islamabad") and context.point {lat, lon}, and only a location that IS a tehsil name was used.
     Now the place is context.place {name, lat, lon} when the page sends it (v266), else context.location + context.point; a name that
     is no tehsil is read through its point (the tehsil holding it, unitAtPoint), and the answer is labelled with the dashboard name. */
  function dashboardPlace(ctx) {
    if (!ctx || typeof ctx !== 'object') return null;
    const P = ctx.place && typeof ctx.place === 'object' ? ctx.place : null;
    const fin = (o) => o && Number.isFinite(+o.lat) && Number.isFinite(+o.lon) && Math.abs(+o.lat) <= 90 && Math.abs(+o.lon) <= 180 ? { lat: +o.lat, lon: +o.lon } : null;
    const name = String((P && P.name) || ctx.location || '').split(/[\/·]/)[0].trim().slice(0, 80) || null;
    const pt = fin(P) || fin(ctx.point);
    return name || pt ? { name, ...(pt || {}) } : null;
  }
  async function grounding(context, prompt, hazardContext, nationalContext) {
    const scope = nationalScope(prompt);
    const facts = scope ? {} : { dashboard: sanitizeDashboard(context) };
    if (ACCURACY_Q.test(String(prompt || ''))) { const ml = evidenceLines(app.dataDir); if (ml.length) facts.measuredSkill = ml; }   /* v91.17.283 · WS4 */
    { const da = daysAsked(prompt, isPlaceWord); if (da) facts.daysAsked = da; }
    { const hz = hazardsAsked(prompt);
      if (hz.length) facts.hazardsAsked = hz;
      /* v91.17.283 · WS4 · a client answer never carries a 0-100 score (audit A13: scores are operator-only); the level words come from served.mjs */
      const hc = normaliseHazardContext(hazardContext).map((x) => INTERNAL() ? x : { ...x, score: null, publishedScore: null });
      if (hc.length) facts.hazardVerdicts = hc;
      if (scope) facts.national = nationalFacts(scope, nationalHazards(prompt, hz), nationalContext, WEEK_RE.test(String(prompt || '')));       /* v91.17.103 · the model gate status of every hazard in play, so the analyst says when a level is experimental or reference */
      try { if (app.gate) { const hs = new Set([...(hz || []), ...hc.map(x => x && (x.hazard || x.key)).filter(Boolean)]);
        if (hs.size) { facts.modelStatus = {}; for (const h of hs) { const t = app.gate.tagOf(h); const e = app.gate.entryOf(h); const LV = e && e.resolved && e.resolved.levels;
          /* v91.17.283 · WS4 · owner decision A: the product type and alert flag can differ by level (heat High / Severe Indicative) */
          facts.modelStatus[h] = (t.productType || t.status) + (t.canAlert ? '' : ' (display only, raises no alerts)') + (LV ? '; by level: ' + Object.entries(LV).map(([k, v]) => k + ' ' + v.productType + (v.canAlert ? '' : ' (raises no alerts)')).join(', ') : ''); } } } } catch (_) {} }
    try {
      /* v91.17.75 · "Gilgit-Baltistan" names a province; its first word is not the Gilgit tehsil */
      const asked = unitsInText(prompt).filter((u) => !(scope && scope.province && scope.province.toLowerCase().split(/\s+/).includes(String(u.name).toLowerCase())));
      if (asked.length) { const _cl = String((context && context.location) || '').split(/[\/·,]/)[0].trim().toLowerCase();
        /* v91.17.122 · a named place that is the one selected on the dashboard is read at the dashboard's point (one value per place) */
        facts.askedUnits = await Promise.all(asked.map(u => unitFactsFull(u, (_cl && context && context.point && (String(u.name).toLowerCase() === _cl || String(u.key || '').toLowerCase() === _cl)) ? context.point : null, { daily: !!facts.daysAsked }))); }
      /* v91.17.6 · the question named a place the unit index does not hold.
         Run this even when a unit DID match, so "Murree vs Naran" answers for
         both rather than dropping the half the unit index does not carry. */
      let placeAsked = !!scope;   /* v91.17.75 · a national question names the country, not a settlement to geocode */
      if (!scope) {
        const covered = new Set(asked.flatMap((u) => [normName(u.name), normName(u.district)]));
        const multi = await resolveAskedPlaces(prompt, asked.length ? covered : null);
        const r = multi.list[0] || { tried: multi.tried, place: null, alternatives: [], candidate: multi.candidate || null };
        if (multi.tried && multi.tried.length) facts.placeResolution = multi.tried;
        if (multi.list.length) {
          facts.askedPlace = await placeFacts(multi.list[0]);
          if (multi.list.length > 1) {
            facts.askedPlacesAlsoNamed = await Promise.all(multi.list.slice(1).map(placeFacts));
            facts.comparisonNote = 'More than one place was named. Answer for EVERY one of them, side by side. Where they are in the same city, the grid forecast will be nearly identical for all of them and the difference is in urbanMorphology - say which is warmer at night, by how much, and which measured quantity drives it.';
          }
          placeAsked = true;
        }
        else if (!asked.length && r.candidate && namesAPlace(prompt)) {
          placeAsked = true;
          /* a lookup that FAILED is not a place that does not exist. Saying
             "not found in Pakistan" when the gazetteer threw would be a false
             statement about the country rather than about this server. */
          const lookupFailed = r.tried.length > 0 && r.tried.every((t) => t.error);
          facts.askedPlaceUnresolved = {
            asked: r.candidate,
            lookupFailed,
            why: lookupFailed
              ? 'The place lookup itself failed on this server (' + (r.tried[0] && r.tried[0].error) + '), so nothing can be said about whether the place exists.'
              : 'No place of that name was found in NIGRAAN\'s place table (places, tehsils, districts and provinces of Pakistan).',
            instruction: 'Say what happened and ask for a nearby larger settlement or a district. Do NOT answer about any other location.',
          };
        }
      }
      /* ══ v91.17.11 · "DIFFERENT SECTORS" IS A QUESTION ABOUT THE SPREAD ═════
         "compare islamabad different sector temp" was answered with a single
         centroid forecast for Islamabad: the comparison was dropped and the
         word sector was ignored. When the question asks about parts of a
         place rather than the place, the answer is the RANGE across it. */
      if (/\b(sector|sectors|areas?|parts?|neighbourhoods?|neighborhoods?|localit|districts? of|within|across)\b/i.test(String(prompt || ''))
          && app.urbanHeat && app.urbanHeat.ready()) {
        const anchor = (facts.askedPlace && Number.isFinite(facts.askedPlace.lat))
          ? { lat: facts.askedPlace.lat, lon: facts.askedPlace.lon, name: facts.askedPlace.name }
          : (facts.askedUnits && facts.askedUnits[0] && facts.askedUnits[0].lat != null)
            ? { lat: facts.askedUnits[0].lat, lon: facts.askedUnits[0].lon, name: facts.askedUnits[0].name }
            : null;
        if (anchor) {
          try {
            const sp = app.urbanHeat.spread(anchor.lat, anchor.lon, 15);
            if (sp && sp.cells) facts.withinPlaceSpread = { place: anchor.name, ...sp };
          } catch (_) {}
        }
      }
      const DP = dashboardPlace(context);
      const name = String((context && context.location) || '').split(/[\/·,]/)[0].trim().toLowerCase();
      let u = name && app.units.tehsil.find(x => x.name.toLowerCase() === name || (x.key || '').toLowerCase() === name), viaPoint = false;
      if (!u && DP && DP.lat != null) { try { const h = unitAtPoint(app, DP.lat, DP.lon); if (h && h.unit) { u = h.unit; viaPoint = true; } } catch (_) {} }   /* v91.17.266 */
      if (u && !asked.some(a => a.unitId === u.unitId)) {
        /* the dashboard selection answers "here", never a named place. Withheld
           the moment the question names somewhere else, so it cannot be
           substituted the way Gojal was substituted for Naran. */
        if (placeAsked) facts.dashboardSelectionIgnored = { name: (DP && DP.name) || u.name, district: u.district, why: 'the question named a different place; this is only what was selected on screen and it is not an answer to the question' };
        else { facts.selectedUnit = await unitFactsFull(u, DP && DP.lat != null ? { lat: DP.lat, lon: DP.lon } : (context && context.point), { daily: !!facts.daysAsked });   /* the live fallback applies to "here" as well as to a named unit */
          if (DP && DP.name && normName(DP.name) !== normName(u.name)) facts.selectedUnit.dashboardName = DP.name;
          if (viaPoint) facts.dashboardPlace = { name: DP.name, lat: DP.lat, lon: DP.lon, tehsil: u.name, note: 'the place selected on the dashboard; the tehsil products are for ' + u.name + ', the tehsil it lies in' }; }
      }
      const s = INTERNAL() ? app.verification.grades().summary : null;   /* v91.17.70 · reanalysis agreement: internal diagnostic */
      if (s) facts.nationalVerification = { at: s.at, testWindow: s.testWindow, passedRaw: s.passedRaw, passedServed: s.passed, of: s.unitsTotal, medianRmse24Raw_c: s.medianRmse24Raw, medianRmse24Served_c: s.medianRmse24Served, eligibleForA: s.eligible };
    } catch {}
    return INTERNAL() ? facts : scrubNames(customerScrub(facts), namesRegex(app.dataDir), label('network'));   /* v91.17.71 · no supplier name in a facts pack; v91.17.172 · audit E-14: role words (global reanalysis, air-quality forecast ...) first, so the model never sees ERA5 / CAMS / ECMWF */
  }

  /* ══ v91.17.27 · P5-4 · EVERY NUMBER IN EVERY SENTENCE IS CHECKED ═════════════════════════
     The firewall checked only "governed" sentences (loss, probability, return period, score) and let
     any other number through, so a temperature, a date or a count the model invented reached the
     user unchallenged. Every sentence is now checked: a number must appear in the facts sent to the
     model (exactly, or as that value rounded to 0 or 1 decimal), or be a calendar or clock number
     (0-31, 1900-2100). A sentence with any other number is replaced and counted. When the client
     sends a frozen report's evidence, the facts are that evidence, so the answer is held to what
     the issued document says. */
  /* v91.17.70 · the presence-check firewall below is kept, unreached, as firewallLegacy for the internal comparison only;
     the served check is firewallAnswer() at the top of this module (slot rendering). */
  function firewall(answer, facts, pack) { return firewallAnswer(answer, facts, pack); }

  const SYSTEM = [
    'You are the NIGRAAN Climate Analyst inside the AI GEO NIGRAAN dashboard (Pakistan multi-hazard screening).',
    'GEOGRAPHY. Answer ONLY about places inside Pakistan (settlements, tehsils, districts, provinces that NIGRAAN holds). If the question is about anywhere outside Pakistan, refuse in one short sentence and invite a Pakistan place name. Do not invent foreign weather.',
    'TOPICS. You answer current weather, current hazards, the weather forecast, and forecast hazards — separately when asked for one, and together when asked for a combined brief. Lead with the requested topic; do not pad with other topics unless asked.',
    'Answer ONLY from the JSON facts supplied in this conversation. If a fact is missing, say it is not available in the dashboard; do not use general knowledge to fill it.',
    'WHICH PLACE. If askedUnits or askedPlace is present, the question is about THAT place and about nothing else. askedPlace is a settlement resolved through the Pakistan gazetteer: name it, with its district and elevation, and use its own forecast block. If otherPlacesWithThisName is present, say which one you used and that another place shares the name. askedPlace carries a direct point forecast, so say it has no bias correction and no per-unit verification, and issue no hazard score for it.',
    'If askedPlaceUnresolved is present, say plainly that you could not find that place in Pakistan and ask for a nearby larger settlement or its district. Do not answer about anywhere else.',
    'MORE THAN ONE PLACE. If askedPlacesAlsoNamed is present the question named several places. Answer for every one of them side by side, in one short table or one line each. Never answer for the first and drop the rest.',
    'INSIDE ONE CITY. The provider forecast comes from a model grid that is coarser than a city, so two sectors of the same city will carry almost the same air temperature and that agreement is a property of the grid, not a finding about the places. Say so once, plainly, and then answer the question from urbanMorphology, which is the layer that does resolve it: built surface fraction, mean building height, NDVI, population density, canyon aspect ratio, sky view factor and heatIslandMaxC. Name the measured urban-form quantity that separates the places (built surface, height, vegetation); give the modelled potential only as a ranking of urban form, not as a measured temperature gap.',
    'URBAN HEAT HONESTY. heatIslandMaxC is a nocturnal heat-island potential ON TOP of the grid forecast, not an air temperature and not a forecast. It is calibrated against two urban/rural station pairs, Rawalpindi and Lahore (49,555 concurrent hours), with the night-time timing from the Rawalpindi pair only; tested against the Lahore city/airport pair, the model island was NOT observed at night (v91.17.30), so it is reported beside the temperature and never added to it. Never add it to the forecast temperature and present the sum as a forecast. The DIFFERENCE between two places is a ranking of urban form: the AGN station check does not yet confirm the model orders places correctly (see the retrieved text), so never state a within-city temperature gap in kelvin as measured.',
    'If urbanMorphology says urban:false, the place has less than 5 per cent built surface and there is no urban heat island to report for it - say that rather than reporting a zero.',
    'dashboardSelectionIgnored is NOT an answer. It only records what was selected on screen while the question asked about somewhere else. Never present its numbers as the answer, and never quietly switch the answer to it.',
    'You may explain, compare and summarise numbers that appear in the facts. You must NOT create new numbers of these kinds: hazard or risk scores, damage ratios, losses, downtime, financial amounts, probabilities, exceedance probabilities or return periods.',
    'Screening indices are 0-100 ranks within one hazard. They are not probabilities and are not comparable across hazards. Never quote a 0-100 score to a client; quote the level word from mapLevels with its product type.',
    'PLACE SUMMARY. The top line about a place is placeSummary.headline (weather hazards at Moderate or above, else served air quality at "Unhealthy for sensitive groups" or worse, else the all-assessed line). Never say "no hazard", "all clear" or "nothing to worry about" when placeSummary.raised is true; name the air-quality class, its days and the PM2.5 value, and call it the served air-quality forecast (not a tested hazard level).',
    'HAZARD LEVELS. A hazard level comes only from mapLevels (or askedPlace.servedUnit.mapLevels): the same served levels the console and start page show. Quote the word and its product type (where a level carries levelLabel, quote that label instead of the word: a heavy-rain "Low or heavier" is not "Low"); a level marked raisesNoAlert is indicative and raises no alert. "Not assessed" is never Normal: say it is not assessed and give its notAssessedWhy. Never invent a level or a score for a hazard that has none.',
    'SCOPE. NIGRAAN gives no financial, loss, insurance or ESG / sustainability figures; if asked, say that is outside NIGRAAN.',
    'ACCURACY. If the question is about accuracy, quote measuredSkill sentences only; never state an accuracy figure that is not in them.',
    'You are not a warning authority. Operational actions need an authorised human decision; say this when the user asks what to do.',
    'WHAT TO DO. When the user asks what to do, prepare for, or watch, answer from the unit\'s suggestions block: standing = measures for this season and this ground (each with its why), watch = what sits below the action thresholds with its number. Quote them as the platform\'s suggestions, keep each one\'s why, and add nothing of your own. If the block is absent, say the suggestion library is not available for this place.',
    'airAndSmog: PM2.5 classes follow US EPA 24-hour breakpoints (Pakistan NEQS 24-hour limit 35 µg/m³); a smog day needs Unhealthy PM2.5 and poor dispersion. Say the composition forecast under-reads winter smog in Punjab.',
    'outlook facts are the global ensemble forecast (51 members) for the next days: p10/p50/p90 values and chance_pct = share of members crossing a threshold (tx40 max at or above forty degrees, tx45, tn30 warm night, tn0 frost below the settled valleys, pr10 / pr25 / pr50 / pr100 daily rain thresholds in mm, gu60 strong gusts). Quote a chance only by copying its token and say it is the share of ensemble members. For the next days prefer the forecast values.',
    'sunshineToday compares satellite-measured solar radiation with the forecast model for the same hours: the reading field already judges it against the tehsil\'s typical ratio; use that reading rather than the raw ratio.',
    'VOICE. Answer like a clear colleague who read the question carefully: say what matters for what was asked, then stop. Do not dump every available field, every not-assessed hazard, or a full catalogue. Typical length: 2–6 short sentences, or one short paragraph plus one table. Plain English, metric units. Do not describe methods, models or data sources unless asked.',
    'TABLES AND CHARTS. When the answer needs several day-by-day or hazard-by-hazard numbers, put them in a Markdown table with a header row, for example:\n| Day | Max °C | Min °C | Rain mm |\n| --- | --- | --- | --- |\n| Fri 6 Nov | 27 | 15 | 0 |\nAfter a short forecast table you may add one ASCII bar line for max temperature using ▁▂▃▄▅▆▇█ (label it). Never invent numbers for a table — every cell must be a {n..} / {d..} token or a word already in the facts.',
    /* v91.17.75 · P · B1 */
    'NATIONAL. If `national` is present the question is about the whole of Pakistan (or the one province named in national.scope), not about any single place. Lead with it: for the hazard asked (or each hazard in national.order), how many tehsils are on each level, the as-of date, then the worst tehsils by name with their level. "Cannot occur here" and "index not defined" are not levels - report them apart. Do not answer from the dashboard, a selected place or the weather. If national.awaitingPage lists hazards, say they are not in this answer yet.',
    'LEVEL WORDS. The hazard levels are exactly Normal, Low, Moderate, High and Severe. Never call a hazard Minimal or Clear; those words are retired. An engine class (Monitor, Watch, Act; a drought class) may be quoted beside the level, never instead of it.',
    /* v91.17.70 · slot rendering */
    'NUMBERS - THE MOST IMPORTANT RULE. You never write a digit. Every number in the facts is shown as a token such as {n12} followed by its value, and every date as a token such as {d3}. To state a number or a date, copy its token exactly, for example "a maximum of {n12} °C on {d3}"; the server writes the value in. Any digit you type yourself, in any script (0-9, Urdu ۰-۹, Arabic ٠-٩), removes the whole sentence. Do not spell numbers out in words either (no "fifty", "ten million", "پچاس").',
    'Never state a probability, a percentage chance, a return period or a "one in N year" figure unless you copy the token of a chance or return period that is in the facts, and only for the quantity that token belongs to (a rain chance is not a flood chance). Never name a hazard class (High, Severe, Act, Watch ...) that is not in the facts for that hazard.',
  ].join('\n');

  /* ══ v91.17.266 · interface 3 · PROVENANCE IS OPERATOR-ONLY ═══════════════════════════════════════════════════════════════════
     Every answer keeps its provenance (sources, method notes, firewall, model) and marks it: sourceChips [{ text, operatorOnly: true,
     kind: 'source' | 'method' }], and operatorOnly lists the fields a client page hides (index.mjs adds provenance.operatorOnly). The
     answer text itself carries no method note. `sources` stays a list of strings for older pages. */
  const OPERATOR_ONLY = ['sources', 'notes', 'sourceChips', 'provenance', 'firewall', 'model', 'provider', 'callId', 'ms', 'local'];
  function decorate(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json) || json.error) return json;
    const notes = Array.isArray(json.notes) ? json.notes.filter(Boolean) : [];
    json.sourceChips = [...(Array.isArray(json.sources) ? json.sources : []).map((t) => ({ text: String(t), operatorOnly: true, kind: 'source' })), ...notes.map((t) => ({ text: String(t), operatorOnly: true, kind: 'method' }))];
    json.notes = notes; json.operatorOnly = OPERATOR_ONLY;
    return json;
  }
  async function chat(body, ctx) { const r = await chatRaw(body, ctx); if (r && r.json) decorate(r.json); return r; }
  async function chatRaw(body, ctx) {
    const prompt = String(body.prompt || '').slice(0, 2000).trim();
    if (!prompt) return { status: 422, json: { error: 'empty_prompt' } };
    /* v91.17.283 · WS4 · item 5 · owner decision 14 Oct: financial and ESG / sustainability content left NIGRAAN; the analyst says so and
       answers nothing of it (no loss, cost, money or ESG figure is produced in either mode) */
    if (OUT_OF_SCOPE.test(prompt)) return { status: 200, json: { answer: OUT_OF_SCOPE_ANSWER, notes: ['scope: financial and ESG content is not part of NIGRAAN (owner decision 14 Oct 2026)'], sources: [LOOKUP_SOURCE], model: null, provider: 'retrieval', kind: 'scope' } };
    /* v91.17.283 · WS4 · item 1 · "how accurate is it": the measured out-of-sample figures, generated from the evidence files (never typed) */
    if (ACCURACY_Q.test(prompt) && !hazardsAsked(prompt).length) return { status: 200, json: accuracyAnswer() };
    /* == BEGIN v91.17.283.48 · GUIDANCE (GUIDANCE_PANEL=1 only): "what should I do" is answered ONLY from the items GET /api/guidance selects
       for the chosen place (server/api/guidance.mjs); every line is library text inserted by code with its item id and source, no model
       call, so no action sentence without an item id can appear; no match: says so and gives the contacts. Customer view items only. == */
    if (GUIDANCE_ON() && app.guidance && WHAT_TO_DO_Q.test(prompt)) {
      const c = body.context || {}, pl = (c.place && c.place.lat != null ? c.place : null) || (c.point && c.point.lat != null ? c.point : null);
      const g = pl ? await app.guidance.forPlace({ lat: pl.lat, lon: pl.lon, audience: body.guidanceAudience, lang: body.lang === 'ur' ? 'ur' : 'en' }, { view: 'customer' }) : { ok: false, why: 'no place is chosen; choose a place at the top of the page' };
      const A = guidanceAnswer(g); try { const { agencyText } = await import('./customerscrub.mjs'); A.answer = agencyText(A.answer); } catch (_) {}   /* the owner's agency rule */
      return { status: 200, json: { answer: A.answer, guidanceItems: A.items, guidance: g && g.ok !== false ? { libraryVersion: g.provenance.libraryVersion, itemIds: g.provenance.itemIds, audience: g.audience } : null,
        notes: ['Written by code from the NIGRAAN guidance library: every action is a library item (id and source shown); nothing is generated.'], sources: ['NIGRAAN guidance library ' + ((g && g.library && g.library.version) || '')],
        model: null, provider: 'retrieval', kind: 'guidance', basis: { place: (c.place && c.place.name) || c.location || null } } };
    }
    /* == END v91.17.283.48 · GUIDANCE == */
    /* v91.17.76 · A · B-02/B-03 · the four chips are commands about the selected place: no place geocoding, one answer each */
    { const intent = intentOf(body, prompt); if (intent) return { status: 200, json: await intentAnswer(intent, body) }; }
    if (!cfg) { const gf = await grounding(body.context, prompt, body.hazardContext, body.nationalContext); return { status: 200, json: askedBasis(retrieval(prompt, gf), gf) }; }
    /* v91.17.71 · A/B HOOK FOR THE BENCH: body.model is honoured ONLY for internal QA on this machine (loopback AND the
       machine's own token secret in x-agn-qa, the same qaOk rule /api/skill uses; index.mjs passes ctx.qa). Any other
       caller's body.model is ignored and the configured model answers. */
    const abModel = (ctx && ctx.qa === true && typeof body.model === 'string' && /^[\w.:\/@+-]{1,120}$/.test(body.model.trim())) ? body.model.trim() : null;
    const model = abModel || await pickModel();
    if (!model) return { status: 503, json: { error: 'no_model', why: (cfg.provider === 'ollama' ? 'Ollama answers but holds no model. ' : 'The provider did not return a usable model list. ') + (modelNote || '') + (adopt.why ? ' · store: ' + adopt.why : '') + (importer.why ? ' · import: ' + importer.why : ''), provider: cfg.provider, model: cfg.model || null } };
    const facts0 = await grounding(body.context, prompt, body.hazardContext, body.nationalContext);
    /* Deterministic day dump only when no language model is connected. With a model, let it answer in natural prose
       (tables when useful); retrieval/forecastAnswer remains the firewall fallback. */
    if (!cfg && !body.frozenEvidence && forecastAnswer(prompt, facts0)) return { status: 200, json: askedBasis(retrieval(prompt, facts0), facts0) };
    /* v91.17.75 · a national question whose weather-screen hazards only the page can score: ask the page for them first
       (one cheap round trip, like needHazard) rather than spend a model call on a pack that is still missing them */
    if (facts0.national && facts0.national.awaitingPage && facts0.national.awaitingPage.length && !body.nationalContext && !body.frozenEvidence) {
      const rt = retrieval(prompt, facts0);
      return { status: 200, json: { ...rt, needNational: rt.needNational || nationalNeed(facts0.national) } };
    }
    /* v91.17.27 · P5-4 · a question asked about an issued document is answered from that document's frozen evidence only */
    const facts = (body.frozenEvidence && typeof body.frozenEvidence === 'object')
      ? { frozenEvidence: body.frozenEvidence, note: 'Answer only from frozenEvidence: it is the evidence sealed into the issued document. Live dashboard facts are withheld for this question.' }
      : facts0;
    /* v91.17.42 · a local model on a CPU: a longer patience (the 1.7B and 20B models answer in 20-120 s without a GPU),
       thinking off for the small Qwen models (they loop in thinking mode) and a low reasoning effort for gpt-oss; the
       reasoning level follows the question: a lookup is low, a "why" is medium, a comparison is high. */
    const local = cfg.provider === 'ollama' || /127\.0\.0\.1|localhost/.test(cfg.base || '');
    /* v91.17.71 · model size from its tag, for any family (qwen3:1.7b, gemma3:4b, gemma3n:e2b, gemma3:12b, gpt-oss:20b):
       4B parameters or fewer is small (compact pack, short answer); 12B is not small. Sub-billion tags (270m) are small. */
    const sizeB = (() => { const m = String(model).match(/(?:^|[^0-9.])e?(\d+(?:\.\d+)?)b\b/i); if (m) return Number(m[1]); const k = String(model).match(/(?:^|[^0-9.])(\d+)m\b/i); return k ? Number(k[1]) / 1000 : null; })();
    const small = sizeB != null && sizeB <= 4;
    const level = /\b(compare|versus|vs\.?|portfolio|across|which of|rank)\b/i.test(prompt) ? 'high' : /\b(why|explain|driver|driving|changed|because|reason)\b/i.test(prompt) ? 'medium' : 'low';
    /* thinking controls are family-specific: Qwen3 takes chat_template_kwargs, gpt-oss a reasoning effort; Gemma has no
       thinking mode and gets no extra kwargs (an unknown kwarg is at best ignored) */
    const extra = {}; if (local) { if (/qwen/i.test(model)) extra.chat_template_kwargs = { enable_thinking: !small && level !== 'low' }; else if (/gpt-oss/i.test(model)) extra.reasoning_effort = small ? 'low' : level; }
    const t0 = Date.now(); const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), local ? 180000 : 30000);
    try {
      /* v91.17.54 · MEASURED on the user's machine (qwen3:1.7b, thinking off): "landslide risk in Naran tomorrow" came back as
         the FACTS block echoed as JSON - braces, keys, quoted field names - not a sentence. A small model mirrors the shape of
         its input. So: the facts are labelled as data to read and not to repeat, the answer format is spelled out, a JSON-shaped
         reply is asked once more with a firmer instruction at temperature 0, and if it is still JSON the deterministic grounded
         reading (the same one the no-key mode writes) is returned with a note - never raw data on the page. */
      const PROSE = '\nANSWER FORMAT: natural English sentences (or a short paragraph + one Markdown table when comparing days or hazards). Match the question: if they asked only for weather now, give temperature, feel, wind/rain if notable — skip hazard catalogues and jargon like thermal-stress classes unless asked; if they asked for a forecast, lead with the outlook and put day values in a Markdown table (and an optional Max °C bar line); if they asked about hazards, name only what is raised or worth watching. Never output JSON, braces, keys or quoted field names. Do not recite "not assessed" / "cannot happen" lists unless the question is about those gaps.';
      /* v91.17.70 · the model is shown the SLOTTED pack: every number and date carries its token, and the firewall checks the
         answer against the same pack, so a token always resolves to the value the model was shown */
      /* v91.17.255 · B-7 · measured 12 Oct 17:2x PKT with the Groq key: "HTTP 413: Request too large for model openai/gpt-oss-120b".
         Cloud free tiers often cap tokens per request (~7–8k TPM). Local/small models get compact(); cloud gets cloudLean()
         (weather + hazards only) so the slotted pack + system prompt fits. */
      const sent = facts.frozenEvidence ? facts : (local || small ? compact(facts) : cloudLean(facts));
      const pack = slotPack(sent);
      const factsText = 'FACTS (data to read, not to repeat; write the {n..}/{d..} token wherever you use a number or a date):\n' + JSON.stringify(pack.slotted);
      const call = (firm) => fetch(cfg.base + '/chat/completions', {
        method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key, 'HTTP-Referer': 'http://localhost', 'X-Title': 'NIGRAAN local' },
        body: JSON.stringify({ model, temperature: firm ? 0 : 0.2, max_tokens: local ? 1600 : (small ? 600 : 900), ...extra, messages: [{ role: 'system', content: SYSTEM + (small ? '\nYou are a small model: keep to the facts given, no speculation, at most 150 words.' : '') + PROSE + (firm ? '\nYour previous reply was raw JSON and was rejected. Write sentences only.' : '') }, { role: 'user', content: factsText + '\n\nQUESTION:\n' + prompt + (firm ? '\n\nAnswer in sentences, not JSON.' : '') }] }),
      });
      const looksJson = (t) => { const L = String(t || '').split('\n').filter((x) => x.trim()); if (!L.length) return false; if (/^\s*[\[{]/.test(t)) return true; return L.filter((x) => /"[A-Za-z_][A-Za-z0-9_ ]*"\s*:/.test(x)).length >= Math.max(3, L.length * 0.4); };
      let r = await call(false); let retriedJson = false;
      let j = await r.json().catch(() => ({}));
      if (!r.ok && r.status === 429) {
        await new Promise((done) => setTimeout(done, 12000));
        try { r = await call(false); j = await r.json().catch(() => ({})); } catch (_) { /* keep first error */ }
      }
      if (!r.ok) {
        const msg = (j.error && (j.error.message || j.error)) || ('HTTP ' + r.status);
        console.error('  ai         provider error from ' + cfg.provider + ' (' + model + '): HTTP ' + r.status + ' ' + String(msg).slice(0, 200));
        if ((r.status === 429 || r.status === 413) && !body.frozenEvidence) {
          const rt = askedBasis(retrieval(prompt, facts0), facts0);
          if (rt && rt.answer) return { status: 200, json: { ...rt, notes: [...(rt.notes || []), 'language model busy; this is the grounded reading from NIGRAAN data'], model: null, provider: 'retrieval' } };
        }
        return { status: r.status === 429 ? 429 : 502, json: { error: 'provider_error', why: 'the model provider answered HTTP ' + r.status + ': ' + String(msg).slice(0, 300) + (modelNote ? ' · ' + modelNote : ''), provider: cfg.provider, model } };
      }
      const textOf = (jj) => (((jj.choices || [])[0] || {}).message ? jj.choices[0].message.content || '' : '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      let text = textOf(j); let jsonNote = null, fallbackNeed = null, fromRetrieval = false;
      /* v91.17.54 · MEASURED on the operator's machine: a 40 s answer cut mid-sentence ("…such as 94") - the local Qwen spends
         part of the token budget thinking even with thinking off, and the visible answer ran out. The budget is 1600 for a
         local model (time is the only cost there) and a reply the provider stopped at the budget says so. */
      const cut = ((j.choices || [])[0] || {}).finish_reason === 'length';
      if (looksJson(text)) {
        retriedJson = true;
        try { const r2 = await call(true); const j2 = await r2.json().catch(() => ({})); if (r2.ok) { const t2 = textOf(j2); if (t2 && !looksJson(t2)) text = t2; } } catch {}
        if (looksJson(text)) { const rt = retrieval(prompt, facts0); fallbackNeed = (rt && rt.needHazard) || null; fromRetrieval = true; text = String((rt && rt.answer) || '').replace(/[^\n]*(No language model is connected|ai\.key)[^\n]*/g, '').replace(/\n{3,}/g, '\n\n').trim() || 'The model returned raw data instead of an answer; ask again in different words.'; jsonNote = 'the model answered in raw JSON twice; this is the grounded reading written from the same facts'; }
      }
      let fw = fromRetrieval ? { text, removed: 0, kept: 1 } : firewall(text, sent, pack);   /* v91.17.54 · the grounded reading is written from the facts; nothing in it is the model's */
      /* v91.17.70 · an answer the firewall has gutted (nothing kept, or more removed than kept) is replaced by the grounded
         reading, whose numbers are written by code from the same facts; the sources line says so */
      let fwNote = null;
      /* v91.17.79 · A/B of 27 Sep (25 answers, qwen3:1.7b): the firewall had to strip invented numbers from 22 of 25 answers
         and kept a partly stripped answer whenever more sentences survived than were removed. A customer answer now carries
         no sentence the model wrote with a number of its own: ANY removal serves the grounded reading instead. */
      if (!fromRetrieval && fw.removed) {
        const rt = retrieval(prompt, facts0); fallbackNeed = (rt && rt.needHazard) || fallbackNeed;
        const t2 = String((rt && rt.answer) || '').replace(/[^\n]*(No language model is connected|ai\.key)[^\n]*/g, '').replace(/\n{3,}/g, '\n\n').trim();
        fwNote = 'the model wrote ' + fw.removed + ' sentence(s) with numbers or classes of its own (' + [...new Set(fw.reasons)].slice(0, 2).join('; ') + '); this is the grounded reading written by code from the same facts';
        fw = { text: t2 || 'The model\'s answer carried numbers that are not from the facts and was withheld; ask again.', removed: fw.removed, kept: 0, replaced: true };
        fromRetrieval = true;
      }
      const rec = { call_id: newId('ai'), at: nowIso(), provider: cfg.provider, model, ...(abModel ? { abModel: true } : {}), reasoningLevel: level, ms: Date.now() - t0, promptSha: createHash('sha256').update(prompt).digest('hex'), removed: fw.removed, tokens: j.usage || null };
      await app.store.insert('aiCalls', rec);
      const sources = ['Dashboard context: ' + ((body.context && body.context.location) || 'selected location')];
      /* v91.17.36 · AUDIT R-22 · the facts nest forecast and verification under the units */
      const _us = [].concat(facts.askedUnits || [], facts.selectedUnit ? [facts.selectedUnit] : []);
      const _fr = _us.map(u => u && u.forecast && u.forecast.runId).filter(Boolean);
      if (facts.forecast) sources.push('model forecast run ' + facts.forecast.runId);
      else if (_fr.length) sources.push('model forecast run ' + [...new Set(_fr)].join(', '));
      if (INTERNAL() && (facts.verification || _us.some(u => u && u.verification))) sources.push('Internal diagnostic: reanalysis agreement of the tehsil');
      sources.push('Model: ' + cfg.provider + ' / ' + model + (cfg.local ? ' (local, on this machine)' : ' (cloud: the question and the facts pack were sent to ' + cfg.provider + ')'));
      sources.push('Numbers: written by code from the facts pack (slot rendering)');
      if (fw.removed) sources.push('Firewall removed ' + fw.removed + ' sentence(s)'); if (fwNote) sources.push('Note: ' + fwNote);
      if (cut && !fromRetrieval) sources.push('Note: the model stopped at its token budget; the last sentence may be incomplete');
      if (jsonNote) sources.push('Note: ' + jsonNote); else if (retriedJson) sources.push('Note: the first reply was raw JSON; the model was asked again for sentences');
      /* v91.17.79 · the "Based on:" line was written by code from the sources. v91.17.266 · it is provenance: it travels in notes
         (operator-only), not in the answer the client reads */
      const _b = sources.filter((x) => /^(Dashboard context|model forecast run)/.test(x)).map((x) => x.replace(/^Dashboard context: /, ''));
      const _notes = ['Based on: ' + (_b.length ? _b.join('; ') : 'the NIGRAAN facts for this place') + '.'];
      if (fw.text) fw.text = fw.text.replace(/\n*\s*Based on:[^\n]*\s*$/i, '').trim();
      return { status: 200, json: { answer: fw.text, chips: chipsOf(fw.used, facts), basis: { place: (facts.askedPlace && facts.askedPlace.name) || (facts.askedUnits && facts.askedUnits[0] && facts.askedUnits[0].name ? facts.askedUnits[0].name + (facts.askedUnits[0].district && facts.askedUnits[0].district !== facts.askedUnits[0].name ? ', ' + facts.askedUnits[0].district : '') : null) || (body.context && body.context.location) || null, asked: !!(facts.askedPlace || (facts.askedUnits && facts.askedUnits.length)), at: (facts && (facts.issuedAt || facts.generatedAt)) || ((_us.find((u) => u && u.forecast && u.forecast.issuedAt) || {}).forecast || {}).issuedAt || null }, notes: _notes, sources, model, ...(abModel ? { abModel: true } : {}), ms: Date.now() - t0, provider: cfg.provider, local: cfg.local, firewall: { removed: fw.removed, slots: true, replacedByGrounded: !!fw.replaced, rule: 'slot' }, kind: 'explanation', callId: rec.call_id, ...(fallbackNeed ? { needHazard: fallbackNeed } : {}) } };
    } catch (e) {
      if (e.name === 'AbortError') return { status: 504, json: { error: 'provider_timeout', why: 'no answer within ' + (local ? '180' : '30') + ' s from ' + cfg.provider + ' / ' + model + (local ? ' — the model is reading the pack on the CPU; a shorter question answers faster' : '') } };
      if (refused(e)) {
        const started = await ensureLocalProvider();
        return { status: 503, json: { error: 'provider_unreachable', why: 'nothing answered at ' + cfg.base + (cfg.provider === 'ollama' ? ' — Ollama was not running' + (started ? '; the server has started it now: ask again' : (localStart.why ? ' and could not be started (' + localStart.why + ')' : '')) : ''), provider: cfg.provider, model, retry: started } };
      }
      return { status: 502, json: { error: 'provider_error', why: e.message, provider: cfg.provider, model } };
    } finally { clearTimeout(tm); }
  }
  /* v91.17.75 · what the page is asked to attach for a national question */
  function nationalNeed(N) {
    if (!N || !N.awaitingPage || !N.awaitingPage.length) return null;
    const prov = N.level === 'province' ? N.scope : null;
    return { layers: N.awaitingPage.slice(), scope: prov ? { province: prov } : null, lead: 24, ...(N.week ? { days: 7 } : {}) };
  }
  /* v91.17.75 · the national block, written by code from the national facts: counts per level, the worst tehsils, the date */
  function nationalLines(N) {
    const L = [];
    /* v91.17.76 · A · B-38 · a week question says the window in Pakistan days; the stamp is PKT, never UTC */
    const head = (N.level === 'province' ? N.scope : 'Pakistan') + ' — ' + N.tehsils + ' tehsils' + (N.disputedNotScored ? ' (the disputed unit is not scored)' : '')
      + (N.week ? ', this week' : '') + (N.asOfPkt ? ' (as of ' + N.asOfPkt + ')' : '');
    L.push(head + ':');
    const winOf = (w) => w && w.from ? (dayWords(w.from) + (w.to && w.to !== w.from ? ' to ' + dayWords(w.to) : '') + (w.days ? ' (' + w.days + ' forecast day' + (w.days === 1 ? '' : 's') + ')' : '')) : null;
    for (const k of N.order || Object.keys(N.hazards || {})) {
      const h = N.hazards[k]; if (!h) continue;
      const name = NAT_LABEL[k] || k;
      if (h.available === false) { L.push(''); L.push(name + ': ' + h.why + '.'); continue; }
      if (h.hidden) { L.push(''); L.push(name + ': not shown. ' + h.why); continue; }   /* v91.17.283 · owner decision B */
      L.push('');
      const asOf = h.asOf || null;
      const win = N.week && h.window ? winOf(h.window) : null;
      if (N.week && h.window && !h.window.from) { L.push(name + ': not scored for the week yet — the dashboard\'s forecast for most tehsils has not loaded; ask again once the map has finished loading.'); continue; }
      L.push(name + (win ? ' (worst level in the window ' + win + ')' : (asOf ? ' (as of ' + asOf + ')' : '')) + ': ' + (h.levels || []).map((x) => x.level + ' ' + x.tehsils).join(' · ')
        + (h.indexNotDefined && h.indexNotDefined.tehsils ? ' · ' + h.indexNotDefined.why + ' ' + h.indexNotDefined.tehsils : '')
        + (h.cannotOccur && h.cannotOccur.tehsils ? ' · ' + (h.cannotOccur.why || 'cannot occur here') + ' ' + h.cannotOccur.tehsils : '')
        + (h.noData ? ' · no data ' + h.noData : '') + (h.notAssessed && h.notAssessed.tehsils ? ' · not assessed ' + h.notAssessed.tehsils : '') + ' tehsils.'
        + (h.productType ? ' Product type: ' + h.productType + (() => { const x = h.byLevel ? Object.entries(h.byLevel).filter(([, v]) => v.productType !== h.productType || !v.canAlert).map(([k2, v]) => k2 + ' ' + v.productType.toLowerCase() + (v.canAlert ? '' : ', raises no alert')) : []; return x.length ? ' (' + x.join('; ') + ')' : ''; })() + '.' : '')
        + (h.basis ? ' ' + h.basis.charAt(0).toUpperCase() + h.basis.slice(1) + '.' : ''));
      if (h.notAssessed && h.notAssessed.tehsils) L.push('  Not assessed: ' + h.notAssessed.why + '.');
      if (N.week && h.standing) L.push('  ' + h.standing.charAt(0).toUpperCase() + h.standing.slice(1) + '.');
      if (N.week && h.window && h.window.missing && h.window.missing.length) L.push('  No engine forecast for ' + h.window.missing.map(dayWords).join(', ') + '; those days are not in this count.');
      if (h.worst && h.worst.length) L.push('  Worst: ' + h.worst.map((w) => w.tehsil + (w.district && w.district !== w.tehsil ? ' (' + w.district + ')' : '') + ' ' + w.level
        + (w.peakDay ? ' on ' + dayWords(w.peakDay) : '')
        + (w.droughtClass && k === 'drought' ? ' [drought class ' + w.droughtClass + (w.index ? ', ' + w.index + ' ' + (w.indexValue != null ? sgn(w.indexValue) : 'n/a') : '') + ']' : '')
        + (w.engineLevel ? ' [engine level ' + w.engineLevel + (w.priorityLakes ? ', ' + w.priorityLakes + ' priority lake' + (w.priorityLakes === 1 ? '' : 's') + ' upstream' : '') + ']' : '')
        + (w.engine ? ' [' + w.engine + ']' : '')).join('; ') + '.');
      else if (h.worstNote) L.push('  ' + h.worstNote.charAt(0).toUpperCase() + h.worstNote.slice(1) + '.');
    }
    if (N.riverReaches) {
      const R = N.riverReaches; L.push('');
      const lv = (x) => (x.level || levelOfEngineClass(x.class) || x.class);
      const win = N.week && R.window ? winOf(R.window) : null;
      L.push('Rivers (' + R.reaches + ' reaches' + (win ? ', worst level in the window ' + win : (R.date ? ', ' + R.date : '')) + '): ' + (R.byLevel || R.byClass || []).map((x) => lv(x) + ' ' + x.reaches).join(' · ') + '. ' + R.meaning + '.');
      if (R.aboveNormal.length) L.push('  At or above the reach\'s 5-year flow (a flood level; flows that are only high for the time of year stay Normal): ' + R.aboveNormal.map((x) => x.reach + ' ' + lv(x) + (x.peakDate ? ' on ' + dayWords(x.peakDate) : '') + (x.meaning ? ' (' + x.meaning + ')' : '')).join('; ') + '.');
    }
    if (N.awaitingPage && N.awaitingPage.length) { L.push(''); L.push('Not in this answer yet: ' + N.awaitingPage.map((x) => NAT_LABEL[x] || x).join(', ') + ' — these are scored by the engine inside the dashboard page; ask in the dashboard and it attaches them.'); }
    return L;
  }
  /* ══ v91.17.76 · A · B-02 / B-03 · THE FOUR ANALYST COMMANDS ANSWER FOUR DIFFERENT QUESTIONS ══════════════════════
     MEASURED (UX audit v91.17.75): "Explain" answered about villages called Top and Main (B-02); "Compare", "Brief" and
     "Evidence" returned the same 700 characters - Islamabad now/+24/+48/+72 h, drought SPI, urban form (B-03): "Compare
     with another high-risk district" named no second district and "What evidence is missing?" listed no gap.
     The four chips are commands about the place selected on screen, so they skip place geocoding entirely and each has its
     own answer, written by code from NIGRAAN data (the same deterministic path in both modes; a language model adds no
     number and no class to a canned command):
       explain   the highest level at the selected place and lead, its four drivers as the Predictions engine reports
                 them, how it moves over 6-72 h, and the other hazards
       compare   the selected tehsil beside the tehsil holding the highest level in Pakistan (from the page engine's
                 national sweep, the map's basis), hazard by hazard, with the forecast for both
       brief     a short executive brief: headline, next 72 h, the place's hazards, the national picture, suggested focus
       evidence  the gaps that actually exist: hazards with no reading here, river gauge coverage, ensemble spread, station
                 observations, the stored forecast run, drought index coverage, and the open items of the decision case when the page sends them
     The page attaches `intentContext` (its engine's levels; nothing is re-derived here). Without it the answer says what is
     missing rather than inventing it. */
  const CHIP_INTENTS = [['explain', /^\s*explain the current top risk and its main drivers\.?\s*$/i], ['compare', /^\s*compare the selected location with another high-risk district\.?\s*$/i],
    ['brief', /^\s*prepare a concise executive climate briefing\.?\s*$/i], ['evidence', /^\s*what evidence is missing before an operational advisory\??\s*$/i]];
  function intentOf(body, prompt) {
    const k = body && typeof body.intent === 'string' ? body.intent.toLowerCase().trim() : null;
    if (k && CHIP_INTENTS.some(([n]) => n === k)) return k;
    for (const [n, re] of CHIP_INTENTS) if (re.test(String(prompt || ''))) return n;
    return null;
  }
  const str = (v, n) => v == null ? null : String(v).slice(0, n || 120);
  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
  function cleanLevels(arr) {
    const W = SCALE_WORDS();
    return (Array.isArray(arr) ? arr : []).slice(0, 16).map((x) => x && typeof x === 'object' ? {
      hazard: str(x.hazard, 30), label: str(x.label, 40), level: W.includes(x.level) ? x.level : null, i: Number.isInteger(x.i) && x.i >= 0 && x.i <= 4 ? x.i : null,
      score: numOrNull(x.score), engine: str(x.engine, 60), na: x.na === true, nd: x.nd === true, why: str(x.why, 300),
      drivers: (Array.isArray(x.drivers) ? x.drivers : []).slice(0, 4).map((d) => d && typeof d === 'object' ? { label: str(d.label, 80), value: d.value == null ? null : str(d.value, 30), note: str(d.note, 200) } : null).filter((d) => d && d.label && d.label !== '—'),
      trajectory: (Array.isArray(x.trajectory) ? x.trajectory : []).slice(0, 6).map((t) => t && typeof t === 'object' ? { lead: numOrNull(t.lead), level: W.includes(t.level) ? t.level : null, score: numOrNull(t.score) } : null).filter((t) => t && t.lead != null),
      standing: x.standing === true, validTo: str(x.validTo, 40), aiCorrected: numOrNull(x.aiCorrected),
    } : null).filter((x) => x && x.hazard);
  }
  function cleanIntentContext(ic) {
    if (!ic || typeof ic !== 'object') return null;
    const W = SCALE_WORDS();
    const o = { unit: str(ic.unit, 80), place: str(ic.place, 80), lead: Number.isInteger(ic.lead) && ic.lead > 0 && ic.lead <= 240 ? ic.lead : 24, validTo: str(ic.validTo, 40),
      levels: cleanLevels(ic.levels), tehsil: cleanLevels(ic.tehsil) };
    if (ic.window72 && typeof ic.window72 === 'object') o.window72 = { tmax: numOrNull(ic.window72.tmax), tmin: numOrNull(ic.window72.tmin), rain: numOrNull(ic.window72.rain), gustMax: numOrNull(ic.window72.gustMax), to: str(ic.window72.to, 40), aiCorrected: ic.window72.aiCorrected === true };
    if (ic.compareWith && typeof ic.compareWith === 'object') o.compareWith = { unit: str(ic.compareWith.unit, 80), district: str(ic.compareWith.district, 80), province: str(ic.compareWith.province, 80),
      hazard: str(ic.compareWith.hazard, 30), level: W.includes(ic.compareWith.level) ? ic.compareWith.level : null, levels: cleanLevels(ic.compareWith.levels), basis: str(ic.compareWith.basis, 200) };
    if (ic.national && typeof ic.national === 'object') o.national = normaliseNational(ic.national);
    if (ic.nationalTop && typeof ic.nationalTop === 'object') o.nationalTop = (Array.isArray(ic.nationalTop.rows) ? ic.nationalTop.rows : []).slice(0, 8).map((r) => r && W.includes(r.level) ? { hazard: str(r.hazard, 30), label: str(r.label, 40), level: r.level, tehsils: Number.isInteger(r.tehsils) ? r.tehsils : null, worst: str(r.worst, 80), district: str(r.district, 80) } : null).filter(Boolean);
    if (ic.gaps && typeof ic.gaps === 'object') { const g = ic.gaps; o.gaps = { ensembleLive: g.ensembleLive === true, hourlyLoaded: g.hourlyLoaded === true, aiCorrected: g.aiCorrected === true,
      readiness: (g.readiness && typeof g.readiness === 'object') ? Object.fromEntries(Object.entries(g.readiness).slice(0, 12).filter(([, v]) => typeof v === 'boolean').map(([k, v]) => [str(k, 30), v])) : null, readinessWhy: str(g.readinessWhy, 300) }; }
    return o;
  }
  function unitByKey(key) {
    const n = String(key || '').split(/[\/·,]/)[0].trim().toLowerCase(); if (!n) return null;
    return (app.units.tehsil || []).find((x) => x.name.toLowerCase() === n || String(x.key || '').toLowerCase() === n) || null;
  }
  const HZ_ORDER = ['flood', 'rain_hz', 'heat', 'wind', 'cold', 'drought', 'glof', 'landslide'];
  const HZ_NAME = { flood: 'Flood', rain_hz: 'Heavy rain', heat: 'Heat stress', wind: 'Wind and gusts', cold: 'Cold stress (UTCI)', drought: 'Drought', glof: 'Glacial lake outburst flood (GLOF)', landslide: 'Landslide', seismic: 'Earthquake', cyclone: 'Cyclone' };
  /* v91.17.283 · WS4 · D12: a masked level is "not assessed (outside method range)", never "cannot occur"; a client never reads a 0-100 score (A13) */
  const lvWord = (x) => x.na ? 'not assessed (outside method range)' : x.nd ? 'not assessed (no data)' : (x.level || 'not assessed (no data)');
  const lvScore = (x) => x.level ? (x.level + (x.score != null && INTERNAL() ? ' (index ' + x.score + '/100)' : (x.engine ? ' (' + x.engine + ')' : ''))) : lvWord(x);
  const byLevel = (a, b) => ((b.i == null ? -1 : b.i) - (a.i == null ? -1 : a.i)) || ((b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score)) || (HZ_ORDER.indexOf(a.hazard) - HZ_ORDER.indexOf(b.hazard));
  const nameOf = (x) => x.label || HZ_NAME[x.hazard] || x.hazard;
  function forecastLine(uf) {
    if (!uf) return null;
    if (uf.forecast && uf.forecast.leads) {
      const L = uf.forecast.leads, ks = Object.keys(L).map(Number).filter((k) => k > 0 && k <= 72).sort((a, b) => a - b);
      const t = ks.map((k) => L[k] && L[k].temperature_2m).filter((v) => v != null), r = ks.map((k) => L[k] && L[k].precipitation).filter((v) => v != null), g = ks.map((k) => L[k] && L[k].wind_gusts_10m).filter((v) => v != null);
      if (!t.length) return null;
      return 'at +' + ks.join('/+') + ' h: ' + t.map((v) => v + ' °C').join(', ') + (r.length ? '; rain ' + r.map((v) => v + ' mm/h').join(', ') : '') + (g.length ? '; gusts to ' + Math.max(...g) + ' km/h' : '');
    }
    const D = uf.liveForecast && uf.liveForecast.days;
    if (Array.isArray(D) && D.length) { const d = D.slice(0, 3); return 'next ' + d.length + ' days: max ' + d.map((x) => x.tmax_c).join('/') + ' °C, min ' + d.map((x) => x.tmin_c).join('/') + ' °C, rain ' + d.map((x) => x.rain_mm).join('/') + ' mm, gusts to ' + Math.max(...d.map((x) => x.gust_max_kmh || 0)) + ' km/h'; }
    return null;
  }
  const LOOKUP_INTENT = 'Written by code from NIGRAAN data: every level and number is the engine\'s own; nothing is generated.';
  async function intentAnswer(kind, body) {
    const ic = cleanIntentContext(body && body.intentContext);
    const ctxLoc = String((body && body.context && body.context.location) || '').trim();
    const u = unitByKey(ic && ic.unit) || unitByKey(ctxLoc);
    const place = (ic && ic.place) || (u && u.name) || ctxLoc || 'the selected place';
    const unitNote = u && u.name !== place ? ' (' + u.name + ' tehsil' + (u.district && u.district !== u.name ? ', ' + u.district : '') + ')' : (u && u.district && u.district !== u.name ? ' (' + u.district + ')' : '');
    let uf = null; if (u) { try { uf = await unitFactsFull(u, body && body.context && body.context.point); } catch (_) { uf = null; } }   /* v91.17.122 · the chips ask about the selected place: read at its point */
    const lines = []; const sources = ['NIGRAAN hazard engine (the page\'s levels for ' + place + ')'];
    const lead = (ic && ic.lead) || 24;
    const levels = ((ic && ic.levels) || []).slice();
    const scored = levels.filter((x) => !x.na && !x.nd && x.level).sort(byLevel);
    const none = !levels.length;
    if (kind === 'explain') {
      if (none) { lines.push('The hazard levels for ' + place + ' were not attached to this question, so there is nothing to explain yet. Ask again once the dashboard has loaded the levels for ' + place + '.'); }
      else {
        const top = scored[0];
        if (!top) lines.push(place + unitNote + ', next ' + lead + ' h: no hazard has a reading yet.');
        else {
          lines.push(place + unitNote + ', next ' + lead + ' h' + (ic.validTo ? ' (to ' + ic.validTo + ')' : '') + ': the highest level is ' + nameOf(top) + ' — ' + lvScore(top) + '.');
          if (top.drivers.length) { lines.push(''); lines.push('What drives ' + nameOf(top) + ' here:'); for (const d of top.drivers) lines.push('  ' + d.label + ': ' + (d.value == null ? '—' : d.value) + (d.note ? ' — ' + d.note : '')); }
          if (top.trajectory.length) { lines.push(''); lines.push((top.standing ? 'It is a standing level: the same at every lead (' : 'How it moves over the next 72 h: ') + top.trajectory.map((t) => t.lead + ' h ' + (t.level || 'not assessed') + (t.score != null && INTERNAL() ? ' (' + t.score + ')' : '')).join(' · ') + (top.standing ? ').' : '.'));
            const lv = new Set(top.trajectory.map((t) => t.level)); if (!top.standing) lines.push(lv.size > 1 ? '  The level changes inside the window; the lead with the highest level is the one to plan for.' : '  The level does not change inside the window.'); }
          const others = levels.filter((x) => x !== top);
          if (others.length) { lines.push(''); lines.push('The other hazards here: ' + others.filter((x) => !x.na).sort(byLevel).map((x) => nameOf(x) + ' ' + lvWord(x) + (x.score != null && !x.na && !x.nd && INTERNAL() ? ' (' + x.score + ')' : '')).join(', ')
            + (others.some((x) => x.na) ? '; not assessed (outside method range): ' + others.filter((x) => x.na).map(nameOf).join(', ') : '') + '.'); }
          lines.push(''); lines.push('A screening level on the one hazard scale (Normal, Low, Moderate, High, Severe), not a probability and not a warning.');
        }
      }
    } else if (kind === 'compare') {
      const C = ic && ic.compareWith; const T = ((ic && ic.tehsil) || []).slice();
      if (!C || !C.unit) { lines.push('The national sweep was not attached to this question, so no second district can be named from data. Ask again once the dashboard map has finished loading.'); }
      else {
        const cu = unitByKey(C.unit); let cf = null; if (cu) { try { cf = await unitFactsFull(cu); } catch (_) { cf = null; } }
        const selName = (u && u.name) || place;
        const higher = C.levels.find((x) => x.hazard === C.hazard); const mine = T.find((x) => x.hazard === C.hazard);
        const isHigher = higher && mine && higher.i != null && mine.i != null && higher.i > mine.i;
        lines.push('Compare ' + selName + (u && u.district && u.district !== u.name ? ' (' + u.district + ')' : '') + ' with ' + C.unit + (C.district && C.district !== C.unit ? ' (' + C.district + (C.province ? ', ' + C.province : '') + ')' : (C.province ? ' (' + C.province + ')' : '')) + '.');
        lines.push(isHigher ? ('Why ' + C.unit + ': it holds the highest level in Pakistan today, ' + nameOf(higher) + ' ' + higher.level + ', against ' + (mine.level || lvWord(mine)) + ' at ' + selName + '.')
          : (higher ? ('No tehsil is on a higher level than ' + selName + ' on any hazard today; ' + C.unit + ' is the highest-ranked other tehsil for ' + nameOf(higher) + ' (' + lvWord(higher) + ').') : C.unit + ' is the highest-ranked other tehsil in the national sweep.'));
        lines.push('');
        const hz = [...new Set([...T.map((x) => x.hazard), ...C.levels.map((x) => x.hazard)])].sort((a, b) => HZ_ORDER.indexOf(a) - HZ_ORDER.indexOf(b));
        const w1 = Math.max(12, ...hz.map((h) => (HZ_NAME[h] || h).length + 2));
        lines.push('Hazard'.padEnd(w1) + selName.padEnd(26) + C.unit);
        for (const h of hz) { const a = T.find((x) => x.hazard === h), b = C.levels.find((x) => x.hazard === h);
          lines.push((HZ_NAME[h] || h).padEnd(w1) + (a ? (a.level ? a.level + (a.score != null && INTERNAL() ? ' ' + a.score : '') : lvWord(a)) : '—').padEnd(26) + (b ? (b.level ? b.level + (b.score != null && INTERNAL() ? ' ' + b.score : '') : lvWord(b)) : '—')); }
        const f1 = forecastLine(uf), f2 = forecastLine(cf);
        if (f1 || f2) { lines.push(''); lines.push('Forecast'); if (f1) lines.push('  ' + selName + ': ' + f1 + '.'); if (f2) lines.push('  ' + C.unit + ': ' + f2 + '.'); }
        if (higher && higher.drivers && higher.drivers.length) { lines.push(''); lines.push('What drives ' + nameOf(higher) + ' at ' + C.unit + ': ' + higher.drivers.slice(0, 3).map((d) => d.label + ' ' + (d.value == null ? '—' : d.value) + (d.note ? ' (' + d.note + ')' : '')).join('; ') + '.'); }
        lines.push(''); lines.push('Both columns are on the map\'s basis: each tehsil\'s worst hour of the selected forecast day, one engine for both.' + (C.basis ? ' ' + C.basis : ''));
        sources.push('National sweep: every tehsil scored by the same engine');
      }
    } else if (kind === 'brief') {
      const now = pktStamp();
      lines.push('Executive brief — ' + place + unitNote + ', ' + now);
      const top = scored[0];
      lines.push('');
      lines.push('Headline: ' + (none ? 'the hazard levels were not attached; ask again once the dashboard has loaded them.' : top ? (nameOf(top) + ' ' + top.level + ' is the highest level here over the next ' + lead + ' h' + (top.level === 'Normal' ? (levels.some((x) => x.na || x.nd || !x.level) ? ' among the assessed hazards; some are not assessed (listed below), so this is not an all-clear.' : ' — nothing above Normal among the assessed hazards.') : '.'))   /* v283.36 item 41: a withheld hazard never yields an all-clear */ : 'no hazard has a reading yet.'));
      if (uf && uf.placeSummary && uf.placeSummary.air && uf.placeSummary.air.raises) lines.push('Place summary: ' + uf.placeSummary.headline + '.');   /* v283.49 item 1 */
      const W7 = ic && ic.window72;
      if (W7 && (W7.tmax != null || W7.rain != null)) lines.push('Next 72 h: ' + [W7.tmax != null ? 'up to ' + W7.tmax + ' °C' + (W7.aiCorrected ? ' (AI-corrected)' : '') : null, W7.tmin != null ? 'down to ' + W7.tmin + ' °C' : null, W7.rain != null ? (W7.rain === 0 ? 'no rain' : W7.rain + ' mm rain') : null, W7.gustMax != null ? 'gusts to ' + W7.gustMax + ' km/h' : null].filter(Boolean).join(', ') + '.');
      else { const f = forecastLine(uf); if (f) lines.push('Forecast ' + f + '.'); }
      const above = scored.filter((x) => x.i != null && x.i >= 1);
      /* v91.17.283 · WS4 · "the rest Normal" only for hazards assessed Normal; the others are named not assessed */
      const notA = levels.filter((x) => x.na || x.nd || !x.level);
      if (!none) lines.push('At ' + place + ': ' + (above.length ? above.map((x) => nameOf(x) + ' ' + x.level).join(', ') + (scored.length > above.length ? '; the other assessed hazards Normal' : '') + '.' : (scored.length ? 'every assessed hazard Normal.' : 'no hazard is assessed yet.'))
        + (notA.length ? ' Not assessed: ' + notA.map((x) => nameOf(x) + ' (' + (x.na ? 'outside method range' : 'no data') + ')').join(', ') + '.' : ''));
      const NT = (ic && ic.nationalTop) || [];
      if (NT.length) { const hi = NT.slice().sort((a, b) => SCALE_WORDS().indexOf(b.level) - SCALE_WORDS().indexOf(a.level))[0];
        lines.push('Across Pakistan: the highest level today is ' + hi.level + ' — ' + (hi.label || HZ_NAME[hi.hazard] || hi.hazard) + (hi.worst ? ', worst at ' + hi.worst + (hi.district && hi.district !== hi.worst ? ' (' + hi.district + ')' : '') : '') + (hi.tehsils != null ? '; ' + hi.tehsils + ' tehsil' + (hi.tehsils === 1 ? '' : 's') + ' at that level' : '') + '.'); }
      const sg = uf && uf.suggestions;
      const st = sg && Array.isArray(sg.standing) ? sg.standing.slice(0, 2) : [];
      const wa = sg && Array.isArray(sg.watch) ? sg.watch.slice(0, 2) : [];
      if (st.length || wa.length) { lines.push('Suggested focus:'); for (const x of st) lines.push('  ' + (x.measure || x.what || '') + (x.why ? ' — ' + x.why : '')); for (const x of wa) lines.push('  Watch: ' + (x.what || x.measure || '')); }
      lines.push('');
      lines.push('Decision support, not a warning. Any action needs an authorised person.');
      sources.push('Forecast and suggestions for ' + ((u && u.name) || place));
    } else if (kind === 'evidence') {
      const gaps = [];
      for (const x of levels.filter((x) => x.nd)) gaps.push(nameOf(x) + ': no reading at ' + place + (x.why ? ' — ' + x.why : '') + '.');
      const fls = [levels.find((x) => x.hazard === 'flood'), ((ic && ic.tehsil) || []).find((x) => x.hazard === 'flood')].filter(Boolean);
      const riverNote = fls.map((f) => (f.drivers || []).map((d) => d.note || '').find((n) => /gauge|river/i.test(n))).find(Boolean) || null;
      if (riverNote && /no gauge|unknown|not run/i.test(riverNote)) gaps.push('River: ' + riverNote + '.');
      const G = (ic && ic.gaps) || null;
      if (G && !G.ensembleLive) gaps.push('Forecast spread: the ensemble spread for this place is not live, so the levels carry no uncertainty range here.');
      if (G && !G.hourlyLoaded) gaps.push('Hourly forecast: not loaded for ' + place + ', so the lead-time levels are not scored yet.');
      let near = null; try { near = (u && app.fleet && app.fleet.nearest) ? app.fleet.nearest(u.lat, u.lon, 25) : null; } catch (_) { near = null; }
      if (u && app.fleet && app.fleet.nearest) gaps.push(near ? null : 'Observations: no working MACH station within 25 km of ' + (u.name) + ', so nothing checks the forecast on the ground here right now.');
      if (uf && !uf.forecast) gaps.push('Stored forecast run: none holds ' + ((u && u.name) || place) + '; answers use a live point forecast at the unit centre.');
      if (uf && uf.drought && uf.drought.arid) gaps.push('Drought: the index is not defined for this climate (too little rain in the window), so no drought level is issued.');
      if (u && !uf) gaps.push('Unit facts: the server could not read the forecast for ' + u.name + '.');
      const R = G && G.readiness;
      const RN = { scenario: 'no scenario run for the decision case', management: 'no management action recorded', ai: 'no AI decision recorded for the case', spatial: 'no spatial evidence attached', horizon: 'no decision horizon chosen', issuable: 'the report is not issuable', report_ready: 'the report is not ready' };   /* v91.17.266 · financial left with the financial content */
      const caseGaps = R ? Object.entries(RN).filter(([k]) => R[k] === false).map(([, v]) => v) : [];
      const list = gaps.filter(Boolean);
      lines.push('Before an operational advisory for ' + place + unitNote + ', this is what NIGRAAN does not have yet:');
      if (list.length) list.forEach((g, i) => lines.push('  ' + (i + 1) + '. ' + g));
      else lines.push('  Nothing is missing in the place data: every hazard has a reading, the forecast is loaded' + (near ? ', a MACH station ' + near.km + ' km away is reporting' : '') + '.');
      if (caseGaps.length) { lines.push(''); lines.push('Decision case: ' + caseGaps.join('; ') + '.' + (G && G.readinessWhy ? ' ' + G.readinessWhy : '')); }
      const have = [];
      if (levels.length) have.push('hazard levels for ' + levels.filter((x) => !x.nd).length + ' of ' + levels.length + ' hazards');
      if (G && G.hourlyLoaded) have.push('the hourly forecast' + (G.aiCorrected ? ' (AI-corrected temperatures)' : ''));
      if (near) have.push('a MACH station ' + near.km + ' km away, reading ' + (near.ageMin != null ? near.ageMin + ' min old' : 'recent'));
      if (uf && uf.drought && !uf.drought.arid) have.push('the drought indices (as of ' + uf.drought.asOf + ')');
      if (have.length) { lines.push(''); lines.push('In place: ' + have.join('; ') + '.'); }
      lines.push('An advisory also needs an authorised person to review and issue it; NIGRAAN does not issue warnings.');
      sources.push('Server: forecast store, MACH station feed, drought table');
    }
    return { answer: lines.join('\n').replace(/\n+$/, ''), notes: [LOOKUP_INTENT], sources: sources.concat([LOOKUP_SOURCE]), model: null, provider: 'retrieval', intent: kind, kind: 'explanation', firewall: { removed: 0, slots: true, rule: 'code-written' } };
  }
  /* ══ v91.17.266 · A FORECAST QUESTION GETS THE FORECAST FIRST ═════════════════════════════════════════════════════════════════
     "7 day forecast", "frecast 7 days", "rain tomorrow in Gilgit", "weather": one place, the days asked, one line per day, written by code
     from the point forecast at the place (the served chain, pointForecast) or, past its seven days, the ensemble median. How the
     numbers are made goes to the operator notes, not the answer. null when the question is not a plain forecast question. */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayLabel = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? String(iso) : DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON3[d.getUTCMonth()]; };
  const pktToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const plusDay = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const r0 = (v) => v == null || !Number.isFinite(+v) ? null : Math.round(+v);
  const r1f = (v) => v == null || !Number.isFinite(+v) ? null : Math.round(+v * 10) / 10;
  /* v91.17.283.51 g1 · the answer's grounding line names the place the question asked about (Lahore, Karachi), not the selected point */
  function askedBasis(json, facts) { try { if (!json || typeof json !== 'object' || !facts) return json; const u = facts.askedUnits && facts.askedUnits[0];
      const nm = (facts.askedPlace && facts.askedPlace.name) || (u && u.name ? u.name + (u.district && u.district !== u.name ? ', ' + u.district : '') : null);
      if (nm) json.basis = { ...(json.basis || {}), place: nm, asked: true }; } catch (_) {} return json; }
  function forecastAnswer(prompt, facts) {
    const DA = facts && facts.daysAsked; if (!DA) return null;
    if (facts.national || (facts.hazardsAsked && facts.hazardsAsked.length) || (facts.askedPlacesAlsoNamed && facts.askedPlacesAlsoNamed.length) || facts.withinPlaceSpread || facts.askedPlaceUnresolved || facts.frozenEvidence) return null;
    const q = String(prompt || '').toLowerCase();
    if (/smog|aqi|\bair\b|pm2|pm 2|pollut|season|month|monsoon|drought|sunshine|radiation|solar|urban|heat island|compare|versus|\bvs\b|history|before|ever/.test(q)) return null;
    const units = facts.askedUnits || (facts.selectedUnit ? [facts.selectedUnit] : []);
    if ((facts.askedPlace ? 1 : 0) + units.length !== 1) return null;
    const X = facts.askedPlace || units[0], notes = [];
    const title = facts.askedPlace ? X.name + (X.district ? ', ' + X.district : '') : (X.dashboardName ? X.dashboardName + ' (' + X.name + ' tehsil)' : X.name + (X.district && X.district !== X.name ? ', ' + X.district : ''));
    if (X.disputed) return { answer: title + ': disputed territory; no forecast is published here.', notes };
    const pf = facts.askedPlace ? X.forecast : (X.dailyForecast || X.liveForecast);
    const t0 = DA.from === 'tomorrow' ? plusDay(pktToday(), 1) : pktToday();
    /* v91.17.283 · WS4 · D32 · the days the panel shows come from the served hourly curve (pointDays: the point engine's PKT-day max / min,
       gust maximum and rain total of the same hourly series); the provider's daily fields only fill days the curve does not reach */
    const PD = Array.isArray(X.pointDays) ? X.pointDays.filter((d) => d.date >= t0) : [];
    const PFD = pf && Array.isArray(pf.days) ? pf.days.filter((d) => d.date >= t0) : [];
    const dates = [...new Set([...PD.map((x) => x.date), ...PFD.map((x) => x.date)])].sort();
    let days = dates.map((dt) => { const p = PD.find((x) => x.date === dt) || null, d = PFD.find((x) => x.date === dt) || {};
      return p ? { date: dt, tmax: r0(p.tmax_c), tmin: r0(p.tmin_c), rain: p.rain_mm != null ? r1f(p.rain_mm) : r1f(d.rain_mm), gust: p.gust_max_kmh != null ? r0(p.gust_max_kmh) : r0(d.gust_max_kmh), panel: true }
        : { date: dt, tmax: r0(d.tmax_c), tmin: r0(d.tmin_c), rain: r1f(d.rain_mm), gust: r0(d.gust_max_kmh) }; });
    let src = days.length ? 'point' : null;
    const O = X.outlook && Array.isArray(X.outlook.days) ? X.outlook.days.filter((d) => d.date >= t0) : [];
    if (O.length && (days.length < DA.n && O.length > days.length)) {
      days = O.map((d) => ({ date: d.date, tmax: r0(d.tmax_p10_p50_p90 && d.tmax_p10_p50_p90[1]), tmaxR: d.tmax_p10_p50_p90 ? [r0(d.tmax_p10_p50_p90[0]), r0(d.tmax_p10_p50_p90[2])] : null, tmin: r0(d.tmin_p10_p50_p90 && d.tmin_p10_p50_p90[1]), rain: r1f(d.rain_mm_p10_p50_p90 && d.rain_mm_p10_p50_p90[1]), gust: null }));
      src = 'ensemble'; }
    days = days.slice(0, DA.n);
    if (!days.length) {
      const why = (facts.askedPlace ? X.forecastUnavailable : (X.dailyForecastUnavailable || X.liveForecastUnavailable)) || 'no forecast held for these days';
      notes.push('forecast not read: ' + why);
      return { answer: 'The forecast for ' + title + ' is not available right now. Please try again in a few minutes.', notes };
    }
    if (src === 'point' && days.some((d) => d.panel)) notes.push('day values: the panel\'s day aggregate of the served hourly curve (point engine) where it reaches; the served point forecast after that');
    if (src === 'point') notes.push('day values: the served point forecast at ' + (Number.isFinite(+X.lat) ? (+X.lat).toFixed(4) + ', ' + (+X.lon).toFixed(4) : 'the place') + (pf && pf.calibration ? ' (' + pf.calibration + ')' : '') + (pf && pf.fallback ? '; ' + pf.fallback.say : ''));
    else notes.push('day values: the median of the ' + ((X.outlook && X.outlook.source) || 'ensemble') + ' members (p10-p90 in brackets)');
    if (src === 'point' && DA.n > days.length) notes.push('the point forecast runs ' + days.length + ' days; no ensemble days beyond them are held');
    const rainQ = /\b(rain|rainy|raining|rainfall|shower|showers|precip|wet)\b/.test(q) || q.split(/[^a-z]+/).some((w) => /^rain/.test(intentTok(w) || ''));
    const hazardQ = /\b(hazard|risk|alert|warning|flood|heat|smog|drought|wind|gust|air quality|aqi)\b/.test(q);
    const L = [];
    const rc = (X.rainChance && Array.isArray(X.rainChance.days)) ? X.rainChance.days : [];
    const chanceOf = (iso) => { const d = rc.find((x) => x.date === iso); return d && d.chancePct && d.chancePct.atLeast1mm != null ? d.chancePct.atLeast1mm : null; };
    const now = X.pointNow && X.pointNow.temperature_c != null ? X.pointNow : (pf && pf.now && pf.now.temperature_c != null ? { temperature_c: pf.now.temperature_c, apparent_temperature_c: pf.now.apparent_temperature_c, relative_humidity_pct: pf.now.relative_humidity_pct } : null);
    if (days.length === 1) {
      const d = days[0], when = (DA.from === 'tomorrow' ? 'tomorrow' : 'today') + ' (' + dayLabel(d.date) + ')', ch = chanceOf(d.date);
      if (rainQ) L.push('Rain ' + when + ' at ' + title + ': ' + (d.rain == null ? 'not available' : d.rain > 0 ? d.rain + ' mm expected' : 'none expected') + (ch != null ? ', ' + ch + '% chance of a rain day' : '') + '. Max ' + (d.tmax != null ? d.tmax + ' °C' : 'n/a') + ', min ' + (d.tmin != null ? d.tmin + ' °C' : 'n/a') + '.');
      else L.push(title + ', ' + when + ': max ' + (d.tmax != null ? d.tmax + ' °C' : 'n/a') + ', min ' + (d.tmin != null ? d.tmin + ' °C' : 'n/a') + ', rain ' + (d.rain != null ? d.rain + ' mm' : 'n/a') + (d.gust != null ? ', gusts ' + d.gust + ' km/h' : '') + '.');
    } else {
      const hi = days.map((d) => d.tmax).filter((v) => v != null);
      const rainTot = days.reduce((s, d) => s + (d.rain != null ? +d.rain : 0), 0);
      L.push(title + ' over the next ' + days.length + ' days: highs around ' + (hi.length ? Math.min(...hi) + '–' + Math.max(...hi) + ' °C' : 'n/a') + (rainTot > 0 ? ', about ' + Math.round(rainTot * 10) / 10 + ' mm rain in total' : ', little or no rain') + '.');
      L.push('| Day | Max °C | Min °C | Rain mm | Gusts km/h |');
      L.push('| --- | --- | --- | --- | --- |');
      for (const d of days) {
        const ch = rainQ ? chanceOf(d.date) : null;
        L.push('| ' + dayLabel(d.date) + ' | ' + (d.tmax != null ? d.tmax : '—') + ' | ' + (d.tmin != null ? d.tmin : '—') + ' | ' + (d.rain != null ? d.rain : '—') + (ch != null ? ' (' + ch + '%)' : '') + ' | ' + (d.gust != null ? d.gust : '—') + ' |');
      }
      const barOf = (v, lo, hi) => { if (v == null || !(hi > lo)) return '▁'; const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); return '▁▂▃▄▅▆▇█'[Math.round(t * 7)]; };
      if (hi.length >= 2) {
        const lo = Math.min(...hi) - 1, top = Math.max(...hi) + 1;
        L.push('Max °C: ' + days.map((d) => barOf(d.tmax, lo, top)).join(''));
      }
    }
    if (now && DA.from === 'today' && DA.n <= 3) L.push('Now: ' + r1f(now.temperature_c) + ' °C' + (now.apparent_temperature_c != null ? ', feels like ' + r1f(now.apparent_temperature_c) + ' °C' : '') + (now.relative_humidity_pct != null ? ', humidity ' + r0(now.relative_humidity_pct) + '%' : '') + '.');
    /* Keep hazard / air notes short: only raised levels, and only when the question asks about risk/hazards or nothing else is left. */
    const ML = X.mapLevels && Array.isArray(X.mapLevels.days) ? X.mapLevels.days.filter((d) => days.some((x) => x.date === d.date))
      : (X.servedUnit && X.servedUnit.mapLevels && Array.isArray(X.servedUnit.mapLevels.days) ? X.servedUnit.mapLevels.days.filter((d) => days.some((x) => x.date === d.date)) : []);
    const W0 = SCALE_WORDS()[0] || 'Normal';
    const plainHz = (n) => String(n || '').replace(/\s*\((?:DI|NWS|UTCI|GLOF|D\d|D0[^)]*)\)/g, '').replace(/\s{2,}/g, ' ').trim();
    const SKIP = /runoff retention|heat index band/i;
    const raised = (level) => { const lv = String(level || ''); return !!(lv && lv !== W0 && !/^normal\b/i.test(lv) && /^(Low|Moderate|High|Severe)\b/i.test(lv)); };
    const upM = new Map(); for (const d of ML) for (const h of d.hazards || []) if (raised(h.level) && !SKIP.test(h.hazard || '')) { const k = plainHz(h.hazard) + ' ' + String(h.level).split(/[,(]/)[0].trim() + (h.productType && /indicative/i.test(h.productType) ? ' (indicative)' : ''); (upM.get(k) || upM.set(k, []).get(k)).push(d.date); }
    const dayRun = (ds) => { const u = [...new Set(ds)].sort(), run = u.length > 2 && u.every((x, i) => !i || Date.parse(x) - Date.parse(u[i - 1]) === 864e5);
      return run ? dayLabel(u[0]) + ' to ' + dayLabel(u[u.length - 1]) : u.length > 1 ? u.slice(0, -1).map(dayLabel).join(', ') + ' and ' + dayLabel(u[u.length - 1]) : dayLabel(u[0]); };
    const up = [...upM].map(([k, ds]) => k + ' on ' + dayRun(ds));
    if (up.length) L.push('Watch: ' + up.slice(0, 4).join('; ') + '.');
    else if (hazardQ && ML.length) L.push('Hazard levels on the map stay at ' + W0 + ' for these days.');
    { const AQ = (X.placeSummary && X.placeSummary.air) || (facts.placeSummary && !facts.askedPlace && facts.placeSummary.air) || null;
      const ad = AQ && AQ.raises ? (AQ.days || []).filter((z) => days.some((x) => x.date === z.date)) : [];
      if (ad.length) { const ord = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'], worst = ad.reduce((a, z) => (ord.indexOf(z.category) > ord.indexOf(a.category) ? z : a)), aqi = ad.map((z) => z.aqi).filter((v) => v != null);
        L.push('Air quality: ' + String(worst.category).toLowerCase() + (aqi.length ? ' (AQI up to ' + Math.max(...aqi) + ')' : '') + ' on ' + dayRun(ad.map((z) => z.date)) + '.'); }
      else if (hazardQ && AQ && AQ.assessed) L.push('Air quality: ' + String(AQ.worst || 'good').toLowerCase() + ' on these days.'); }
    if (X.urbanUnit && X.urbanUnit.tehsil && facts.askedPlace) notes.push('tehsil products for ' + X.urbanUnit.tehsil);
    return { answer: L.join('\n'), notes };
  }
  function hazardBriefAnswer(prompt, facts) {
    const q = String(prompt || '').toLowerCase();
    if (!/\b(hazard|hazards|risk|risks|alert|alerts|warning|warnings)\b/.test(q)) return null;
    /* Combined weather+hazard questions belong to forecastAnswer / the model, not this short hazard table. */
    if (/\b(weather|forecast|temperature|outlook|brief me|now and|over the next)\b/.test(q)) return null;
    if (facts.national || facts.askedPlaceUnresolved || facts.frozenEvidence) return null;
    if (facts.hazardsAsked && facts.hazardsAsked.length) return null; /* named hazard path below handles that */
    const units = facts.askedUnits || (facts.selectedUnit ? [facts.selectedUnit] : []);
    /* Prefer the named point when a tehsil is also resolved (e.g. "I-8 Islamabad"). */
    const X = facts.askedPlace || units[0];
    if (!X) return null;
    const title = facts.askedPlace ? X.name + (X.district ? ', ' + X.district : '') : (X.dashboardName || X.name);
    const W0 = SCALE_WORDS()[0] || 'Normal';
    const plainHz = (n) => String(n || '').replace(/\s*\((?:DI|NWS|UTCI|GLOF|D\d|D0[^)]*)\)/g, '').replace(/\s{2,}/g, ' ').trim();
    const SKIP = /runoff retention|heat index band/i;
    const raisedOf = (level) => {
      const lv = String(level || '');
      if (!lv || lv === W0 || /^normal\b/i.test(lv) || /^not /i.test(lv) || /cannot happen/i.test(lv) || /data missing/i.test(lv) || /^like /i.test(lv) || /^below /i.test(lv)) return false;
      return /^(Low|Moderate|High|Severe)\b/i.test(lv) || SCALE_WORDS().includes(lv);
    };
    const ML = (X.mapLevels && Array.isArray(X.mapLevels.days) ? X.mapLevels.days : null)
      || (X.servedUnit && X.servedUnit.mapLevels && Array.isArray(X.servedUnit.mapLevels.days) ? X.servedUnit.mapLevels.days : null)
      || [];
    const today = pktToday();
    const days = ML.filter((d) => d.date >= today).slice(0, 3);
    const src = days.length ? days : ML.slice(0, 1);
    const upM = new Map();
    for (const d of src) for (const h of d.hazards || []) {
      if (!raisedOf(h.level) || SKIP.test(h.hazard || '')) continue;
      const levelWord = String(h.level).split(/[,(]/)[0].trim();
      const k = plainHz(h.hazard) + ' · ' + levelWord;
      (upM.get(k) || upM.set(k, []).get(k)).push(d.date);
    }
    const dayRun = (ds) => { const u = [...new Set(ds)].sort(); return u.length > 1 ? dayLabel(u[0]) + ' to ' + dayLabel(u[u.length - 1]) : dayLabel(u[0]); };
    const L = [];
    if (upM.size) {
      L.push('At ' + title + ', watch:');
      L.push('| Hazard | Level | When |');
      L.push('| --- | --- | --- |');
      for (const [k, ds] of [...upM].slice(0, 8)) {
        const [name, level] = k.split(' · ');
        L.push('| ' + name + ' | ' + level + ' | ' + dayRun(ds) + ' |');
      }
    } else if (src.length) L.push('At ' + title + ', assessed hazards on the map are at ' + W0 + ' for the next few days.');
    else L.push('At ' + title + ', no hazard levels are available to summarise right now.');
    const AQ = (X.placeSummary && X.placeSummary.air) || null;
    if (AQ && AQ.raises) {
      const ad = (AQ.days || []).slice(0, 3);
      if (ad.length) {
        const ord = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'];
        const worst = ad.reduce((a, z) => (ord.indexOf(z.category) > ord.indexOf(a.category) ? z : a));
        const aqi = ad.map((z) => z.aqi).filter((v) => v != null);
        L.push('Air quality: ' + String(worst.category).toLowerCase() + (aqi.length ? ' (AQI up to ' + Math.max(...aqi) + ')' : '') + '.');
      }
    } else if (AQ && AQ.assessed) L.push('Air quality: ' + String(AQ.worst || 'good').toLowerCase() + '.');
    return { answer: L.join('\n'), notes: ['hazard brief from served map levels'] };
  }
  function retrieval(prompt, facts) {
    /* v91.17.266 · a plain forecast question: the day-by-day answer, nothing else */
    /* v91.17.283.52 D · N14: a general question about a place ("tell me about Karachi", "is Karachi at risk") gets the plain place answer (the
       next 3 days, levels, air quality), not the raw fact dump (ISO times, rank correlations, method citations, m³/m³) */
    { const hb = hazardBriefAnswer(prompt, facts); if (hb) return { answer: hb.answer, notes: hb.notes, sources: ['Served hazard levels', LOOKUP_SOURCE], model: null, provider: 'retrieval', kind: 'explanation' }; }
    { let fa = forecastAnswer(prompt, facts); if (!fa && (facts.askedPlace || facts.askedUnits) && !facts.national && !(facts.hazardsAsked && facts.hazardsAsked.length) && /\b(tell me|about|how is|how's|what is it like|overview|situation|conditions|risk|risky|safe|status|update|weather|forecast)\b/i.test(prompt))
      fa = forecastAnswer(prompt, { ...facts, daysAsked: facts.daysAsked || { n: 3, from: 'today' }, askedPlacesAlsoNamed: null, withinPlaceSpread: null, ...(facts.askedPlace ? { askedUnits: null, selectedUnit: null } : {}) });   /* "Islamabad I-8": a point and its tehsil named together: the point answers */ if (fa) return { answer: fa.answer, notes: fa.notes, sources: [(facts.askedPlace ? 'Point forecast at ' + facts.askedPlace.name : 'Forecast for ' + ((facts.askedUnits && facts.askedUnits[0] && facts.askedUnits[0].name) || (facts.selectedUnit && (facts.selectedUnit.dashboardName || facts.selectedUnit.name)) || 'the place')), LOOKUP_SOURCE], model: null, provider: 'retrieval', kind: 'explanation' }; }
    const notes = [];
    const units = facts.askedUnits || (facts.selectedUnit ? [facts.selectedUnit] : []);
    const q = prompt.toLowerCase(); const lines = [];
    if (facts.national) {
      const nl = nationalLines(facts.national);
      if (!units.length) return { answer: nl.join('\n'), notes: [LOOKUP_NOTE],
        sources: ['National tables on this server' + (facts.national.hazards.drought ? ': drought engine' : '') + (facts.national.hazards.glof ? ', glacial-lake levels' : '') + (facts.national.riverReaches ? ', river reaches' : ''), ...(Object.keys(facts.national.hazards).some((k) => PAGE_NATIONAL[k] || Object.values(PAGE_NATIONAL).includes(k)) ? ['Dashboard hazard engine (national levels attached by the page)'] : []), LOOKUP_SOURCE],
        model: null, provider: 'retrieval', national: true, ...(nationalNeed(facts.national) ? { needNational: nationalNeed(facts.national) } : {}) };
      lines.push(...nl, '');
    }
    /* ══ v91.17.13 · ASK THE PAGE FOR THE VERDICT IT ALREADY HOLDS ═══════
       Place resolution happens here; hazard scoring happens in the page. Each
       lives in exactly one place, so neither is duplicated and neither can
       disagree with itself. When a hazard is asked for and no verdict came
       with the question, the response names the hazards and the units this
       side resolved, and the page re-asks with its own engine's answer. */
    const needHazard = (() => {
      const asked = facts.hazardsAsked || [];
      if (!asked.length) return null;
      const have = new Set((facts.hazardVerdicts || []).map((v) => v.hazard));
      /* v91.17.283 · WS4 · a hazard the served levels hold needs nothing from the page */
      for (const x of units.concat(facts.askedPlace && facts.askedPlace.servedUnit ? [facts.askedPlace.servedUnit] : [])) for (const d of ((x && x.mapLevels && x.mapLevels.days) || [])) for (const z of d.hazards || []) have.add(z.layer);
      const missing = asked.filter((h) => h !== 'drought' && !(HAZARD_LAYERS[h] || [h]).some((l) => have.has(l)));
      if (!missing.length) return null;
      const seen = new Set(), list = [];
      const add = (name, unitId) => { const k = String(name || '').trim(); if (!k || seen.has(k)) return; seen.add(k); list.push({ key: k, unitId: unitId || null }); };
      for (const u of units) add(u.name, u.unitId);
      const P = facts.askedPlace;
      if (P) { if (P.droughtUnit) add(P.droughtUnit.tehsil, P.droughtUnit.unitId); if (P.urbanUnit) add(P.urbanUnit.tehsil, P.urbanUnit.unitId); }
      for (const O of (facts.otherAskedPlaces || [])) { if (O.droughtUnit) add(O.droughtUnit.tehsil, O.droughtUnit.unitId); if (O.urbanUnit) add(O.urbanUnit.tehsil, O.urbanUnit.unitId); }
      if (!list.length) return null;
      return { hazards: missing, layers: missing.flatMap((h) => HAZARD_LAYERS[h] || [h]), units: list.slice(0, 12) };
    })();
    /* v91.17.6 · a named place that is not an AGN unit. This is the branch that
       used to fall through to whatever was selected on screen. */
    if (facts.askedPlaceUnresolved) {
      const a = facts.askedPlaceUnresolved;
      return { answer: (a.lookupFailed
          ? 'The place lookup failed on this server, so I cannot say anything about "' + a.asked + '" — including whether it exists.\n\nThe failure: ' + ((facts.placeResolution && facts.placeResolution[0] && facts.placeResolution[0].error) || 'unknown') + '. Try again in a moment.'
          : 'I could not find "' + a.asked + '" in Pakistan.\n\nSearched: NIGRAAN\'s place table (places, tehsils, districts and provinces of Pakistan). Name a nearby larger settlement or the district and I will answer for that.')
        + '\n\nI have not answered for any other place'
          + (facts.dashboardSelectionIgnored ? ' — ' + facts.dashboardSelectionIgnored.name + ' is only what is selected on screen, not an answer to your question.' : '.'),
        sources: ['NIGRAAN place table'], model: null, provider: 'retrieval' };
    }
    /* ══ v91.17.13 · THE HAZARD ASKED ABOUT GOES FIRST ══════════════════
       Before any forecast. A person who asked "is there a GLOF risk in
       Chitral" and reads three paragraphs of temperature before anything
       about GLOF has been given a different answer to the one they asked
       for, even if the right words appear further down. */
    /* ══ v91.17.283 · WS4 · item 8 · THE HAZARD ASKED ABOUT IS ANSWERED FROM THE SERVED LEVELS ═════════════════════════════
       Since v91.17.106 the server engine derives every level; served.mjs applies the gate's client rules (owner decisions A and B) and
       is the function the console and start page read. A hazard question is answered from it: the level word per day with its
       product type, "Not assessed" with the reason where no level is held (never Normal, never a 0-100 score for a client). Only a
       hazard the engine does not derive (seismic zone, cyclone climatology) falls back to the page's categorical verdict, without a score. */
    if (facts.hazardsAsked && facts.hazardsAsked.length) {
      const asked = facts.hazardsAsked;
      const V = facts.hazardVerdicts || [];
      const answered = [];
      const servedSets = units.filter((x) => x && x.mapLevels && Array.isArray(x.mapLevels.days)).map((x) => ({ name: x.name, ML: x.mapLevels }))
        .concat(facts.askedPlace && facts.askedPlace.servedUnit && facts.askedPlace.servedUnit.mapLevels && Array.isArray(facts.askedPlace.servedUnit.mapLevels.days)
          ? [{ name: facts.askedPlace.name + ' (' + facts.askedPlace.servedUnit.tehsil + ' tehsil)', ML: facts.askedPlace.servedUnit.mapLevels }] : []);
      for (const h of asked) {
        const ids = HAZARD_LAYERS[h] || [h];
        let any = false;
        for (const S of servedSets) {
          for (const id of ids) {
            const per = S.ML.days.map((d) => ({ date: d.date, x: (d.hazards || []).find((z) => z.layer === id) })).filter((r) => r.x);
            if (!per.length) continue;
            any = true;
            const today = per[0], rest = per.slice(1);
            const ph = (x) => x.level === 'Not assessed' ? 'Not assessed (' + x.notAssessedWhy + ')' : x.level + (x.productType ? ' (' + x.productType.toLowerCase() + (x.raisesNoAlert ? ', raises no alert' : '') + ')' : '');
            lines.push(S.name + ' — ' + (per[0].x.hazard || HAZARD_LABEL[h]) + ': ' + dayLabel(today.date) + ' ' + ph(today.x)
              + (rest.length ? '; ' + rest.map((r) => dayLabel(r.date) + ' ' + ph(r.x)).join('; ') : '') + '.');
            if (per[0].x.basis) lines.push('  ' + per[0].x.basis + '.');
          }
          const hid = (S.ML.hidden || []).filter((z) => ids.includes(z.layer));
          for (const z of hid) lines.push('  ' + (LAYER_NAME[z.layer] || z.layer) + ': not shown. ' + z.why);
          if (S.ML.stale) lines.push('  These levels are from the last engine run (' + S.ML.computedAt + '), which is older than the engine’s own freshness rule.');
        }
        if (!any) {
          const rows = V.filter((v) => ids.includes(v.hazard));
          for (const v of rows) {
            any = true;
            if (v.notApplicable) { lines.push(v.unit + ' — ' + HAZARD_LABEL[h] + ': not assessed here.' + (v.why ? ' ' + v.why : '')); continue; }
            if (v.categorical && v.band) { lines.push(v.unit + ' — ' + HAZARD_LABEL[h] + ': ' + v.band + (v.day ? ', ' + v.day : '') + '.'); lines.push('  A design-basis zone, not a forecast level.'); }
            else if (INTERNAL() && (v.publishedScore != null || v.score != null)) lines.push(v.unit + ' — ' + HAZARD_LABEL[h] + ': screening index ' + (v.publishedScore != null ? v.publishedScore : v.score) + ' / 100 (operator view).');
            else lines.push(v.unit + ' — ' + HAZARD_LABEL[h] + ': not assessed in the served levels for this place.');
          }
        }
        if (any) { answered.push(h); lines.push(''); }
      }
      const missing = asked.filter((h) => !answered.includes(h));
      const trulyMissing = missing.filter((h) => h !== 'drought' || !units.some((x) => x.drought));
      if (trulyMissing.length) {
        lines.push(trulyMissing.map((h) => HAZARD_LABEL[h].replace(/^./, (c) => c.toUpperCase())).join(' and ') + ': not assessed for this place in the served levels'
          + (servedSets.length ? '' : ' (no served hazard levels are held for the place asked)') + '. No level is given rather than a guessed one.');
        lines.push('  Anything below is the weather at the place you named. It is NOT a ' + trulyMissing.map((h) => HAZARD_LABEL[h]).join(' or ') + ' assessment.');
        lines.push('');
      }
    }
    if (facts.askedPlace) {
      const P = facts.askedPlace, F = P.forecast;
      lines.push(P.name + (P.district ? ', ' + P.district : '') + (P.province ? ', ' + P.province : '')
        + ' — ' + P.lat.toFixed(4) + ' N, ' + P.lon.toFixed(4) + ' E'
        + (P.gazetteerElevationM != null ? ', ' + P.gazetteerElevationM + ' m' : '')
        + (F && F.providerElevationM != null && P.gazetteerElevationM != null && Math.abs(F.providerElevationM - P.gazetteerElevationM) > 50 ? ' (the forecast model runs this point at ' + F.providerElevationM + ' m)' : ''));
      if (!F) { lines.push('The forecast for it is not available right now.'); notes.push('forecast not read: ' + (P.forecastUnavailable || 'unknown reason')); }
      else {
        const n = F.now || {};
        if (n.temperature_c != null) lines.push('Now (' + (n.time || '') + ' local): ' + n.temperature_c + ' °C'
          + (n.apparent_temperature_c != null ? ', feels like ' + n.apparent_temperature_c + ' °C' : '') + (n.utci_shade_c != null ? ', thermal stress (UTCI) ' + (n.utci_sun_c != null ? n.utci_sun_c + ' °C in the sun (estimated), ' : '') + n.utci_shade_c + ' °C in shade: ' + String(n.utci_class || '').toLowerCase() : '')
          + (n.relative_humidity_pct != null ? ', ' + n.relative_humidity_pct + '% RH' : '')
          + (n.precipitation_mm_h != null ? ', rain ' + n.precipitation_mm_h + ' mm/h' : '')
          + (n.wind_speed_kmh != null ? ', wind ' + n.wind_speed_kmh + ' km/h' + (n.wind_gusts_kmh != null ? ' (gusts ' + n.wind_gusts_kmh + ')' : '') : '') + '.');
        for (const d of (F.days || []).slice(0, 7)) lines.push('  ' + d.date + ': max ' + d.tmax_c + ' °C, min ' + d.tmin_c + ' °C, rain ' + d.rain_mm + ' mm, gusts to ' + d.gust_max_kmh + ' km/h');
      }
      { const qlow = String(prompt || '').toLowerCase();   /* v91.17.101 · chances, GLOF level and past events for the tehsil the point falls in */
        if (P.rainChance && /\b(rain|chance|likely|confiden|sure|certain|heavy|wet)\b/.test(qlow)) lines.push('Rain chances for ' + P.rainChance.unit + ' tehsil (calibrated against satellite rain; a chance, not a certainty): ' + P.rainChance.days.slice(0, 3).map(d => d.date + ' ' + (d.chancePct.atLeast1mm != null ? d.chancePct.atLeast1mm + '% rain day' : 'withheld') + (d.chancePct.atLeast10mm != null ? ', ' + d.chancePct.atLeast10mm + '% 10 mm+' : '')).join(' · ') + '.');
        if (P.glof && /\b(glof|glacial|lake|outburst|burst)\b/.test(qlow)) lines.push(P.glof.level ? 'Glacial lake level for ' + P.glof.unit + ': ' + P.glof.level + (P.glof.text ? ' — ' + P.glof.text : '') + '.' : 'Glacial lakes upstream of ' + P.glof.unit + ' (site context, not a warning level; ' + GLOF_NO_LEVEL.split(';')[0] + ')' + (P.glof.text ? ': ' + P.glof.text : '') + '.');
        if (P.pastEvents && (/\b(before|history|past|last|ever|previous|flooded|landslides?|burst|outburst|happened)\b/.test(qlow) || hazardsAsked(qlow).length)) lines.push('What happened in ' + P.pastEvents.unit + ' before: ' + P.pastEvents.events.slice(0, 5).join('; ') + '.'); }
      if (P.splitNote) lines.push(P.splitNote);
      if (P.otherPlacesWithThisName && P.otherPlacesWithThisName.length) lines.push('Another place shares this name: ' + P.otherPlacesWithThisName.map((o) => o.name + (o.district ? ', ' + o.district : '') + (o.elevM != null ? ' (' + o.elevM + ' m)' : '')).join('; ') + '. Say which you meant if this is the wrong one.');
      notes.push(P.productNote);   /* v91.17.266 · method note: operator view only */
      /* ══ v91.17.11 · THE RETRIEVAL PATH HAS TO DO THE COMPARISON ITSELF ════
         This install has no language model key, so what the reader sees is
         assembled here, not written by a model. A question naming two places
         was answered with one forecast for the first because this block only
         ever printed facts.askedPlace. Both halves are printed now, and the
         part that actually separates two sectors of one city - the morphology
         - is printed with them. */
      const others = facts.askedPlacesAlsoNamed || [];
      for (const O of others) {
        lines.push('');
        lines.push(O.name + (O.district ? ', ' + O.district : '') + ' — ' + O.lat.toFixed(4) + ' N, ' + O.lon.toFixed(4) + ' E');
        const g = O.forecast && O.forecast.now;
        if (g && g.temperature_c != null) lines.push('Now: ' + g.temperature_c + ' °C'
          + (g.apparent_temperature_c != null ? ', feels like ' + g.apparent_temperature_c + ' °C' : '') + (g.utci_shade_c != null ? ', thermal stress (UTCI) ' + (g.utci_sun_c != null ? g.utci_sun_c + ' °C in the sun (estimated), ' : '') + g.utci_shade_c + ' °C in shade: ' + String(g.utci_class || '').toLowerCase() : '')
          + (g.relative_humidity_pct != null ? ', ' + g.relative_humidity_pct + '% RH' : '') + '.');
        else if (O.forecastUnavailable) { lines.push('The forecast for it is not available right now.'); notes.push('forecast not read for ' + O.name + ': ' + O.forecastUnavailable); }
      }
      const withUrban = [P].concat(others).filter((x) => x.urbanMorphology && x.urbanMorphology.urban);
      for (const X of [P].concat(others)) {
        const uu = X.urbanUnit; if (!uu) continue;
        const pt = X.urbanMorphology && X.urbanMorphology.urban ? X.urbanMorphology.heatIslandMaxC : null;
        if (pt != null && Math.abs(pt - uu.popWeightedC) < 0.6) continue;   /* the point already represents it */
        lines.push('');
        lines.push('Across ' + uu.tehsil + ' tehsil the heat island is ' + sgn(uu.popWeightedC)
          + ' °C for the average resident, ranging over ' + uu.spreadC + ' °C between its ' + uu.cells.toLocaleString('en')
          + ' built cells, up to ' + sgn(uu.maxC) + ' °C at ' + uu.warmestCell.lat + ', ' + uu.warmestCell.lon + '.');
        if (pt != null) lines.push('  The point named above sits at ' + sgn(pt) + ' °C, which is that one 270 m cell, not the place.');
      }
      if (withUrban.length) {
        lines.push('');
        lines.push(withUrban.length > 1
          ? 'Urban form at these points — this is what separates them, and the forecast grid cannot:'
          : 'Urban form at this point — the grid forecast above is one value for a box far larger than this:');
        for (const X of withUrban) {
          const u = X.urbanMorphology;
          lines.push('  ' + X.name + ': ' + Math.round(u.builtSurfaceFraction * 100) + '% built, mean building height '
            + u.meanBuildingHeightM + ' m, NDVI ' + (u.ndvi == null ? 'no data' : u.ndvi)
            + ', ' + u.populationPerKm2.toLocaleString('en') + ' people/km²'
            + (u.localClimateZone ? ', local climate zone ' + u.localClimateZone : '')
            + ' — canyon H/W ' + u.canyonAspectRatio + ', sky view ' + u.skyViewFactor
            + ', night heat-island potential ' + sgn(u.heatIslandMaxC) + ' °C'
            + (u.heatIslandNowC != null ? ' (right now ' + sgn(u.heatIslandNowC) + ' °C, '
                + (u.hoursFromSunset < 0 ? (-u.hoursFromSunset).toFixed(1) + ' h before sunset — the urban COOL island of the late morning'
                                         : u.hoursFromSunset.toFixed(1) + ' h after sunset') + ')' : ''));
        }
        if (withUrban.length > 1) {
          const sorted = withUrban.slice().sort((a, b) => b.urbanMorphology.heatIslandMaxC - a.urbanMorphology.heatIslandMaxC);
          const hi = sorted[0], lo = sorted[sorted.length - 1];
          const d = +(hi.urbanMorphology.heatIslandMaxC - lo.urbanMorphology.heatIslandMaxC).toFixed(2);
          lines.push('');
          const _uv = uhiVerdict();
          if (uhiRanked()) lines.push('So: ' + hi.name + ' runs about ' + d + ' °C warmer than ' + lo.name
            + ' on a still night, from urban form alone. The forecast above gives them nearly the same air temperature because they sit in the same model grid box — that agreement is a property of the grid, not a finding about the two places.');
          else lines.push('So: ' + hi.name + ' has the denser, hotter urban form of the two (modelled potential ' + d + ' °C higher than ' + lo.name
            + '). Treat that as a ranking of urban form, not a measured temperature gap: checked at ' + (_uv ? _uv.stations : 'the') + ' AGN weather stations against the rural airport, the model does not yet put them in the observed order'
            + (_uv ? ' (rank correlation ' + _uv.spearman + ')' : '') + '. The forecast above gives them nearly the same air temperature because they sit in the same model grid box.');
        }
        notes.push('Heat-island potential is an amount ON TOP of the grid forecast, not an air temperature and not a forecast. Built surface and height are GHSL 2025 at about 270 m, vegetation is MODIS NDVI for August 2026, and the magnitude is calibrated against two urban/rural station pairs, Rawalpindi and Lahore, 49,555 hours. Both pairs sit at a street aspect ratio near 0.47, so a dense city core is still an extrapolation. The difference between two places is better supported than the value at either.');
      } else if (P.urbanMorphology && P.urbanMorphology.urban === false) {
        lines.push('No urban heat island here: ' + P.urbanMorphology.why);
      }
      for (const X of [P].concat(others)) {
        const dr = X.drought; if (!dr) continue;
        lines.push('');
        lines.push('Drought at ' + X.name + (X.droughtUnit ? ' (' + X.droughtUnit.tehsil + ' tehsil)' : '') + ', as of ' + dr.asOf + ':');
        /* v91.17.36 · AUDIT R-11 · an arid refusal is printed in the server's own words, and the
           soil percentile is not offered as a drought fact where the indices are not defined */
        if (dr.arid) { lines.push('  Drought index not defined for this climate: ' + (dr.aridWhy || 'the window\'s climatological rainfall is under 10 mm')); lines.push('  No drought class is issued for this unit; this is not a data gap.'); continue; }
        const row = (lab, v, cls, extra) => lines.push('  ' + lab + ': ' + (v == null ? (((dr.refusals || {})[lab.startsWith('SPEI') ? 'spei90' : 'spi90']) || 'not fitted here') : (sgn(v) + (cls ? ' — ' + cls : '') + (extra || ''))));
        row('SPI-90 (rainfall anomaly)', dr.spi90, dr.spi90Class, dr.rain90mm != null ? (', ' + dr.rain90mm + ' mm in 90 days') : '');
        row('SPEI-90 (rainfall minus evaporation)', dr.spei90, dr.spei90Class, dr.waterBalance90mm != null ? (', ' + dr.waterBalance90mm + ' mm water balance') : '');
        row('SPI-30', dr.spi30, null, '');
        if (dr.rootZonePercentile != null)
          lines.push('  Root-zone soil moisture: ' + dr.rootZoneSoilMoisture + ' m³/m³, the ' + ord(dr.rootZonePercentile)
            + ' percentile of this unit’s own record for this time of year');
        if (dr.spi90 != null && dr.rootZonePercentile != null && dr.spi90 <= -1 && dr.rootZonePercentile >= 40)
          lines.push('  These disagree, and that is the finding: the rain has been well below normal while the root zone is not short of water. Irrigation, recent rain or antecedent storage is covering the deficit.');
        else if (dr.spi90 != null && dr.rootZonePercentile != null && dr.spi90 > -0.5 && dr.rootZonePercentile <= 20)
          lines.push('  These disagree, and that is the finding: rainfall has been near normal and the root zone is still dry. Heat, demand or drainage, not a rainfall deficit.');
        lines.push('  ' + dr.basis);
      }
      /* same gate the unit branch uses: only when the question asked for it.
         Without it, "temperature in Lahore" printed a five-day PM2.5 table. */
      const wantAirHere = /smog|aqi|air|pm2|pm 2|pollut|fog|haze|dust/.test(q);
      for (const X of (wantAirHere ? [P].concat(facts.askedPlacesAlsoNamed || []) : [])) {
        const sm = X && X.airAndSmog; if (!sm) continue;
        lines.push('');
        lines.push('Air and smog at ' + X.name + (sm.unit ? ' (' + sm.unit.tehsil + ' tehsil)' : '') + ', next 5 days (' + sm.source + '):');
        for (const d of sm.days) lines.push('  ' + d.date + ': PM2.5 ' + d.pm25_ugm3 + ' \u00b5g/m\u00b3 (' + d.pm25_class + ', AQI ' + d.us_aqi_max + (d.aqi_category ? ' ' + d.aqi_category : '') + '), dispersion ' + d.dispersion + (d.inversion_hours ? ', morning inversion ' + d.inversion_hours + ' h' : '') + (d.fog_hours ? ', fog risk ' + d.fog_hours + ' h' : '') + (d.smog_day ? ' - SMOG DAY' : ''));
        lines.push('  ' + sm.note + '.');
      }
      if (facts.dashboardSelectionIgnored) lines.push('Note: ' + facts.dashboardSelectionIgnored.name + ' is selected on screen. It is not part of this answer.');
      if (!units.length) return { answer: lines.join('\n'), notes: notes.concat([LOOKUP_NOTE]),
        sources: ['NIGRAAN place table: ' + P.source, 'MACH point forecast at ' + P.lat.toFixed(4) + ', ' + P.lon.toFixed(4)]
          .concat((facts.askedPlacesAlsoNamed || []).map((O) => 'MACH point forecast at ' + O.lat.toFixed(4) + ', ' + O.lon.toFixed(4)))
          .concat(withUrban.length ? ['Urban morphology: GHSL GHS-BUILT-S/V and GHS-POP 2025, MODIS NDVI, WUDAPT local climate zones'] : [])
          .concat([LOOKUP_SOURCE]), model: null, provider: 'retrieval', needHazard };
      lines.push('');   /* both a unit and a settlement were asked about */
    }
    const want = { t: /temp|hot|cold|heat|°|degree/.test(q), r: /rain|precip|wet|shower/.test(q), w: /wind|gust|storm/.test(q), h: /humid/.test(q) };
    want.a = /smog|aqi|air|pm2|pm 2|pollut|fog|haze|dust/.test(q);
    want.z = /season|month|subseasonal|sub-seasonal|weeks ahead|next month|winter|summer|monsoon/.test(q);
    want.o = !want.z && /week|outlook|days|chance|probab|ensemble|next \d+|10.?day|15.?day|fortnight/.test(q); want.s = /sun|cloud|radiation|solar|satellite/.test(q);
    const any = !want.t && !want.r && !want.w && !want.h && !want.o && !want.s && !want.z && !want.a;
    const lab = (L) => L === '0' ? 'now' : '+' + L + ' h';
    for (const u of units) {
      if (u.disputed) { lines.push(u.name + ': disputed territory, no meteorological product is published.'); continue; }
      if (want.o && u.outlook) {
        lines.push(u.name + ' (' + u.district + ') - ensemble outlook, ' + u.outlook.source + ':');
        for (const d of u.outlook.days) {
          const CHN = { tx40: 'max ≥40 °C', tx45: 'max ≥45 °C', tn30: 'night ≥30 °C', tn0: 'frost below 2,000 m', sn10: 'snow ≥10 cm', pr10: 'rain ≥10 mm', pr25: 'rain ≥25 mm', pr50: 'rain ≥50 mm', pr100: 'rain ≥100 mm', gu60: 'gusts ≥60 km/h' };   /* v91.17.278 · FIX278 1: a threshold with no plain name is left out, never printed by its key */
          const ch = Object.entries(d.chance_pct || {}).filter(([k, v]) => v >= 10 && CHN[k]).map(([k, v]) => CHN[k] + ' ' + v + '%');
          lines.push('  ' + d.date + ': max ' + (d.tmax_p10_p50_p90 ? d.tmax_p10_p50_p90[1] + ' °C (' + d.tmax_p10_p50_p90[0] + '–' + d.tmax_p10_p50_p90[2] + ')' : 'n/a') + ', min ' + (d.tmin_p10_p50_p90 ? d.tmin_p10_p50_p90[1] + ' °C' : 'n/a') + ', rain ' + (d.rain_mm_p10_p50_p90 ? d.rain_mm_p10_p50_p90[1] + ' mm (wet case ' + d.rain_mm_p10_p50_p90[2] + ')' : 'n/a') + (ch.length ? ' · chance: ' + ch.join(', ') : ''));
        }
      }
      if (want.a && u.airAndSmog) {
        lines.push(u.name + ' - air and smog, next 5 days (' + u.airAndSmog.source + '):');
        for (const d of u.airAndSmog.days) lines.push('  ' + d.date + ': PM2.5 ' + d.pm25_ugm3 + ' µg/m³ (' + d.pm25_class + ', AQI ' + d.us_aqi_max + (d.aqi_category ? ' ' + d.aqi_category : '') + '), dispersion ' + d.dispersion + (d.inversion_hours ? ', morning inversion ' + d.inversion_hours + ' h' : '') + (d.fog_hours ? ', fog risk ' + d.fog_hours + ' h' : '') + (d.smog_day ? ' - SMOG DAY' : ''));
      }
      if (want.z && u.weeksAndSeason) {
        const Z = u.weeksAndSeason;
        lines.push(u.name + ' - weeks-ahead outlook (vs its own normal): ' + Z.weeksAhead.map(w => w.week_start + ' ' + (w.temp_anomaly_c > 0 ? '+' : '') + w.temp_anomaly_c + ' °C (' + w.chance_over_1c_pct + '% >+1 °C), rain ' + (w.rain_anomaly_mm > 0 ? '+' : '') + w.rain_anomaly_mm + ' mm').join(' · '));
        lines.push(u.name + ' - season-ahead outlook: ' + Z.seasonAhead.map(m => m.month + ' ' + m.mean_temp_c + ' °C (' + (m.temp_anomaly_c > 0 ? '+' : '') + m.temp_anomaly_c + '), rain ' + Math.round(m.rain_mm) + ' mm (' + (m.rain_anomaly_pct > 0 ? '+' : '') + m.rain_anomaly_pct + '%)').join(' · '));
        lines.push('  ' + Z.note + '.');
      }
      if (want.s && u.sunshineToday) lines.push(u.name + ' sunshine today so far: satellite ' + u.sunshineToday.satellite_mj + ' MJ/m² vs model ' + u.sunshineToday.model_mj + ' MJ/m² (ratio ' + u.sunshineToday.ratio + ') - ' + u.sunshineToday.reading + '.');
      if ((want.o || want.s || want.z || want.a) && !want.t && !want.r && !want.w && !want.h) continue;
      if (!u.forecast) {
        const L = u.liveForecast || u.dailyForecast;
        if (!L) { lines.push(u.name + ': the forecast is not available right now.'); notes.push('no stored run and no live forecast for ' + u.name + (u.liveForecastUnavailable ? ': ' + u.liveForecastUnavailable : '')); continue; }
        const P0 = u.pointNow;   /* v91.17.283.12 · "now" is the point state when held, never a second point forecast */
        const n = P0 && P0.temperature_c != null ? { time: P0.time, temperature_c: P0.temperature_c, apparent_temperature_c: P0.apparent_temperature_c, utci_shade_c: P0.utci_shade_c, utci_class: P0.utci_class, relative_humidity_pct: P0.relative_humidity_pct, wind_speed_kmh: P0.wind_kmh } : (L.now || {});
        lines.push(u.name + ' (' + u.district + ') — ' + (P0 && P0.temperature_c != null ? 'point state at ' + P0.lat + ', ' + P0.lon + ' (the value every page shows)' : 'live point forecast at the unit centroid')
          + (L.providerElevationM != null ? ', ' + L.providerElevationM + ' m' : '') + ':');
        if (n.temperature_c != null) lines.push('  now (' + (n.time || '') + ' local): ' + n.temperature_c + ' °C'
          + (n.apparent_temperature_c != null ? ', feels like ' + n.apparent_temperature_c + ' °C' : '') + (n.utci_shade_c != null ? ', thermal stress (UTCI) ' + (n.utci_sun_c != null ? n.utci_sun_c + ' °C in the sun (estimated), ' : '') + n.utci_shade_c + ' °C in shade: ' + String(n.utci_class || '').toLowerCase() : '')
          + (n.relative_humidity_pct != null ? ', ' + n.relative_humidity_pct + '% RH' : '')
          + (n.wind_speed_kmh != null ? ', wind ' + n.wind_speed_kmh + ' km/h' : ''));
        for (const d of ((u.pointDays && u.pointDays.length) ? u.pointDays : (L.days || [])).slice(0, 7)) lines.push('  ' + d.date + ': max ' + d.tmax_c + ' °C, min ' + d.tmin_c + ' °C, rain ' + d.rain_mm + ' mm, gusts to ' + d.gust_max_kmh + ' km/h');
        notes.push(u.liveForecastNote);
        continue;
      }
      const parts = Object.entries(u.forecast.leads).map(([L, v]) => {
        const bits = [];
        if ((want.t || any) && L === '0' && u.pointNow && u.pointNow.temperature_c != null) bits.push(u.pointNow.temperature_c + ' °C' + (u.pointNow.range90_c && u.pointNow.range90_c[0] != null ? ' (90 % range ' + u.pointNow.range90_c[0] + '–' + u.pointNow.range90_c[1] + ')' : ''));   /* v91.17.122 · the page's own value */
        else if ((want.t || any) && v.temperature_2m != null) bits.push(v.temperature_2m + ' °C');
        if ((want.r || any) && v.precipitation != null) bits.push(v.precipitation + ' mm/h rain');
        if ((want.w || any) && v.wind_speed_10m != null) bits.push('wind ' + v.wind_speed_10m + ' km/h' + (v.wind_gusts_10m != null ? ', gusts ' + v.wind_gusts_10m : ''));
        if (want.h && v.relative_humidity_2m != null) bits.push(v.relative_humidity_2m + '% RH');
        return lab(L) + ': ' + bits.join(', ');
      });
      lines.push(u.name + ' (' + u.district + ') - ' + parts.join(' · ') + (u.forecast.biasCorrected ? ' · temperatures corrected by the NIGRAAN chain (station calibration, terrain and national model where they passed their tests)' : ''));
      const v = (u.verification && u.verification.skill || []).find(x => x.lead_hours === 24);
      if (!INTERNAL()) { /* v91.17.70 · reanalysis agreement and the airport-thermometer guard are internal diagnostics */ }
      else if (v && v.station_guard && (want.t || any)) lines.push('  Temperature correction is off here: against the ' + v.station_guard.station + ' airport thermometer (' + v.station_guard.km + ' km) the raw forecast scored ' + v.station_guard.station_rmse_raw_c + ' °C RMSE and the ERA5-trained correction would have made it ' + v.station_guard.station_rmse_if_corrected_c + ' °C; ERA5 is biased at this location.');
      else if (v && (want.t || any)) lines.push('  24 h temperature error on the last test month: ' + v.rmse_served_c + ' °C RMSE' + (v.corrected ? ' (was ' + v.rmse_raw_c + ' °C before correction)' : '') + '.');
    }
    /* ══ v91.17.11 · the morphology of every unit the answer used ════════════
       It was being attached to the facts and then never printed, so a question
       about a city got the grid forecast and nothing about the city. */
    for (const u of units) {
      const dr = u.drought;
      if (dr) {
        if (dr.arid) lines.push('  Drought at ' + u.name + ': index not defined for this climate — ' + (dr.aridWhy || 'the window\'s climatological rainfall is under 10 mm') + '. No drought class is issued.');
        else lines.push('  Drought at ' + u.name + ' (as of ' + dr.asOf + '): SPI-90 '
          + (dr.spi90 == null ? ((dr.refusals && dr.refusals.spi90) || 'not fitted') : (sgn(dr.spi90) + (dr.spi90Class ? ' (' + dr.spi90Class + ')' : '')))
          + ', SPEI-90 ' + (dr.spei90 == null ? ((dr.refusals && dr.refusals.spei90) || 'not fitted') : sgn(dr.spei90))
          + (dr.rootZonePercentile != null ? (', root-zone soil moisture at the ' + ord(dr.rootZonePercentile) + ' percentile of its own record') : '')
          + '.' + (dr.servedClass ? ' Drought level on the map: ' + dr.servedClass + (dr.provisional ? ' (provisional: a high valley where no rain record was verified against gauges, so confidence is low)' : '') + (dr.rainSource ? '; rain from ' + dr.rainSource : '') + '.' : '')
          + (dr.vegetationReading ? ' Vegetation: ' + dr.vegetationReading + '.' : ''));
      }
      /* v91.17.101 · audit #78-#81 · the calibrated rain chances and what happened here before, from the same served products */
      const qlow = String(prompt || '').toLowerCase();
      if (u.rainChance && (want.r || any || /\b(chance|likely|confiden|sure|certain|heavy)\b/.test(qlow))) {
        const rc = u.rainChance.days.slice(0, 3).map(d => d.date + ': ' + (d.chancePct.atLeast1mm != null ? d.chancePct.atLeast1mm + '% chance of a rain day' : 'rain-day chance withheld') + (d.chancePct.atLeast10mm != null ? ', ' + d.chancePct.atLeast10mm + '% of 10 mm or more' : '') + (d.chancePct.atLeast25mm != null ? ', ' + d.chancePct.atLeast25mm + '% of 25 mm or more' : ''));
        if (rc.length) lines.push('  Rain chances at ' + u.name + ' (calibrated against satellite rain, tested on 2026; a chance, not a certainty): ' + rc.join(' · ') + '.');
      }
      if (u.glof && (/\b(glof|glacial|lake|outburst|burst)\b/.test(qlow))) lines.push(u.glof.level ? '  Glacial lake level at ' + u.name + ': ' + u.glof.level + (u.glof.text ? ' — ' + u.glof.text : '') + '.' : '  Glacial lakes upstream of ' + u.name + ' (site context, not a warning level)' + (u.glof.text ? ': ' + u.glof.text : '') + '.');
      if (u.damsUpstream && /\b(dams?|reservoirs?|barrages?|release|spill|breach|break|downstream|flood)\b/.test(qlow)) lines.push('  Dams upstream: ' + (u.damsUpstream.large.length ? u.damsUpstream.large.slice(0, 4).map(e => e.name + (e.heightM ? ' (' + Math.round(e.heightM) + ' m)' : '') + (e.km ? ' ' + Math.round(e.km) + ' km up the river' : ' in this tehsil')).join(', ') : 'no large dam') + (u.damsUpstream.small ? '; ' + u.damsUpstream.small + ' small dam(s)' : '') + (u.damsUpstream.farm ? '; ' + u.damsUpstream.farm + ' farm-scale dam(s)' : '') + ' (' + u.damsUpstream.rule + ').');
      if (u.pastEvents && (/\b(before|history|histor|past|last time|ever|previous|flooded|landslides?|burst|outburst|happened)\b/.test(qlow) || hazardsAsked(qlow).length)) lines.push('  What happened here before: ' + u.pastEvents.events.slice(0, 5).join('; ') + '.');
      const m = u.urbanMorphology;
      if (!m || !m.urban) continue;
      lines.push('  Urban form at the ' + u.name + ' centroid: ' + Math.round(m.builtSurfaceFraction * 100)
        + '% built, buildings averaging ' + m.meanBuildingHeightM + ' m, NDVI '
        + (m.ndvi == null ? 'no data' : m.ndvi) + ', ' + m.populationPerKm2.toLocaleString('en') + ' people/km²'
        + (m.localClimateZone ? ', local climate zone ' + m.localClimateZone : '')
        + ' — modelled night heat-island potential ' + sgn(m.heatIslandMaxC) + ' °C, beside the forecast and never added to it.');
      notes.push('urban heat-island potential is unverified: wrong sign at the one Lahore test pair');
    }
    /* ══ the spread across a place, when the question asked about its parts ══ */
    if (facts.withinPlaceSpread && facts.withinPlaceSpread.cells) {
      const sp = facts.withinPlaceSpread;
      const one = (c, lbl) => '  ' + lbl + ': ' + sgn(c.deltaTmaxC) + ' °C at ' + c.lat + ', ' + c.lon
        + ' — ' + Math.round(c.builtFraction * 100) + '% built, ' + c.meanBuildingHeightM + ' m buildings, NDVI '
        + (c.ndvi == null ? 'no data' : c.ndvi) + (c.lczName ? ', ' + c.lczName : '') + '.';
      lines.push('');
      lines.push('Across ' + sp.place + ' there is no single temperature. ' + sp.cells.toLocaleString('en')
        + ' built cells of about 270 m within ' + sp.radiusKm + ' km, and the night heat-island potential ranges over '
        + sp.spreadC + ' °C between them:');
      lines.push(one(sp.warmest, 'Warmest'));
      lines.push(one(sp.p75, 'Upper quarter'));
      lines.push(one(sp.median, 'Median'));
      lines.push(one(sp.coolest, 'Coolest'));
      lines.push('That range is urban form, not weather. The provider forecast is one value for a model grid box far larger than these cells, so it cannot show any of it. Built surface and building height are GHSL 2025, vegetation is MODIS NDVI for August 2026, and the magnitude is calibrated against two urban/rural station pairs, Rawalpindi and Lahore, 49,555 hours.');
    }
    const live = units.some((u) => !u.forecast && u.liveForecast) || !!facts.askedPlace;
    if (lines.length) notes.push((live ? 'Direct lookup: stored run values where a run holds the unit, a live point forecast where it does not.' : 'This is a direct lookup of stored values.') + ' ' + LOOKUP_NOTE);
    const text = lines.length
      ? lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
      : (facts.dashboard && Object.keys(facts.dashboard).length ? 'I could not tell which place you mean, and no place is selected on the dashboard. Pick a place on the map, or name one: "temperature in Naran", "rain in Lahore Cantt tomorrow", "10 day outlook for Jacobabad".' : 'I could not find a place name in the question. Name one — any Pakistani settlement, not only the 577 units: "temperature in Naran", "rain in Lahore Cantt tomorrow", "10 day outlook for Jacobabad".');
    return { answer: text, notes, sources: ['Stored model forecast (local backend)', units.length ? 'Units: ' + units.map(u => u.name).join(', ') : 'No unit matched', LOOKUP_SOURCE], model: null, provider: 'retrieval', needHazard, ...(facts.national && nationalNeed(facts.national) ? { needNational: nationalNeed(facts.national) } : {}) };
  }
  const OUT_OF_SCOPE = /\b(esg|sustainability (?:report|score|rating|disclosure)s?|financ(?:e|ial)|insur(?:e|ance|ed)|premiums?|pkr|rupees?|usd|dollars?|monetary|revenue|valuation|(?:economic|financial|money|monetary|asset) loss(?:es)?|loss (?:estimate|in pkr|in rupees|in money)|damage cost|cost of (?:damage|the damage|a stopped day)|replacement value|tcfd|issb|ifrs ?s?\d*|carbon (?:credits?|footprint|accounting)|ghg|scope [123] emissions?)\b/i;
  const OUT_OF_SCOPE_ANSWER = 'That is outside NIGRAAN. NIGRAAN forecasts and screens weather and climate hazards (levels, chances and their evidence) for a place; it does not estimate money, losses, insurance or ESG / sustainability figures. Ask about a hazard or the weather at a place, the long-term climate projection, or the hazard Monte Carlo simulation.';
  const ACCURACY_Q = /\b(how accurate|accuracy|how (?:good|reliable|right|wrong) (?:is|are)|reliab(?:le|ility)|forecast error|how far off|skill|verified|verification|can i trust|trustworthy)\b/i;
  function accuracyAnswer() {
    const E = skillEvidence(app.dataDir);
    if (!E.ready) return { answer: 'The measured accuracy figures are not available on this server right now (' + E.why + '). No figure is given rather than an unchecked one.', notes: [], sources: [LOOKUP_SOURCE], model: null, provider: 'retrieval', kind: 'accuracy' };
    const L = ['How accurate NIGRAAN has measured out of sample (checked against measurements the models never saw):'];
    for (const x of evidenceLines(app.dataDir)) L.push('• ' + x + '.');
    L.push('Every figure above is generated from the evidence files of the independent check (' + (E.built || 'date on file') + '); the methods sheet and every report print the same sentences.');
    return { answer: L.join('\n'), notes: ['figures: data/skill-evidence.json (scripts/gen/gen_evidence.py) from data/evidence/sci2821/'], sources: [LOOKUP_SOURCE], model: null, provider: 'retrieval', kind: 'accuracy' };
  }
  /* v91.17.76 · A · B-13 · the closing line of a direct look-up, in plain words (was: "No language model is connected (add a free key to nigraan-local\\ai.key ...)") */
  const LOOKUP_NOTE = 'Direct look-up of NIGRAAN data: every number is computed, not generated.';
  const LOOKUP_SOURCE = 'NIGRAAN data look-up';
  const FW_STATUS = { numbers: 'slot rendering: every number in an answer is written by code from the facts pack; the model writes none', digits: 'ASCII, Arabic-Indic and Urdu digits all count', sentenceMarks: '. ! ? and the Urdu full stop', probability: 'a probability or return period only as a slot from the facts' };
  /* ══ v91.17.75 · P · C2 · "NIGRAAN AI models": what is live, read from the model files, for the AI section's panel ══
     The temperature correction's held-out result is the gate block of data/downscale-model.json (leave-one-station-out:
     every station scored by a model that never saw it). Only the error pair per zone and the zones applied; no station
     network, supplier or site is named (CEO brief v91.17.75 C2). */
  let DSM = null, DSMmt = 0;
  function aiModels(st) {
    const out = { temperature: null, analyst: null, planned: ['Anomaly detection on the station and satellite feeds', 'Flood mapping from satellite radar'] };
    try {
      const f = join(app.dataDir || join(process.cwd(), 'data'), 'downscale-model.json');
      if (existsSync(f)) { const mt = statSync(f).mtimeMs; if (!DSM || mt !== DSMmt) { const j = JSON.parse(readFileSync(f, 'utf8')); DSM = { version: j.version, built: j.built, label: j.label, shadow: !!j.shadow, applyZones: j.applyZones || [], gate: j.gate || {} }; DSMmt = mt; } }
      if (DSM) {
        const m = (DSM.gate && DSM.gate.measured) || {}; const Z = m.zonesLoso || {};
        const r2 = (x) => x == null ? null : Math.round(x * 100) / 100;
        const zone = (z) => Z[z] ? { tmax: [r2(Z[z].base_x), r2(Z[z].ai_x)], tmin: [r2(Z[z].base_n), r2(Z[z].ai_n)], stations: Z[z].stations || null } : null;
        const mtn = m.mountainAwsLosoTmax && m.mountainAwsLosoTmin ? { tmax: [r2(m.mountainAwsLosoTmax.base), r2(m.mountainAwsLosoTmax.ai)], tmin: [r2(m.mountainAwsLosoTmin.base), r2(m.mountainAwsLosoTmin.ai)] } : zone('mountain');
        const on = !DSM.shadow && process.env.NIGRAAN_AI_DOWNSCALE !== '0' && stationData();
        /* v91.17.76 · A · B-12 · what it does and where it runs, in words a customer reads; the held-out error figures are
           operator-only (CEO decision 1): the page shows them only in operator mode, and a caller that says it is not on
           loopback does not receive them (status(ctx), see s76/CHANGES_ai.md "Needs integrator") */
        const zw = (on ? DSM.applyZones : []).map((z) => z === 'mountain' ? 'the mountains' : z === 'plains' ? 'the plains' : z === 'coast' ? 'the coast' : z === 'hills' ? 'the hills' : z);
        out.temperature = { name: 'AI temperature correction', label: DSM.label || null, live: on, zones: on ? DSM.applyZones : [], version: DSM.version, built: DSM.built,
          does: 'corrects the forecast air temperature for the ground under it: terrain and land surface at about 250 m, and the day\'s cloud, wind and rain',
          where: on ? ('live in ' + (zw.length > 1 ? zw.slice(0, -1).join(', ') + ' and ' + zw[zw.length - 1] : zw[0] || 'no zone') + '; not at every point: where a station-based correction already applies (a MACH station or a station calibration), that correction is used') : 'not live on this server',
          badge: 'a temperature it has corrected carries an "AI-corrected" badge with the size of the correction',
          heldOut: { what: 'daily maximum and minimum temperature error (mean absolute, °C) at stations the model never saw, before and after the correction', mountains: mtn, plains: zone('plains') } };
      }
    } catch (_) {}
    out.analyst = st.mode === 'llm' ? { name: 'AI Analyst', mode: 'language model', model: st.model || st.asked || null, local: !!st.local, reachable: st.reachable !== false,
                                        runs: 'a language model ' + (st.local ? 'on this machine' : 'in the cloud (the question and the facts leave this machine)') + ' writes the words; every number and level in an answer is written by code from NIGRAAN data' }
                                      : { name: 'AI Analyst', mode: 'grounded lookup (no language model connected)', model: null, local: true,
                                        runs: 'answers are looked up directly in NIGRAAN data - the forecast, the hazard engine, the drought and lake tables - and written by code; no language model runs on this machine' };
    return out;
  }
  async function status(ctx) {
    const s0 = await status0(); try { s0.models = aiModels(s0); } catch (_) {}
    /* v91.17.76 · A · CEO decision 1 · the held-out figures are operator-only: withheld from a caller known not to be on loopback */
    try { if (s0.models && s0.models.temperature) { s0.models.temperature.heldOutOperatorOnly = true; if (ctx && ctx.loopback === false) delete s0.models.temperature.heldOut; } } catch (_) {}
    return s0;
  }
  async function status0() { cfg = load(); return cfg ? { configured: true, mode: 'llm', provider: cfg.provider, model: await pickModel(), asked: cfg.model || null, local: cfg.local, localByDefault: true, cloudOptIn: !!cfg.cloudOptIn, dataLeavesMachine: !cfg.local, firewall: FW_STATUS, modelNote, reachable: modelNote == null || !/did not answer/.test(modelNote), localStart: cfg.provider === 'ollama' ? localStart : undefined, storeAdopt: cfg.provider === 'ollama' ? adopt : undefined, storeImport: cfg.provider === 'ollama' ? importer : undefined } : { configured: true, mode: 'retrieval', provider: 'retrieval', model: null, local: true, localByDefault: true, dataLeavesMachine: false, firewall: FW_STATUS, cloudRefused: cloudRefused || undefined, why: cloudRefused ? cloudRefused.why : 'no ai.key: named-place lookups only' }; }
  /* v91.17.43 · the evidence pack itself, for inspection and for the benchmark: what the model would be given */
  async function evidence(body) {
    const prompt = String(body.prompt || '').slice(0, 2000).trim();
    const facts = await grounding(body.context, prompt, body.hazardContext, body.nationalContext);
    const full = JSON.stringify(facts); const small = compact(facts);
    return { status: 200, json: { bytes: full.length, compactBytes: JSON.stringify(small).length, keys: Object.keys(facts), facts: body.compact ? small : facts } };
  }
  /* Cloud free-tier TPM is tight (~7k). Keep only place identity, now/today, short forecast, map levels and hazard verdicts. */
  function cloudLean(f) {
    const leanUnit = (u) => {
      if (!u || typeof u !== 'object') return u;
      const o = {};
      for (const k of ['name', 'key', 'district', 'province', 'lat', 'lon', 'elevM', 'whereThisIs', 'now', 'today', 'next3Days', 'pointNow', 'mapLevels', 'hazardVerdicts', 'liveForecastNote', 'splitNote']) {
        if (u[k] !== undefined) o[k] = u[k];
      }
      const daysOf = (src) => Array.isArray(src?.days) ? src.days.slice(0, 5).map((d) => {
        const row = {};
        for (const k of ['date', 'tmax_c', 'tmin_c', 'rain_mm', 'gust_max_kmh', 'wind_max_kmh', 'tmaxC', 'tminC', 'rainMm', 'gustMaxKmh', 'condition', 'level', 'word']) {
          if (d[k] !== undefined) row[k] = d[k];
        }
        return row;
      }) : undefined;
      if (u.liveForecast) o.liveForecast = { at: u.liveForecast.at, now: u.liveForecast.now, days: daysOf(u.liveForecast) };
      if (u.forecast) o.forecast = { at: u.forecast.at, now: u.forecast.now, summary: u.forecast.summary, days: daysOf(u.forecast) };
      if (Array.isArray(u.pointDays) && u.pointDays.length) o.pointDays = daysOf({ days: u.pointDays });
      if (u.mapLevels && typeof u.mapLevels === 'object') {
        const ml = u.mapLevels;
        const W0 = (typeof SCALE_WORDS === 'function' && SCALE_WORDS()[0]) || 'Normal';
        const SKIP = /runoff retention|heat index band/i;
        const days = Array.isArray(ml.days) ? ml.days.slice(0, 5).map((d) => {
          const hazards = (d.hazards || [])
            .filter((h) => {
              if (!h || !h.level || SKIP.test(h.hazard || '')) return false;
              const lv = String(h.level);
              if (lv === W0 || /^normal\b/i.test(lv) || /^not /i.test(lv) || /cannot happen/i.test(lv) || /data missing/i.test(lv) || /^like /i.test(lv) || /^below /i.test(lv)) return false;
              return true;
            })
            .slice(0, 8)
            .map((h) => {
              const row = {};
              for (const k of ['hazard', 'level', 'productType', 'levelLabel', 'raisesNoAlert']) if (h[k] !== undefined) row[k] = h[k];
              return row;
            });
          return { date: d.date, hazards };
        }) : [];
        o.mapLevels = { unit: ml.unit, note: 'raised levels only (Low and above); Normal / not-tested omitted', stale: ml.stale, days };
      }
      return o;
    };
    const base = compact(f);
    const out = {};
    for (const k of ['dashboard', 'national', 'hazardsAsked', 'hazardVerdicts', 'comparisonNote', 'askedPlaceUnresolved', 'dashboardSelectionIgnored', 'note', 'daysAsked', 'placeResolution']) {
      if (base[k] !== undefined) out[k] = base[k];
    }
    if (base.askedUnits) out.askedUnits = base.askedUnits.slice(0, 2).map(leanUnit);
    if (base.selectedUnit) out.selectedUnit = leanUnit(base.selectedUnit);
    if (base.askedPlace) out.askedPlace = leanUnit(base.askedPlace);
    if (base.askedPlacesAlsoNamed) out.askedPlacesAlsoNamed = base.askedPlacesAlsoNamed.slice(0, 2).map(leanUnit);
    if (out.askedPlace && out.askedUnits) {
      const nm = String(out.askedPlace.name || out.askedPlace.key || '').toLowerCase();
      out.askedUnits = out.askedUnits.filter((u) => {
        const a = String(u.name || '').toLowerCase(), b = String(u.key || '').toLowerCase();
        return a !== nm && b !== nm && !(nm && (a.includes(nm) || nm.includes(a)));
      });
      if (!out.askedUnits.length) delete out.askedUnits;
    }
    out.note = (out.note ? out.note + ' ' : '') + 'Cloud lean pack: weather and hazards only.';
    return out;
  }

  /* a compact evidence pack for a small or local model: the same facts, the long tails cut. A 1.7B model on a CPU takes
     minutes to read a 60 kB pack (measured: HTTP 504 after 180 s on the operator's machine); it reads 6 kB in seconds. */
  function compact(f) {
    const trimUnit = (u) => { if (!u || typeof u !== 'object') return u; const o = {};
      for (const k of ['name', 'key', 'district', 'province', 'disputed', 'lat', 'lon', 'elevM', 'whereThisIs', 'now', 'today', 'next3Days', 'hazardVerdicts', 'liveForecastNote', 'pointNow', 'mapLevels', 'splitNote']) if (u[k] !== undefined) o[k] = u[k];   /* v91.17.255 · C-25 · the point engine's "now" (pointNow) and the map levels were cut from the compact pack, so a cloud answer said the place had no current temperature */
      if (u.liveForecast) { const lf = u.liveForecast; o.liveForecast = { at: lf.at, model: lf.model, calibration: lf.calibration, days: Array.isArray(lf.days) ? lf.days.slice(0, 3) : lf.days, now: lf.now }; }
      if (u.forecast) { const fc = u.forecast; o.forecast = { at: fc.at, model: fc.model, days: Array.isArray(fc.days) ? fc.days.slice(0, 3) : fc.days, now: fc.now, summary: fc.summary }; }
      if (u.drought) o.drought = { asOf: u.drought.asOf, spi90: u.drought.spi90, spei90: u.drought.spei90, spei90Class: u.drought.spei90Class, rootZonePercentile: u.drought.rootZonePercentile, arid: u.drought.arid };
      if (u.catchmentWetness) o.catchmentWetness = u.catchmentWetness.notDefined ? { notDefined: true } : { rootZoneWetness: u.catchmentWetness.rootZoneWetness, state: u.catchmentWetness.state, storageRemainingMm: u.catchmentWetness.storageRemainingMm, rainNext72Mm: u.catchmentWetness.rainNext72Mm, sensitivity: u.catchmentWetness.sensitivity && u.catchmentWetness.sensitivity.level };
      if (u.outlook) o.outlook = { events: u.outlook.events, note: 'chance_pct = share of ensemble members, not calibrated' };
      if (u.stationLakeNotes) o.stationLakeNotes = u.stationLakeNotes.items.map(x => x.product + ': ' + x.note);
      if (u.suggestions) o.suggestions = { standing: (u.suggestions.standing || []).slice(0, 5).map(x => ({ hazard: x.hazard, measure: x.measure, why: x.why })), watch: (u.suggestions.watch || []).slice(0, 5).map(x => ({ hazard: x.hazard, what: x.what })) };
      if (u.floodplain) o.floodplain = { basis: u.floodplain.basis || u.floodplain.why, whereRainCollects: u.floodplain.where && u.floodplain.where.text };   /* v91.17.44 */
      if (u.urbanMorphology) o.urbanMorphology = { lcz: u.urbanMorphology.lcz, uhiC: u.urbanMorphology.uhiC || u.urbanMorphology.dt, note: 'urban heat island, added on top of the grid forecast' };
      if (u.verification) o.verification = u.verification.summary || u.verification;
      return o; };
    const out = {};
    if (f.dashboard) { out.dashboard = {}; for (const k of ['location', 'skyNow', 'feels', 'riskBand', 'driver', 'asset']) if (f.dashboard[k] !== undefined) out.dashboard[k] = f.dashboard[k]; out.dashboard.actions = (f.dashboard.actions || []).slice(0, 4); }   /* v91.17.75 · the cleaned context (no stale fallback, sky not "condition") */
    for (const k of ['national', 'hazardsAsked', 'hazardVerdicts', 'comparisonNote', 'askedPlaceUnresolved', 'dashboardSelectionIgnored', 'frozenEvidence', 'note']) if (f[k] !== undefined) out[k] = f[k];   /* v91.17.75 · national */
    if (f.askedUnits) out.askedUnits = f.askedUnits.slice(0, 3).map(trimUnit);
    if (f.selectedUnit) out.selectedUnit = trimUnit(f.selectedUnit);
    if (f.askedPlace) out.askedPlace = trimUnit(f.askedPlace);
    if (f.askedPlacesAlsoNamed) out.askedPlacesAlsoNamed = f.askedPlacesAlsoNamed.slice(0, 2).map(trimUnit);
    if (f.nationalVerification) out.nationalVerification = { at: f.nationalVerification.at, passedServed: f.nationalVerification.passedServed, of: f.nationalVerification.of };
    out.note = (out.note ? out.note + ' ' : '') + 'Compact evidence pack for a small model: long tails cut; every number you cite must appear here.';
    return out;
  }
  return { chat, status, firewall, evidence, compact,
    testHooks: { placeCandidates, resolveAskedPlace, dashboardPlace, forecastAnswer, retrieval, decorate } };   /* v91.17.266 · scripts/tests266 reads the parsing layer offline */
}
