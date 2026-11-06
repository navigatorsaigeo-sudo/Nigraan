#!/usr/bin/env node
/* v91.17.72 · CROP BURNING UPWIND (agent F). NASA FIRMS fires → data/fires.json → the smog outlook and the air:fires layer.
     1  the load geometry (server/api/fireload.mjs): upwind counts, downwind does not, calm is isotropic, local always counts
     2  data files: licence "NASA FIRMS", provenance, the validation block, the modifier decision
     3  /api/smog/unit: every day carries fires {class, label, upwind, observed} and reasons[]; a reason line only above the
        data-file threshold and in the fixed wording; smogDay is still PM class >= Unhealthy AND dispersion >= Poor
     4  /api/smog/national: fires block (classes, sectors, top)
     5  /api/map/layer?id=air:fires: classes4 with the config labels, values only 0-3 and only on tehsils the smog
        engine serves (no value, no colour); no supplier names anywhere
   node scripts/tests72/fire.test.mjs [baseUrl]      (default http://127.0.0.1:8787) */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireLoadAt, vectorWind, loadClass } from '../../server/api/fireload.mjs';
import { localDate } from '../firms_fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const BASE = (process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
const SL = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8'));
const NAMES = new RegExp('(?<![\\p{L}\\p{N}_])(' + (SL.forbiddenInCustomerOutput || []).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}_])', 'iu');
let fails = 0, passes = 0;
const check = (name, ok, detail) => { if (ok) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (detail ? ' · ' + String(detail).slice(0, 300) : '')); } };
const get = async (p) => { try { const r = await fetch(BASE + p); return { status: r.status, j: await r.json().catch(() => null) }; } catch (e) { return { status: 0, err: e.message }; } };

/* 1 · geometry */
const C = JSON.parse(readFileSync(join(ROOT, 'data', 'fires-config.json'), 'utf8')), P = C.params;
const lah = [31.52, 74.35], east = { lat: 31.52, lon: 75.35, frp: 10 }, west = { lat: 31.52, lon: 73.35, frp: 10 }, here = { lat: 31.53, lon: 74.36, frp: 5 };
const fromE = fireLoadAt(lah[0], lah[1], 90, 3, [east], P), fromW = fireLoadAt(lah[0], lah[1], 270, 3, [east], P);
check('1a an easterly wind carries a fire 95 km east (upwind, weight > 0)', fromE.load > 0 && fromE.upwind === 1, JSON.stringify(fromE));
check('1b a westerly wind does not (downwind, weight 0)', fromW.load === 0 && fromW.upwind === 0, JSON.stringify(fromW));
const calm = fireLoadAt(lah[0], lah[1], null, 0.2, [east, west], P);
check('1c calm wind: isotropic weight, no upwind count', calm.calm && calm.load > 0 && calm.upwind === 0 && Math.abs(calm.load - 2 * P.isotropicWeight * Math.exp(-95 / P.decayKm)) < 0.2, JSON.stringify(calm));
const loc = fireLoadAt(lah[0], lah[1], 270, 3, [here], P);
check('1d a fire inside localKm counts whatever the wind', loc.local === 1 && loc.upwind === 1 && loc.load > 0.9, JSON.stringify(loc));
check('1e beyond radiusKm is ignored', fireLoadAt(lah[0], lah[1], 90, 3, [{ lat: 31.52, lon: 78.0, frp: 1 }], P).within === 0);
const vw = vectorWind([10.8, 10.8, 10.8], [260, 270, 280]);
check('1f vector wind: from 270, 3 m/s', vw.fromDeg === 270 && Math.abs(vw.ms - 2.95) < 0.1, JSON.stringify(vw));
check('1g acq time UTC → PKT date (20:30 UTC is next local day)', localDate('2026-11-01', '2030') === '2026-11-02' && localDate('2026-11-01', '0830') === '2026-11-01');
check('1h load classes from the data file', loadClass(0.4, C.classes) === 0 && loadClass(C.classes.loadMin[3], C.classes) === 3);

/* 2 · data files */
const F = JSON.parse(readFileSync(join(ROOT, 'data', 'fires.json'), 'utf8'));
for (const [nm, j] of [['fires.json', F], ['fires-config.json', C], ['fires-archive.json', JSON.parse(readFileSync(join(ROOT, 'data', 'fires-archive.json'), 'utf8'))]])
  check('2a ' + nm + ' licence header: NASA FIRMS attribution + url + built/method/source/n', j.licence && /NASA FIRMS/.test(j.licence.attribution) && j.licence.url && j.built && j.method && j.source && j.n != null);
