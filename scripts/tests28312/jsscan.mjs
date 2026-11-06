/* v91.17.283.12 · helpers for the build-time gate (gate.test.mjs): the code scripts of a page and their code with comments removed (a light
   scanner: strings, template literals and regular-expression literals are kept, block and line comments are dropped), so a forbidden address
   named only in a comment or a note does not count, and one written in code does. */
import { readFileSync } from 'node:fs';

export function codeScripts(file) {
  const h = readFileSync(file, 'utf8'), out = []; let i = 0;
  for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/application\/json|\bsrc=|type="module"/.test(m[1])) continue; i++;
    const id = (m[1].match(/id="([^"]+)"/) || [])[1] || null;
    out.push({ n: i, id, key: id || '#' + i, code: m[2], start: m.index + m[0].indexOf('>') + 1 });
  }
  return { html: h, scripts: out };
}

export function stripComments(src) {
  let o = '', i = 0, prev = '';
  const n = src.length, rxPrev = /[(,=:[!&|?{};+\-*%<>~^]|^$/;
  const wordBefore = () => { const m = /([A-Za-z_$][\w$]*)\s*$/.exec(o); return m ? m[1] : ''; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; o += ' '; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } o += src.slice(i, j + 1); i = j + 1; prev = c; continue; }
    if (c === '/') { const w = wordBefore(); if (rxPrev.test(prev) || /^(return|typeof|case|in|of|delete|void|throw|new)$/.test(w)) {
        let j = i + 1, cls = false; while (j < n) { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; else if (ch === '\n') break; j++; }
        o += src.slice(i, j + 1); i = j + 1; prev = '/'; continue; } }
    o += c; if (!/\s/.test(c)) prev = c; i++;
  }
  return o;
}

/* the forbidden addresses: weather or hazard values of a point computed outside the point state (and the provider itself) */
export const FORBIDDEN = [
  ['point-forecast', /\/api\/point\/forecast/g], ['v1-forecast-point', /\/api\/v1\/forecast\/point/g], ['hyperlocal', /\/api\/hyperlocal\/[a-z]+/g],
  ['mos-point', /\/api\/mos\/point/g], ['ecmwf010-point', /\/api\/ecmwf010\/point/g], ['pool-point', /\/api\/pool\/point/g], ['state-point', /\/api\/state\/point/g],
  ['urban-point', /\/api\/urban\/point/g], ['px-provider', /\/px\/v1\/[a-z_-]+/g], ['provider-host', /(?:[a-z-]+-)?api\.open-meteo\.com|open-meteo\.com/g]];
/* page-side arithmetic that derives temperature, heat or a level from raw inputs (flagged for review, listed in the report) */
export const ARITH = [['utci', /\bagnUtci\s*\(/g], ['heat-index', /\bheatIndexC\s*\(/g], ['feels-like', /\bfeelsLikeC\s*\(/g], ['wet-bulb', /\bwetBulbStullC\s*\(/g],
  ['dew-point', /\bdewPointC\s*\(/g], ['discomfort', /\bdiscomfortIndex\s*\(/g], ['utci-score', /\bagnUtciAgnScore\s*\(/g], ['hazard-score', /\bhzScore\s*\(/g]];

export function scan(file, rules) {
  const { scripts } = codeScripts(file), res = {};
  for (const s of scripts) { const code = stripComments(s.code), hit = {};
    for (const [k, re] of rules) { const m = code.match(re); if (m) hit[k] = m.length; }
    if (Object.keys(hit).length) res[s.key] = hit; }
  return res;
}

/* the code script holding a given character offset of the page (CDP gives line and column of the initiator) */
export function blockAt(file, line0, col0) {
  const { html, scripts } = codeScripts(file);
  let off = 0, ln = 0; while (ln < line0) { const e = html.indexOf('\n', off); if (e < 0) break; off = e + 1; ln++; } off += col0;
  for (const s of scripts) if (off >= s.start && off <= s.start + s.code.length) return s.key;
  return null;
}
