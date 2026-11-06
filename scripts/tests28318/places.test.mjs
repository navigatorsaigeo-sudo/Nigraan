import * as __T from '../lib/testenv.mjs';
/* v91.17.283.18 · THE ONE PLACE LAYER. Against a running server (argv[2], default http://127.0.0.1:8787) and this tree's place table:
   P1 a taken name: every unconfirmed record whose name is a confirmed place's or a unit's name is never offered (the class of the
      GeoNames "Sialkot" in Lower Dir); "Sialkot" offers one place named Sialkot, the city
   P2 an unconfirmed village whose name is not taken IS offered, after the confirmed rows, labelled "name not confirmed" (20 cases picked
      by rule from the table: unconfirmed populated records with a unique, untaken name, smallest ids)
   P3 "Lahore" lists one place named Lahore; P4 "F-10" lists the F-10 sector itself first
   P5 200 random points country-wide: the typed coordinates' search row and the reverse answer name the same tehsil and district (100 %)
   P6 200 random records: the record as the search lists it carries the tehsil and district the reverse answer gives at its point (100 %)
   P7 /api/geo/resolve gives the first row of /api/geo/search, for 30 names
   P8 no file of the server or the pages reads a retired place source
   usage: node scripts/tests28318/places.test.mjs [base] */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const BASE = __T.BASE, ROOT = __T.ROOT;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 700) : '')); } };
const J = async (u) => { const r = await fetch(BASE + u); return r.ok ? r.json() : null; };
const S = (q, lim = 20) => J('/api/geo/search?q=' + encodeURIComponent(q) + '&limit=' + lim);
const { norm } = await import(new URL('file://' + join(ROOT, 'server', 'api', 'places.mjs')).href);
const T = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'geo', 'places.json.gz'))).toString('utf8'));
const ci = Object.fromEntries(T.columns.map((c, i) => [c, i]));
const REC = T.rows.map((r) => ({ id: r[ci.id], name: r[ci.name], key: norm(r[ci.name]), lat: r[ci.lat], lon: r[ci.lon], kind: r[ci.kind], level: r[ci.level], confirmed: !!r[ci.confirmed], tehsil: r[ci.tehsil], district: r[ci.district] }));
const taken = new Set(); for (const r of REC) if (r.confirmed || r.level !== 'place') taken.add(r.key);
const POP = new Set(['capital', 'city', 'town', 'village', 'locality']);

/* P1 */
{ const bad = REC.filter((r) => r.key === 'sialkot' && r.level === 'place' && !r.confirmed);
  const s = await S('Sialkot'); const named = (s.results || []).filter((x) => norm(x.name) === 'sialkot' && x.level !== 'tehsil' && x.level !== 'district');
  ok(bad.length >= 1 && !(s.results || []).some((x) => bad.some((b) => b.id === x.id)) && named.length === 1 && named[0].confirmed && /city|town/.test(named[0].kind),
    'P1 "Sialkot": one place named Sialkot (' + (named[0] ? named[0].name + ', ' + named[0].tehsil + ' / ' + named[0].district : '-') + '); the ' + bad.length + ' unconfirmed records of the taken name (' + bad.map((b) => b.district).join(', ') + ') not offered', JSON.stringify(named));
  /* the rule over 40 taken names held by unconfirmed records */
  const cases = REC.filter((r) => r.level === 'place' && !r.confirmed && taken.has(r.key) && POP.has(r.kind)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 40); let leak = [];
  for (const c of cases) { const x = await S(c.name); if ((x.results || []).some((y) => y.id === c.id)) leak.push(c.name + ' ' + c.district); }
  ok(cases.length === 40 && !leak.length, 'P1b 40 unconfirmed records carrying a taken name (picked by rule): none offered', leak.join('; ')); }
/* P2 */
{ const cnt = new Map(); for (const r of REC) cnt.set(r.key, (cnt.get(r.key) || 0) + 1);
  const cases = REC.filter((r) => r.level === 'place' && !r.confirmed && POP.has(r.kind) && !taken.has(r.key) && cnt.get(r.key) === 1 && r.key.length >= 4).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, 20);
  let good = 0, why = [];
  for (const c of cases) { const x = await S(c.name); const R = x.results || []; const i = R.findIndex((y) => y.id === c.id); const row = R[i];
    const after = i >= 0 && R.slice(0, i).every((y) => y.score > row.score || y.confirmed !== false);
    if (row && row.note === 'name not confirmed' && row.confirmed === false && after) good++; else why.push(c.name + ' -> ' + (row ? 'row ' + i + ' note ' + row.note : 'not offered')); }
  ok(cases.length === 20 && good === 20, 'P2 20 real unconfirmed villages (unique untaken name; WorldPop/WorldCover evidence kept them): ' + good + '/20 offered, after the confirmed rows, "name not confirmed"' + (cases[0] ? ' (e.g. ' + cases[0].name + ', ' + cases[0].district + ')' : ''), why.join('; ')); }
