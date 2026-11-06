#!/usr/bin/env node
/* v91.17.283.52 set A · N3: the area-heat pass asks failed points once more, and a tehsil whose points all failed keeps the previous pass
   (under 6 h) with its source saying so; a tehsil with an answered point is judged on this pass. usage: node areaheat52.unit.mjs */
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.NIGRAAN_AREA_HEAT_RETRY_S = '0'; process.env.NIGRAAN_ENGINE = '0';
const { createAreaHeat, applyTo } = await import(join(ROOT, 'server', 'api', 'areaheat.mjs'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const dir = mkdtempSync(join(tmpdir(), 'ah52-')); mkdirSync(join(dir, 'cache'));
const units = { 'P|A|A': { lat: 31, lon: 74, name: 'A' }, 'P|B|B': { lat: 30, lon: 72, name: 'B' }, 'P|C|C': { lat: 29, lon: 71, name: 'C' } };
writeFileSync(join(dir, 'tehsil-anchor.json'), JSON.stringify({ units: Object.fromEntries(Object.entries(units).map(([u, x]) => [u, { anchor: { lat: x.lat, lon: x.lon, name: x.name, population: 1000 } }])) }));
writeFileSync(join(dir, 'tehsil-popcells.json'), JSON.stringify({ rule: { share: 0.25 }, units: Object.fromEntries(Object.entries(units).map(([u, x]) => [u, [{ kind: 'main settlement', lat: x.lat, lon: x.lon, pop: 1000 }]])) }));
try { copyFileSync(join(ROOT, 'data', 'heat-index-bands.json'), join(dir, 'heat-index-bands.json')); } catch (_) {}
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const st = (utci) => ({ ok: true, days: [0, 1, 2, 3].map((l) => ({ lead: l, date: new Date(Date.parse(today) + l * 864e5).toISOString().slice(0, 10), heat: { utciMaxC: utci, at: '12:00' }, cold: { utciMinC: 10 } })), hours: [] });
let mode = 'first', calls = 0;
const app = { pointState: { status: () => ({ run: 'R' + mode }), many: async (pts) => { calls++;
  return pts.map((p) => { if (mode === 'first') return st(p.lat > 30 ? 35 : 20);                      /* A: Moderate (UTCI 35), B, C: Normal */
    if (mode === 'retry') return (p.lat === 30 && calls === 1) ? { ok: false, why: 'the forecast provider did not answer in time' } : st(p.lat > 30 ? 35 : 28);
    if (mode === 'down') return p.lat === 29 ? { ok: false, why: 'the forecast provider did not answer in time' } : st(30);
    return null; }); } } };
const AH = createAreaHeat(app, { dataDir: dir });
const P = AH.points(); ok(P.length >= 3, 'points of the 3 test tehsils: ' + P.length);
let r = await AH.refresh(true); ok(r.started && r.failed === 0, 'first pass all answered');
const lv = (uid) => { const u = AH.unit(uid); return u && u.days[today] ? u.days[today].level : undefined; };
ok(lv('P|A|A') === 2 && lv('P|C|C') === 0, 'first pass levels A Moderate, C Normal (' + lv('P|A|A') + ',' + lv('P|C|C') + ')');
mode = 'retry'; calls = 0; r = await AH.refresh(true); const s1 = AH.status();
ok(s1.retried >= 1 && s1.recovered === s1.retried && s1.failed === 0, 'a point that timed out is asked again and recovered (retried ' + s1.retried + ', recovered ' + s1.recovered + ')');
ok(lv('P|B|B') === 1, 'B judged on this pass after the retry (Low at UTCI 28): ' + lv('P|B|B'));
mode = 'down'; r = await AH.refresh(true); const s2 = AH.status();
ok(s2.carried === 1, 'C (all points failed twice) keeps the previous pass: carried ' + s2.carried);
ok(lv('P|C|C') === 1 && AH.unit('P|C|C').carried, 'C level is the previous pass level (Low, UTCI 28) with its time: ' + lv('P|C|C') + ' ' + AH.unit('P|C|C').carried);
ok(lv('P|A|A') === 1, 'A judged on this pass (UTCI 30 -> Low): ' + lv('P|A|A'));
const rec = { days: [{ day: 0, date: today, layers: { heat: { L: { 'P|A|A': 0, 'P|B|B': 0, 'P|C|C': 0 } }, cold: { L: { 'P|A|A': 0, 'P|B|B': 0, 'P|C|C': 0 } } } }] };
AH.apply(rec); const src = rec.days[0].layers.heat.src || {};
ok(/previous pass/.test(src['P|C|C'] || ''), 'the issued record names the carried value: ' + src['P|C|C']);
ok(src['P|A|A'] === 'area', 'an answered tehsil is "area": ' + src['P|A|A']);
console.log('areaheat52.unit: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
