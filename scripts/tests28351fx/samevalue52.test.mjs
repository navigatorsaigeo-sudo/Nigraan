/* v91.17.283.52 · F1 · samevalue113 EXTENDED: the same place's value is the same whatever it is read with, and the report prints it too.
   For each place (default the 5 of samevalue113 + Karachi city, whose record sits in Karachi coast's nearby list):
     - the served place answer (GET /api/point, shown block) = its record read alone (/api/point/batch?pts=<one>) = its record inside a
       36-point batch (its own nearby list) = the same point's entry in ANOTHER place's nearby list (parts.near), to the last digit;
     - the site report made for the point (POST /api/report/generate, kind site_assessment) prints the served now / label / today high / low;
     - then runs samevalue113 (start page, start panel, analyst page, Customize: every data-shown element = the served value).
   usage: node scripts/tests28351fx/samevalue52.test.mjs <base> [out dir]   (env PLACES as samevalue113; NO113=1 skips the page part) */
import { spawnSync } from 'node:child_process';
const [BASE, OUT = '/dev/shm/samevalue52'] = process.argv.slice(2);
const PLACES = (process.env.PLACES || '33.66443,73.08339,Islamabad I-8;31.51000,74.38000,Lahore Cantt;24.81380,67.03000,Karachi coast;35.92080,74.30890,Gilgit;30.17980,66.97500,Quetta;24.85468,67.02071,Karachi').split(';').map((x) => { const a = x.split(','); return { lat: +a[0], lon: +a[1], name: a.slice(2).join(',') }; });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const H = (v) => ({ 'sec-fetch-site': 'same-origin', 'x-agn-view': v || 'customer' });
const j = async (u, v) => (await fetch(BASE + u, { headers: H(v), signal: AbortSignal.timeout(600000) })).json();
const f5 = (x) => (+x).toFixed(5);
const recOf = (s) => { if (!s || !s.ok) return s; const { key, ...o } = s; return JSON.stringify({ now: o.now, hours: o.hours, days: o.days, heat: o.heat, source: o.source, point: o.point }); };
const nearLists = new Map();
for (const P of PLACES) {
  const B = await j('/api/point?lat=' + f5(P.lat) + '&lon=' + f5(P.lon) + '&complete=1'); const near = B.parts && B.parts.near && B.parts.near.v; nearLists.set(P.name, near ? near.places : []);
  const alone = (await j('/api/point/batch?pts=' + f5(P.lat) + ',' + f5(P.lon))).states[0];
  ok(B.now && alone && alone.ok && B.now.tempC === alone.now.tempC && JSON.stringify(B.hours) === JSON.stringify(alone.hours), P.name + ': place answer = its record read alone (' + (B.now && B.now.tempC) + ')', JSON.stringify([B.now && B.now.tempC, alone && alone.now && alone.now.tempC]));
  const L = (near ? near.places : []).slice(0, 35); const pts = [P, ...L];
  const inB = (await j('/api/point/batch?pts=' + pts.map((p) => f5(p.lat) + ',' + f5(p.lon)).join(';'))).states[0];
  ok(recOf(inB) === recOf(alone), P.name + ': record inside a ' + pts.length + '-point batch = record alone (whole record: now, 192 hours, days, heat, source)');
}
/* a place's entry in another place's nearby list = its own record */
for (const [nm, list] of nearLists) for (const e of (list || []).slice(0, 8)) { const s = (await j('/api/point/batch?pts=' + f5(e.lat) + ',' + f5(e.lon))).states[0];
  ok(s && s.ok && s.now.tempC === e.tempC && s.now.rh === e.rh && s.now.feelsC === e.feelsC, 'nearby list of ' + nm + ': ' + e.name + ' ' + e.tempC + ' = its own record', s && s.now ? s.now.tempC + ' / rh ' + s.now.rh : s && s.why); }
/* the report prints the served values */
for (const P of PLACES) {
  const B = await j('/api/point?lat=' + f5(P.lat) + '&lon=' + f5(P.lon));
  const r = await fetch(BASE + '/api/report/generate', { method: 'POST', headers: { ...H('customer'), 'content-type': 'application/json' }, body: JSON.stringify({ lat: P.lat, lon: P.lon, kind: 'site_assessment' }), signal: AbortSignal.timeout(600000) });
  const R = await r.json().catch(() => null); if (!R || !R.ok) { ok(false, P.name + ': site report made', r.status + ' ' + JSON.stringify(R).slice(0, 200)); continue; }
  const html = await (await fetch(BASE + R.html, { headers: H('customer') })).text(); const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  for (const [k, want] of [['now', B.shown.now.value], ['nowLabel', B.shown.now.label], ['todayHigh', B.shown.today.high], ['todayLow', B.shown.today.low]]) { const m = new RegExp('data-shown="' + k + '"[^>]*>([^<]*)<').exec(html);
    ok(m && norm(m[1]).replace(/\s*°C$/, '') === norm(want), P.name + ': report ' + R.id + ' · ' + k + ' = served "' + want + '"', m ? m[1] : 'no data-shown="' + k + '" in the report'); }
}
if (process.env.NO113 !== '1') { const r = spawnSync('node', [new URL('../tests28349dat/samevalue113.test.mjs', import.meta.url).pathname, BASE, OUT], { encoding: 'utf8', env: { ...process.env, PLACES: PLACES.map((p) => f5(p.lat) + ',' + f5(p.lon) + ',' + p.name).join(';') }, maxBuffer: 1 << 26, timeout: 3600000 });
  const last = (r.stdout || '').trim().split('\n').pop(); console.log((r.stdout || '').split('\n').filter((l) => /^FAIL/.test(l)).join('\n')); const m = /(\d+) pass, (\d+) fail/.exec(last || ''); ok(m && m[2] === '0', 'samevalue113 (pages): ' + last); }
console.log('samevalue52: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