/* P3, P4 */
{ const s = await S('Lahore'); const named = (s.results || []).filter((x) => norm(x.name) === 'lahore');
  ok(named.length === 1 && named[0].level === 'settlement' && s.results[0].id === named[0].id, 'P3 "Lahore": one Lahore, first (' + (named[0] ? named[0].tehsil + ' / ' + named[0].district : '-') + ')', JSON.stringify((s.results || []).map((x) => [x.name, x.level, x.district]))); }
{ const s = await S('F-10'); const t = (s.results || [])[0];
  ok(t && t.name === 'F-10' && t.confirmed && t.district === 'Islamabad' && !(s.results || []).slice(1).some((x) => x.name === 'F-10' && x.district === 'Islamabad'), 'P4 "F-10": the F-10 sector itself first (' + (t ? t.lat + ', ' + t.lon + '; then ' + (s.results || []).slice(1, 5).map((x) => x.name).join(', ') : '-') + ')'); }
/* P5 */
{ let seed = 283018; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let n = 0, same = 0, tries = 0; const bad = [];
  while (n < 200 && tries < 4000) { tries++; const lat = 24 + rnd() * 13, lon = 61 + rnd() * 16.5;
    const rv = await J('/api/geo/reverse?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5)); if (!rv || !rv.administered) continue; n++;
    const s = await S(lat.toFixed(5) + ', ' + lon.toFixed(5), 1); const r = s && s.results && s.results[0];
    if (r && r.tehsil === rv.unit.tehsil && r.district === rv.unit.district) same++; else bad.push([lat.toFixed(4), lon.toFixed(4), r && r.tehsil, rv.unit.tehsil].join(' ')); }
  ok(n === 200 && same === 200, 'P5 200 random points country-wide: search tehsil/district = reverse tehsil/district ' + same + '/' + n + ' (' + tries + ' draws)', bad.slice(0, 5).join('; ')); }
/* P6 */
{ let seed = 18; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const places = REC.filter((r) => r.level === 'place'); let n = 0, same = 0, listed = 0; const bad = [];
  for (let k = 0; k < 200; k++) { const c = places[Math.floor(rnd() * places.length)]; n++;
    const s = await S(c.name, 20); let row = (s.results || []).find((y) => y.id === c.id); if (row) listed++; else { const g = await J('/api/geo/place?id=' + encodeURIComponent(c.id)); row = g && g.place; }
    const rv = await J('/api/geo/reverse?lat=' + c.lat + '&lon=' + c.lon);
    if (row && rv && rv.unit && row.tehsil === rv.unit.tehsil && row.district === rv.unit.district) same++; else bad.push(c.name + ' ' + (row && row.tehsil) + ' vs ' + (rv && rv.unit && rv.unit.tehsil)); }
  ok(same === 200, 'P6 200 random records: the row\'s tehsil/district = reverse at its point ' + same + '/' + n + ' (' + listed + ' found in the search list, the rest read by id)', bad.slice(0, 5).join('; ')); }
/* P7 */
{ const NAMES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Peshawar', 'Quetta', 'Multan', 'Faisalabad', 'Hyderabad', 'Sukkur', 'Muzaffarabad', 'Gilgit', 'Skardu', 'Chitral', 'Murree', 'Abbottabad',
    'Gwadar', 'Turbat', 'Zhob', 'Mithi', 'Taxila', 'Sialkot', 'F-10', 'G-11', 'Gulberg Lahore', 'Murree tehsil', 'Kahuta tehsil', 'Hunza district', 'Kotli district', 'Thatta'];
  const bad = []; for (const q of NAMES) { const s = await S(q, 8), r = await J('/api/geo/resolve?q=' + encodeURIComponent(q)); const t = s && s.results && s.results[0];
    if (!(t && r && r.ok && r.id === t.id && r.lat === t.lat && r.lon === t.lon && r.tehsil === t.tehsil)) bad.push(q); }
  ok(!bad.length, 'P7 resolve = the first search row, 30 names', bad.join(', ')); }
/* P8 */
{ const OLD = /pk-places(\.tsv|-osm|-extra|\.meta)|place-spellings|pk-names-urdu|place-areas|street-index|gazetteer\.mjs|placeareas\.mjs|streetsearch\.mjs|placerule\.mjs|app\.gazetteer|PK_SETTLEMENTS|\/v1\/search/;
  const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(mjs|js|html)$/.test(n)) files.push(p); } };
  walk(join(ROOT, 'server'));
  /* the science host runs only the modules its manifest lists; an older module file left beside them (an earlier build's name) is not read */
  { const M = new Set(JSON.parse(readFileSync(join(ROOT, 'server', 'science', 'manifest.json'), 'utf8')).modules.map((m) => m.file));
    for (let i = files.length - 1; i >= 0; i--) { const f = files[i].split(/[\\/]/); if (f[f.length - 2] === 'modules' && f[f.length - 3] === 'science' && !M.has(f[f.length - 1])) files.splice(i, 1); } } for (const f of ['AI_GEO_NIGRAAN_v91_17_MACH.html', 'NIGRAAN_START.html', 'NIGRAAN_3.html']) files.push(join(ROOT, 'artefact', f));
  const hits = []; for (const f of files) { const t = readFileSync(f, 'utf8'); const lines = t.split('\n'); lines.forEach((l, i) => { if (OLD.test(l) && !/^\s*(\/\*|\*|\/\/)/.test(l) && !/v91\.17\.283\.18/.test(l)) hits.push(f.slice(ROOT.length + 1) + ':' + (i + 1) + ' ' + l.trim().slice(0, 100)); }); }
  ok(!hits.length, 'P8 no reader of a retired place source in server/ or the pages (' + files.length + ' files scanned)', hits.slice(0, 8).join(' | ')); }
console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