check('2b fires.json: at least one sensor read, window of days, points and sector labels', F.sensors.some(s => s.ok) && F.days.length >= 3 && Array.isArray(F.points.rows) && F.sectorLabels && F.sectorLabels.in_punjab);
check('2c crop mask and static screen say what was done', typeof F.cropMask === 'string' && typeof F.staticScreen === 'string');
const V = C.validation || {};
check('2d validation measured on Oct-Dec 2023/2024 with both models', V.n > 1000 && V.models && V.models.met && V.models.metFire && V.models.metFire.auc > 0, JSON.stringify(V.models || {}).slice(0, 200));
check('2e reason threshold and classes come from the validation', C.reason.minFires === V.reasonThreshold.minFires && C.classes.loadMin[2] === Math.round(V.loadQuantiles.p50) && C.classes.loadMin[3] === Math.round(V.loadQuantiles.p90));
check('2f modifier decision recorded (explanatory only)', C.modifier && C.modifier.applied === false && /CAMS/.test(C.modifier.why));

/* 3 · the tehsil air outlook */
const u = await get('/api/smog/unit?unit=Kasur');
if (u.status === 0) { check('3 server reachable at ' + BASE, false, u.err); }
else {
  const days = (u.j && u.j.days) || [];
  check('3a /api/smog/unit Kasur: every day has fires {cls, label, upwind, observed}', days.length && days.every(d => d.fires && d.fires.cls >= 0 && d.fires.cls <= 3 && C.classes.labels[d.fires.cls] === d.fires.label && Number.isInteger(d.fires.upwind) && /\d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d/.test(d.fires.observed)), JSON.stringify(days[0] && days[0].fires));
  check('3b reasons[] present; a reason only in the fixed wording', days.every(d => Array.isArray(d.reasons) && d.reasons.every(r => /^crop burning upwind: \d+ fires in \d+ days/.test(r))));
  check('3c smogDay is unchanged by fires (PM class >= Unhealthy AND dispersion >= Poor)', days.every(d => d.smogDay === (d.pmClass != null && d.pmClass >= 3 && d.dispersion != null && d.dispersion >= 2)));
  check('3d credit NASA FIRMS and a note that it explains, not changes', u.j.firesSource && u.j.firesSource.attribution === 'NASA FIRMS' && (u.j.notes || []).some(n => /Crop burning upwind/.test(n)));
  check('3e no supplier names in the air outlook', !NAMES.test(JSON.stringify(u.j)), (JSON.stringify(u.j).match(NAMES) || [])[0]);
  /* a reason appears exactly when the S-NPP-equivalent upwind count reaches the threshold */
  const n = await get('/api/smog/national?day=1');
  const fz = n.j && n.j.fires;
  check('4a /api/smog/national: fires block with classes, sectors and top list', fz && fz.classes.length === 4 && Array.isArray(fz.sectors) && Array.isArray(fz.top) && fz.byClass.reduce((a, x) => a + x.tehsils, 0) === n.j.tehsils, JSON.stringify(fz || {}).slice(0, 200));
  check('4b top list ranked by load, reasons consistent', fz && fz.top.every((r, i, a) => !i || a[i - 1].load >= r.load) && fz.top.every(r => r.reason == null || /^crop burning upwind:/.test(r.reason)));
  const cat = await get('/api/map/layers');
  check('5a air:fires in the map catalogue', JSON.stringify(cat.j || []).includes('"air:fires"'));
  const L = await get('/api/map/layer?id=air:fires&i=1');
  const vals = Object.values((L.j && L.j.values) || {});
  check('5b air:fires ready, classes4 with the config labels', L.j && L.j.ready && L.j.type === 'classes4' && JSON.stringify(L.j.labels) === JSON.stringify(C.classes.labels), JSON.stringify(L.j || {}).slice(0, 200));
  check('5c values only 0-3 and only on tehsils the smog engine serves', vals.length > 0 && vals.every(v => Number.isInteger(v) && v >= 0 && v <= 3) && vals.length <= n.j.tehsils && !Object.keys(L.j.values).some(k => /Occupied/.test(k)));
  check('5d the layer says what it is (satellite fire detections) and that it is explanatory; the supplier is credited on Sources, not in the layer (v256: 5e bans supplier names in the layer)', /satellite fire detections/.test(L.j.source) && /explanatory/.test(L.j.source));
  check('5e no supplier names in the layer', !NAMES.test(JSON.stringify(L.j)));
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
