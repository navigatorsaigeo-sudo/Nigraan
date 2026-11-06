/* v91.17.77 · SCI · the outlook event science (CEO 27 Sep: heat spell painted Severe over Islamabad and upper Sindh at the end
   of September, cold spell painted on the Karachi / Thatta coast).
     node scripts/tests77/outlook_science.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A · the data files: definitions with sources (WMO-No. 1310, ETCCDI, Perkins & Alexander 2013, IMD heat and cold wave floors),
       the 1991-2020 event base rates, and their percentiles reproducing data/climatology.json.
   B · the served definitions: relative wording, the rule carries the floors from the data file, no hard-coded number in the label.
   C · the ordinary guard: on every event and single-day chance layer, no tehsil is at High or Severe (>= the High class of
       data/map-layer-scales.json) where the event is climatologically ordinary; every withheld value names the reason.
   D · the relative test is on one basis: a unit with a relative event served names its (model - reanalysis) offset; the
       heat spell equals its hot-day sub-class (warm nights and >= 40 C alone no longer fire it).
   E · alignment: every tehsil in the run (the 13 grid-cell-sharing units of 27 Sep are the regression case).
   PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : '')); };
const getJ = async (p) => { const r = await fetch(BASE + p, { headers: { 'Sec-Fetch-Site': 'same-origin' } }); return r.ok ? r.json() : null; };
const readJ = (f) => { try { return JSON.parse(readFileSync(join(DATA, f), 'utf8')); } catch (_) { return null; } };

/* A */
const DEF = readJ('outlook-event-definitions.json');
ok(!!DEF, 'A1 data/outlook-event-definitions.json installed');
const srcIds = DEF ? DEF.sources.map(s => s.id) : [];
ok(['WMO1310', 'ETCCDI', 'PA2013', 'IMD-HW', 'IMD-CW'].every(x => srcIds.includes(x)), 'A2 definitions cite WMO-No. 1310, ETCCDI, Perkins & Alexander 2013 and IMD heat / cold wave criteria', srcIds.join(', '));
ok(DEF && DEF.events.heatSpell.floor.byZone.plains != null && DEF.events.coldSpell.floor.byZone.coast != null && DEF.ordinaryGuard.ordinaryBaseRatePct != null, 'A3 floors and the ordinary line are data');
const EVC = readJ('outlook-event-climate.json');
ok(!!EVC && Object.keys(EVC.units || {}).length >= 570, 'A4 data/outlook-event-climate.json installed for the tehsils', EVC ? Object.keys(EVC.units).length + ' units, built ' + EVC.built : 'missing');
if (EVC) {
  const ch = Object.values(EVC.units).map(u => u.checkVsClimatology && u.checkVsClimatology.maxAbsDiffC).filter(x => x != null);
  ok(ch.length > 400 && Math.max(...ch) <= 0.1, 'A5 its percentiles reproduce data/climatology.json where built at the same height', ch.length + ' units, max |diff| ' + Math.max(...ch) + ' C');
}

/* B */
const isb = await getJ('/api/outlook/unit?unit=Islamabad');
const defs = isb && isb.events && isb.events.definitions;
const dh = defs && defs.find(d => d.id === 'heatSpell'), dc = defs && defs.find(d => d.id === 'coldSpell');
ok(!!dh && /hotter than usual for this place and time of year/.test(dh.label), 'B1 heat spell reads "hotter than usual for this place and time of year"', dh && dh.label);
ok(!!dc && /colder than usual for this place and time of year/.test(dc.label), 'B2 cold spell reads "colder than usual for this place and time of year"', dc && dc.label);
ok(!!dh && !/\d/.test(dh.label) && !!dc && !/\d/.test(dc.label), 'B3 no number typed into the labels');
ok(!!dh && DEF && dh.rule.includes('plains ' + DEF.events.heatSpell.floor.byZone.plains + ' °C') && dc.rule.includes('coast ' + DEF.events.coldSpell.floor.byZone.coast + ' °C'), 'B4 the served rule carries the floors from the data file', dh && dh.rule);
const SUP = /ERA5|ECMWF|IFS|Open-Meteo|PMD|NOAA|GloFAS/;
ok(!!defs && !defs.some(d => SUP.test(d.label + ' ' + (d.rule || ''))), 'B5 no supplier name in the served definitions');

