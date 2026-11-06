import { viaBundle, partOf as partOfB } from '../lib/retired.mjs';
/* v91.17.70 · Sprint 1 · FLOOD / RAIN / DROUGHT / LADDER (s70/CHANGES_flood_rain.md).
   Runs against the local server after the integrator restarts it:  node nigraan-local/scripts/tests70/flood_rain.test.mjs
   Prints PASS/FAIL lines and exits 1 on any FAIL. Tests what a customer receives. The server must run WITHOUT
   NIGRAAN_INTERNAL_REF (the default): official barrage limits, PMD gauge thresholds and model m³/s stay internal. */
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const get = async (p, ms = 180000) => { try { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(ms) }); let j = null, t = ''; try { t = await r.text(); j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; } catch (e) { return { status: 0, json: null, text: String(e && e.message) }; } };
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
const NAMED = /\b(PMD|FFD|Flood Forecasting Division)\b/;
const LEVELS = ['Low', 'Monitor', 'Watch', 'Act'];

/* ── 1. river: one rarity class per reach, no model m³/s, no official limits, no "Clear" ── */
const S = await get('/api/flood/status');
ok(S.status === 200 && S.json, 'flood status served', S.status);
ok(S.json && S.json.internalRef === false, 'internal reference flag is off for customers', S.json && S.json.internalRef);
ok(S.json && S.json.rarity && S.json.rarity.built && S.json.rarity.reaches >= 20, 'river rarity table loaded (data/river-rarity.json)', JSON.stringify(S.json && S.json.rarity).slice(0, 200));
ok(S.json && S.json.rarity && S.json.rarity.source && /Copernicus/.test(S.json.rarity.source.attribution || '') && S.json.rarity.source.licence, 'river rarity carries licence and Copernicus attribution');
const N = await get('/api/flood/national?day=0');
ok(N.status === 200 && N.json && N.json.ready, 'national river table served', N.status + ' ' + (N.json && N.json.why));
const R = (N.json && N.json.rows) || [];
ok(R.length >= 20, 'every snapped reach has a row (' + R.length + ')');
const withheld = r => r.class == null && !!r.classWhy;  /* v93: an under-calling reach has no class, with its reason */
ok(R.every(r => LEVELS.includes(r.class) || withheld(r)), 'river classes are Low / Monitor / Watch / Act only (or withheld with a reason)', [...new Set(R.map(r => r.class))].join(','));
ok(R.every(r => withheld(r) || (r.word && !/Clear/.test(r.word))), 'every classed reach carries its class words');
ok(R.every(r => r.q === undefined && r.levels === undefined && r.p === undefined), 'no model discharge or m³/s return level reaches the customer row');
ok(R.every(r => r.class !== 'Act' || (r.shareAbove5yr != null && r.shareAbove5yr >= 50)), 'Act only when the ensemble median is at or above the reach\'s own 5-year model flow');
ok(R.filter(r => ['guddu', 'sukkur', 'kotri'].includes(r.id)).every(r => r.class !== 'Act' || r.shareAbove5yr >= 50), 'lower Indus cannot read Act from the official limits (model-own rarity only)');
const east = R.filter(r => ['Chenab', 'Ravi', 'Sutlej', 'Jhelum'].includes(r.river));
ok(east.length >= 8 && east.every(r => LEVELS.includes(r.class) || withheld(r)), 'Chenab / Ravi / Sutlej / Jhelum reaches read as rarity classes (' + east.length + ')');
ok(N.json && N.json.byClass && LEVELS.reduce((s, k) => s + (N.json.byClass[k] || 0), 0) + R.filter(withheld).length === R.length, 'class counts add up', JSON.stringify(N.json && N.json.byClass));
ok(!NAMED.test(N.text), 'national river payload names no internal-reference source', (N.text.match(NAMED) || [])[0]);
console.log('     river classes day 0: ' + JSON.stringify(N.json && N.json.byClass));
const P = await get('/api/flood/point?id=kotri');
ok(P.status === 200 && P.json && Array.isArray(P.json.days) && P.json.days.length && P.json.days.every(d => LEVELS.includes(d.class) && d.q === undefined), 'point view (Kotri): a class per day and no m³/s');

/* ── 2. catchment rain: heavy-rain levels, never Act from rain alone ── */
for (const [lat, lon, name] of [[35.92, 74.31, 'Gilgit'], [33.68, 73.05, 'Islamabad'], [24.86, 67.01, 'Karachi']]) {
  const C = await get('/api/limits/catchment?lat=' + lat + '&lon=' + lon);
  if (C.json && C.json.ok) {
    ok(['Low', 'Monitor', 'Watch'].includes(C.json.class), 'catchment rain at ' + name + ' is a heavy-rain level (no Act, no Clear): ' + C.json.class);
    ok(C.json.level === 'heavy rain' && C.json.actRule && /observed/.test(C.json.actRule), 'catchment rain at ' + name + ' says Act needs an observed flood signal');
  } else ok(C.status === 200 || C.status === 404 || C.status === 502, 'catchment rain at ' + name + ' answered (' + C.status + ')', C.text);
}

