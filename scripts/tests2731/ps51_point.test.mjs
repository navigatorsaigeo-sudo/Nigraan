/* v91.17.273.1 · the deploy's live check reads the place bundle (v283.19: /api/point; before, /api/point/forecast) with Windows PowerShell 5.1 ConvertFrom-Json (JavaScriptSerializer).
   That parser refuses a body JSON.parse accepts when one object holds two property names equal ignoring case, or an empty property name;
   and NaN/Infinity are not JSON. This test asks the Lahore point (the deploy's point, twice: cold and warm) and 60 places spread over the
   tehsils, and checks each answer: HTTP 200, valid JSON, no NaN/Infinity token, no empty or case-duplicate property name in any object,
   ok === true. usage: node scripts/tests2731/ps51_point.test.mjs http://127.0.0.1:<port> */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
/* a strict JSON reader that reports what PowerShell 5.1 would refuse */
export function ps51Problems(text) {
  let i = 0; const P = []; const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const str = () => { if (text[i] !== '"') throw new Error('string expected at ' + i); let j = i + 1, out = '';
    while (j < text.length && text[j] !== '"') { if (text[j] === '\\') { j++; if (text[j] === 'u') { out += String.fromCharCode(parseInt(text.slice(j + 1, j + 5), 16)); j += 5; continue; } out += text[j]; j++; continue; } out += text[j++]; }
    if (j >= text.length) throw new Error('unterminated string'); i = j + 1; return out; };
  const val = (path) => { ws(); const c = text[i];
    if (c === '{') { i++; const seen = new Map(); ws(); if (text[i] === '}') { i++; return; }
      for (;;) { ws(); const k = str(); if (k === '') P.push('empty property name at ' + path); const l = k.toLowerCase(); if (seen.has(l)) P.push(`keys "${seen.get(l)}" and "${k}" at ${path}`); else seen.set(l, k);
        ws(); if (text[i++] !== ':') throw new Error(': expected at ' + i); val(path + '.' + k); ws(); const d = text[i++]; if (d === '}') return; if (d !== ',') throw new Error(', or } expected at ' + i); } }
    if (c === '[') { i++; ws(); if (text[i] === ']') { i++; return; } for (let n = 0; ; n++) { val(path + '[' + n + ']'); ws(); const d = text[i++]; if (d === ']') return; if (d !== ',') throw new Error(', or ] expected at ' + i); } }
    if (c === '"') { str(); return; }
    const m = /^(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 64));
    if (!m) { const tok = (/^-?[A-Za-z]+/.exec(text.slice(i, i + 16)) || [text.slice(i, i + 8)])[0]; throw new Error('not JSON at ' + path + ': ' + tok); }
    i += m[0].length; };
  try { val('$'); ws(); if (i !== text.length) P.push('trailing text at ' + i); } catch (e) { P.push(e.message); }
  return P;
}
/* the reader itself */
ok(ps51Problems('{"a":1,"A":2}').length === 1, 'reader: case-duplicate keys found');
ok(ps51Problems('{"":1}').length === 1, 'reader: empty key found');
ok(ps51Problems('{"a":NaN}').length === 1 && ps51Problems('{"a":-Infinity}').length === 1, 'reader: NaN / -Infinity refused');
ok(ps51Problems('{"a":[1,{"b":"x\\"y","c":null}],"d":true}').length === 0, 'reader: a clean body passes');
const U = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8')).filter((u) => !u.disputed);
const pts = [['Lahore (deploy point, cold)', 31.5204, 74.3587], ['Lahore (deploy point, warm)', 31.5204, 74.3587]];
for (let k = 0; k < 60; k++) { const u = U[(k * 9) % U.length]; pts.push([u.tehsil + ' #' + k, +(u.lat + 0.0137 * ((k % 5) - 2)).toFixed(4), +(u.lon + 0.0111 * ((k % 3) - 1)).toFixed(4)]); }
let maxB = 0;
for (const [name, la, lo] of pts) {
  const r = await fetch(`${BASE}/api/point?lat=${la}&lon=${lo}`, { headers: { 'Sec-Fetch-Site': 'same-origin', 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(120000) });
  const t = await r.text(); maxB = Math.max(maxB, t.length); const pr = ps51Problems(t); let j = null; try { j = JSON.parse(t); } catch (_) {}
  ok(r.status === 200 && !pr.length && j && j.ok === true, `${name}: 200, PowerShell 5.1 parses it, ok true` + (r.status !== 200 || pr.length || !j || j.ok !== true ? ` (status ${r.status}; ${pr.slice(0, 3).join('; ')}; ok=${j && j.ok}; why=${j && (j.why || j.error)})` : ''));
}
console.log(`largest body ${maxB} bytes`);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
