/* v91.17.283.38 item 8 · GLOF ONLY WHERE IT CAN HAPPEN (owner decision 30 Oct 2026)
   G1 the served GLOF layer issues no level (no cell >= 0); inside cells (-5) are in Gilgit-Baltistan, Azad Kashmir or the Khyber Pakhtunkhwa
      mountains, each with its exposure (priority / watch / none); Punjab, Sindh, Balochistan and Islamabad: cannot happen here (-4)
   G2 the reasons are plain: no "class ladder", no file names, no "100 km" route
   G3 the reach rule on the data (glofdrain drainageUnits + data/glof-reach.json) gives the same inside set as the server
   G4 the page: the GLOF key lists the lakes-upstream shades with counts, no Normal / High / Severe rows; GB tehsils are shaded
   usage: node scripts/tests28338/glof38.test.mjs [base]   (a server whose data holds hybas_pk_lev07.json, hazard science re-applied) */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, open, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const j = await fetch(BASE + '/api/levels?layer=glof&day=0').then((r) => r.json());
const L = j.levels || {}, E = j.exposure || {}, W = j.whys || {};
const c = {}; for (const v of Object.values(L)) c[v] = (c[v] || 0) + 1; console.log('INFO glof states ' + JSON.stringify(c) + ' exposure ' + JSON.stringify(Object.values(E).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {})));
ok(!Object.values(L).some((v) => v >= 0), 'G1 no GLOF level is issued (no cell >= 0)');
const inside = Object.keys(L).filter((u) => L[u] === -5);
ok(inside.length > 50 && inside.length < 200, 'G1 inside the reach: ' + inside.length + ' tehsils (laptop data: 127)');
ok(inside.every((u) => /^(Gilgit Baltistan|Azad Kashmir|Khyber Pakhtunkhwa)\|/.test(u)), 'G1 every inside tehsil is in GB, AJK or KP', inside.filter((u) => !/^(Gilgit Baltistan|Azad Kashmir|Khyber Pakhtunkhwa)\|/.test(u)).slice(0, 5));
ok(inside.every((u) => ['priority', 'watch', 'none'].includes(E[u])), 'G1 every inside tehsil carries its exposure');
ok(Object.keys(L).filter((u) => /^(Punjab|Sindh|Balochistan|Federal Capital)\|/.test(u)).every((u) => L[u] === -4), 'G1 Punjab, Sindh, Balochistan, Islamabad: cannot happen here');
ok(!Object.values(W).some((w) => /class ladder|\.json\b|100 km|HydroBASINS level/.test(w)), 'G2 plain reasons', Object.values(W).find((w) => /class ladder|\.json\b|100 km|HydroBASINS level/.test(w)));
/* G3 */
const U = '/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data/', D0 = join(ROOT, 'data'); const J = (f) => JSON.parse(readFileSync(existsSync(join(D0, f)) ? join(D0, f) : U + f, 'utf8'));
if (existsSync(join(D0, 'hybas_pk_lev07.json')) || existsSync(U + 'hybas_pk_lev07.json')) {
  const { drainageUnits } = await import('../../server/api/glofdrain.mjs'); const reach = J('glof-reach.json'), tz = J('tehsil-terrain-zone.json'), rel = J('glof-lake-relevance.json'), rg = J('glof-register-current.json');
  const ex = new Set(reach.excludeRelevanceClasses); const MS = new Map(Object.values(tz.units).map((v) => [v.uid, v.mountainShare]));
  const lakes = rg.lakes.filter((x) => !(rel.lakes[x.id] && ex.has(rel.lakes[x.id].class))).map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, tier: x.tier }));
  const R = drainageUnits(J('hybas_pk_lev07.json'), lakes, J('pk-tehsils.json'), { inRegion: (u) => { const p = u.split('|')[0]; return reach.regionProvinces.includes(p) || (reach.mountainProvinces.includes(p) && (MS.get(u) ?? 0) >= reach.mountainShareMin); } });
  const ins = Object.keys(R.units).filter((u) => R.units[u].connected && !/Indian Illegally/.test(u)).sort();
  ok(JSON.stringify(ins) === JSON.stringify(inside.slice().sort()), 'G3 the reach rule on the data gives the server\'s inside set (' + ins.length + ')', ins.filter((u) => !inside.includes(u)).concat(inside.filter((u) => !ins.includes(u))).slice(0, 6)); }
/* G4 */
const br = await browser(); const o = await open(br, '/analyst#agnplace=35.92080,74.30890,Gilgit'); await o.pg.waitForTimeout(20000);
await o.pg.evaluate(() => { const s = document.getElementById('mapHazardPick'); s.value = 'glof'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await o.pg.waitForTimeout(6000);
const r = await o.pg.evaluate(() => { const leg = (document.getElementById('v3legend') || {}).innerText || ''; let fills = {}; try { districtLayer.eachLayer((l) => { const p = l.feature && l.feature.properties; if (p && /^Gilgit Baltistan/.test(p.province)) { const f = l.options.fillColor; fills[f] = (fills[f] || 0) + 1; } }); } catch (_) {} return { leg, fills, strip: (document.getElementById('agn242Leg') || {}).innerText }; });
ok(/Priority/.test(r.leg) && /Watch/.test(r.leg) && /Low-susceptibility/.test(r.leg) && /Cannot happen here/.test(r.leg), 'G4 the key lists the lakes-upstream shades', r.leg.slice(0, 200));
ok(!/\bNormal\b|\bSevere\b|not yet tested/.test(r.leg), 'G4 no Normal / Severe rows, no "not yet tested"', r.leg.slice(0, 300));
ok(Object.keys(r.fills).some((f) => /^#(1f4e79|5b8db8|bcd3e6)$/i.test(f)), 'G4 GB tehsils shaded by lakes upstream', r.fills);
ok(o.errs.length === 0, 'G4 no page errors', o.errs.join(' | ')); await br.close(); done();