/* C */
const SC = readJ('map-layer-scales.json');
const hiMin = SC && SC.outlookChance ? (SC.outlookChance.classes.find(c => c.level === 'High') || {}).min : 60;
const cut = DEF ? DEF.ordinaryGuard.ordinaryBaseRatePct : 50;
const cat = await getJ('/api/map/layers');
const evIds = [], dayIds = [];
for (const g of cat || []) for (const [id] of g.items) { if (id.startsWith('ev:')) evIds.push(id); if (id.startsWith('day:')) dayIds.push(id); }
ok(evIds.length >= 9 && dayIds.length >= 8, 'C0 layer catalogue', evIds.length + ' event, ' + dayIds.length + ' day layers');
let checked = 0, bad = [], withheldNoWhy = 0, ordinaryN = 0;
const unitCache = new Map();
const unitOf = async (uid) => { if (!unitCache.has(uid)) unitCache.set(uid, await getJ('/api/outlook/unit?unit=' + encodeURIComponent(uid))); return unitCache.get(uid); };
for (const id of evIds) {
  const L = await getJ('/api/map/layer?id=' + encodeURIComponent(id)); if (!L || !L.ready) { ok(false, 'C1 layer ' + id + ' ready'); continue; }
  for (const w of Object.values(L.whys || {})) { if (!w) withheldNoWhy++; if (/^ordinary here/.test(w)) ordinaryN++; }
  const key = id.slice(3) === 'meltWarmth' ? 'unusualWarmth' : id.slice(3);
  for (const [uid, v] of Object.entries(L.values)) {
    if (v < hiMin) continue; checked++;
    const U = await unitOf(uid); const e = U && U.events && U.events[key];
    if (!e || e.climP == null || e.climP >= cut) bad.push(id + ' ' + uid + ' p ' + v + ' climP ' + (e && e.climP));
  }
}
for (const id of dayIds) {
  const L = await getJ('/api/map/layer?id=' + encodeURIComponent(id)); if (!L || !L.ready) continue;
  for (const w of Object.values(L.whys || {})) if (!w) withheldNoWhy++;
  const key = id.slice(4);
  for (const [uid, v] of Object.entries(L.values)) {
    if (v < hiMin) continue; checked++;
    const U = await unitOf(uid); const day = U && U.ensemble && U.ensemble.days.find(d => d.date === L.valid);
    if (!day || day.p[key] == null) bad.push(id + ' ' + uid + ' served ' + v + ' but the unit card withholds it');
    else if (EVC && EVC.units[uid]) { const doy = (() => { const d = new Date(L.valid + 'T00:00:00Z'); const y = d.getUTCFullYear(); const leap = y % 4 === 0; let n = Math.round((d - Date.UTC(y, 0, 1)) / 864e5); if (!leap && n >= 59) n++; return n; })();
      const a = EVC.units[uid].day[key]; const base = a ? a[Math.min(a.length - 1, Math.round(doy / EVC.startStepDays))] : null; if (base != null && base >= cut) bad.push(id + ' ' + uid + ' p ' + v + ' base ' + base); }
  }
}
ok(bad.length === 0, 'C1 no High/Severe chance where the event is climatologically ordinary (event and day layers)', checked + ' High/Severe values checked' + (bad.length ? '; ' + bad.slice(0, 6).join('; ') : ''));
ok(withheldNoWhy === 0, 'C2 every withheld value names its reason', ordinaryN + ' tehsil-layer values withheld as ordinary today');

/* D */
let relUnits = 0, relNoBasis = 0, heatMismatch = 0, nU = 0;
for (const q of ['Islamabad', 'Lahore Cantt', 'Saddar Town', 'Gilgit', 'Jacobabad', 'Skardu', 'Kharo Chan', 'Palas', 'Seo', 'Quetta City']) {
  const U = await unitOf(q); if (!U || !U.events) continue; nU++;
  const E = U.events;
  if (E.heatSpell && E.heatSpell.p != null) { relUnits++; if (!(E.thresholdBasis && E.thresholdBasis.relative)) relNoBasis++; }
  const hc = E.heatSpellClasses && E.heatSpellClasses.localDay;
  if (E.heatSpell && E.heatSpell.p != null && hc && hc.p !== E.heatSpell.p) heatMismatch++;
}
ok(nU >= 8 && relUnits > 0 && relNoBasis === 0, 'D1 a relative event is served only with its (model - reanalysis) basis named', relUnits + ' of ' + nU + ' spot units');
ok(heatMismatch === 0, 'D2 the heat spell is the hot-day spell (warm nights or >= 40 C alone do not fire it)');

/* E */
const st = await getJ('/api/outlook/status');
ok(!!st && st.ensemble && st.ensemble.failedUnits === 0 && st.ensemble.tehsils >= 576, 'E1 every tehsil in the run (height-echo alignment)', st && st.ensemble ? st.ensemble.tehsils + ' tehsils, ' + st.ensemble.failedUnits + ' failed (a run made before v91.17.77 shows 575 / 1; environmental if the provider is slow)' : 'no run');

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