/* ── 3. chance of rain: calibrated against IMERG, never against gauges ── */
for (const [lat, lon, elev, name] of [[36.32, 74.65, 2400, 'Hunza'], [31.52, 74.36, 215, 'Lahore']]) {
  /* v91.17.283.28: the bundle's pool part takes longer (hour-ending member day totals); the completion read waits for it, as the pages do */
  const H = await (async () => { const r = await get('/api/point?lat=' + lat + '&lon=' + lon + '&complete=1', 240000); const v = partOfB(r && r.json, 'poolHazard'); return { ...r, json: v, text: JSON.stringify(v) }; })();
  if (H.status !== 200 || !H.json) { ok(false, 'pool hazard at ' + name + ' served', H.status + ' ' + H.text); continue; }
  const c = H.json.rainCalibration || {};
  ok(c.ok && (c.reference === 'IMERG' || c.reference === 'satellite rainfall') /* v283.19: the bundle's customer wording */ && c.label === 'chance of rain', 'chance of rain at ' + name + ' is IMERG-calibrated and labelled "chance of rain"', JSON.stringify(c).slice(0, 200));
  ok(c.tauMm > 0 && c.day && c.day.tauMm > 0, 'hour and day thresholds present at ' + name + ' (' + c.tauMm + ' / ' + (c.day && c.day.tauMm) + ' mm)');
  const keys = JSON.stringify(Object.keys(c).concat(Object.keys(c.day || {})));
  ok(!/gauge/i.test(keys) && !/PMD|ARG|AWS/.test(c.group || ''), 'no gauge-fitted field in the calibration served at ' + name, keys);
  ok((H.json.hourly || []).every(h => h.pRain == null || (h.pRain >= 0 && h.pRain <= 1)), 'hourly chance of rain is a probability at ' + name);
}

/* ── 4. drought: end-pentad SPI, combined class, no soil-only class ── */
const D = await get('/api/climatology/drought');
ok(D.status === 200 && D.json && D.json.ready, 'national drought table served', D.status);
const DU = D.json && D.json.spi ? Object.values(D.json.spi) : [];
ok(D.json && /end-pentad/.test(D.json.fit || ''), 'SPI is read against end-pentad fits', D.json && D.json.fit);
/* v91.17.226 · since v91.17.167 the 30/90-day slots carry the calendar-month indices (SPI-1/SPI-3); the rolling pentad indices
   are under `rolling` and those carry the end-pentad fit */
const withSpi = DU.filter(u => u.rolling && u.rolling.spi30 && u.rolling.spi30.value != null);
ok(withSpi.length > 400 && withSpi.every(u => u.rolling.spi30.fit === 'end-pentad'), 'rolling SPI-30 values carry the end-pentad fit (' + withSpi.length + ')');
/* (71) v71: a hyper-arid tehsil where no rain index is defined is outside the drought mask: applicable false, class null, the reason
   "Arid climate: drought index not defined" (droughtClassOf). Every other unit is Low / Monitor / Watch / Act; never "Clear". */
const drNA = DU.filter(u => u.drought && u.drought.applicable === false);
ok(DU.filter(u => u.drought && u.drought.applicable !== false && !u.drought.noData).every(u => LEVELS.includes(u.drought.class))
  && drNA.every(u => u.drought.class == null && u.drought.score == null && /^Arid climate: drought index not defined/.test(u.drought.text || '') && u.spi90 && u.spi90.arid === true)
  && drNA.length <= 30, 'drought classes are Low / Monitor / Watch / Act, or not applicable (null) with the arid reason (' + drNA.length + ' arid) (71)',
  JSON.stringify(DU.filter(u => u.drought && u.drought.applicable !== false && !LEVELS.includes(u.drought.class)).slice(0, 1)).slice(0, 200));
const soilOnly = DU.filter(u => u.drought && u.drought.indexScore == null && u.drought.soilScore != null);
ok(soilOnly.every(u => u.drought.class === 'Low'), 'soil moisture alone never sets a drought class above Low (' + soilOnly.length + ' soil-only units)');
const idxOnly = DU.filter(u => u.drought && u.drought.indexScore != null && u.drought.soilScore == null);
ok(idxOnly.every(u => ['Low', 'Monitor'].includes(u.drought.class)), 'the rain index alone is capped at Monitor (' + idxOnly.length + ' units)');
ok(DU.filter(u => u.drought && u.drought.class === 'Act').every(u => u.drought.indexScore >= 82 && u.drought.soilScore >= 82), 'drought Act only where both indicators agree');
ok(D.json && D.json.droughtClass && D.json.droughtClass.byClass, 'drought class counts published', JSON.stringify(D.json && D.json.droughtClass && D.json.droughtClass.byClass));
console.log('     drought classes: ' + JSON.stringify(D.json && D.json.droughtClass && D.json.droughtClass.byClass));

/* ── 5. the page: no "Clear" hazard class, no FFD figures on the customer path, river rarity wording ── */
const PG = await get('/?backend=' + encodeURIComponent(BASE + '/px') + '&integration=auto', 240000);
if (PG.status === 200 && PG.text.length > 100000) {
  ok(/return 'Low';/.test(PG.text) && !/return 'Clear'/.test(PG.text), 'page: the shared class function returns Low, not Clear');
  ok(!/verdict='Clear'|'Monitor':'Clear'|'Monitor' : 'Clear'|'Monitor':'Clear'\)/.test(PG.text), 'page: no ladder falls through to "Clear"');
  ok(/if\(_ffd && window\.__NIGRAAN_INTERNAL_REF!==true\) _ffd=null;/.test(PG.text), 'page: official barrage limits are read only with the internal flag');
  ok(/Object\.defineProperty\(window,'FFD_CAL'/.test(PG.text) && !/real course \(AGN-FFD\)/.test(PG.text), 'page: the barrage adjustment is internal-only and the Indus layer carries no FFD label');
  ok(/River level by reach/.test(PG.text) && /Chance of rain/.test(PG.text), 'page: river level table (v91.17.226 · audit D-18: the served map level, not the alert class) and "Chance of rain" wording present');
  ok(/t\.drought && t\.drought\.score!=null/.test(PG.text), 'page: the drought layer reads the combined class');
} else ok(false, 'page served for the static checks', PG.status);

console.log((fails ? 'FAIL' : 'PASS') + ' flood_rain: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
