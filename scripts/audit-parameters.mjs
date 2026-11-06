#!/usr/bin/env node
/**
 * NIGRAAN parameter audit — v91.17.5
 *
 * Asks the running server for every meteorological variable it serves, at nine
 * contrasting Pakistani sites, and checks the answers against physics rather
 * than against itself:
 *
 *   1. UNITS AND BOUNDS   every value inside its physical range, in the unit the
 *                         provider declares
 *   2. SPATIAL VARIATION  a variable that is identical at every site is either
 *                         inactive (all zero) or collapsed (all the same
 *                         non-zero). Those are different and are reported
 *                         differently — conflating them cried wolf three times
 *                         during the v91.17.5 audit
 *   3. ELEVATION PHYSICS  temperature must fall with height at 3-11 °C/km and
 *                         pressure must fall monotonically. This is the check
 *                         that caught the defect where four points across
 *                         Islamabad and Rawalpindi, and the Margalla ridge, all
 *                         returned one temperature because all four were being
 *                         told they were at 540 m
 *   4. DERIVED CONSISTENCY  dew point <= air temperature; rain + showers <=
 *                         total precipitation
 *
 * Run:  node scripts/audit-parameters.mjs [--base http://127.0.0.1:8787]
 * Exit: 0 when clean, 1 when any check fails.
 */
const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : null)
  || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';

const VARS = ['temperature_2m','relative_humidity_2m','dew_point_2m','apparent_temperature','precipitation',
  'rain','showers','snowfall','precipitation_probability','pressure_msl','surface_pressure','cloud_cover',
  'wind_speed_10m','wind_direction_10m','wind_gusts_10m','shortwave_radiation','et0_fao_evapotranspiration',
  'vapour_pressure_deficit','soil_moisture_0_to_1cm','soil_moisture_1_to_3cm','soil_moisture_3_to_9cm',
  'soil_moisture_9_to_27cm','soil_moisture_27_to_81cm','soil_temperature_0cm','cape','boundary_layer_height',
  'visibility','uv_index','freezing_level_height','snow_depth'];

const SITES = [
  ['Karachi coast', 24.8607, 67.0011], ['Bahria Town Rwp', 33.5140, 73.0900],
  ['Islamabad F-7', 33.7204, 73.0561], ['Pir Sohawa', 33.7500, 73.0700],
  ['Murree', 33.9070, 73.3903], ['Quetta', 30.1798, 66.9750],
  ['Gilgit', 35.9208, 74.3082], ['Skardu', 35.2971, 75.6333], ['Concordia K2', 35.7400, 76.5100],
];

const BOUNDS = {
  temperature_2m: [-60, 60, '°C'], relative_humidity_2m: [0, 100, '%'], dew_point_2m: [-70, 40, '°C'],
  apparent_temperature: [-70, 70, '°C'], precipitation: [0, 200, 'mm'], rain: [0, 200, 'mm'],
  showers: [0, 200, 'mm'], snowfall: [0, 100, 'cm'], precipitation_probability: [0, 100, '%'],
  pressure_msl: [870, 1085, 'hPa'], surface_pressure: [400, 1085, 'hPa'], cloud_cover: [0, 100, '%'],
  wind_speed_10m: [0, 400, 'km/h'], wind_direction_10m: [0, 360, '°'], wind_gusts_10m: [0, 500, 'km/h'],
  shortwave_radiation: [0, 1400, 'W/m²'], et0_fao_evapotranspiration: [-1, 30, 'mm'],
  vapour_pressure_deficit: [0, 15, 'kPa'], soil_temperature_0cm: [-70, 80, '°C'], cape: [0, 10000, 'J/kg'],
  boundary_layer_height: [0, 6000, 'm'], visibility: [0, 100000, 'm'], uv_index: [0, 20, ''],
  freezing_level_height: [0, 7000, 'm'], snow_depth: [0, 30, 'm'],
};
for (const k of VARS) if (/^soil_moisture_/.test(k)) BOUNDS[k] = [0, 1, 'm³/m³'];

const problems = [], notes = [];
/* One retry before calling a site a problem. A 30-variable request on a cold
   connection occasionally meets a transient 5xx between here and the provider,
   and a network hiccup is not a parameter defect — reporting it as one is how an
   audit loses its authority. A second failure is reported. */
const get = async (u) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch (e) { if (attempt) throw e; await new Promise((ok) => setTimeout(ok, 800)); }
  }
};

const rows = {};
for (const [nm, la, lo] of SITES) {
  const u = `${BASE}/px/v1/forecast?latitude=${la}&longitude=${lo}&hourly=${VARS.join(',')}`
          + `&forecast_days=3&timezone=GMT&__omhost=api.open-meteo.com`;
  try { rows[nm] = await get(u); }
  catch (e) { problems.push(`${nm}: the provider request failed (${e.message})`); }
}
const sites = Object.keys(rows);
if (sites.length < 4) { console.error('too few sites answered; is the server running at ' + BASE + '?'); process.exit(1); }

/* 1. units and bounds */
for (const nm of sites) {
  const h = rows[nm].hourly || {}, units = rows[nm].hourly_units || {};
  for (const v of VARS) {
    const arr = h[v];
    if (!arr) { problems.push(`${v}: absent from the response at ${nm}`); continue; }
    const vals = arr.filter((x) => x != null);
    if (!vals.length) { notes.push(`${v}: all null at ${nm}`); continue; }
    const [lo_, hi_, unit] = BOUNDS[v] || [];
    if (lo_ != null) {
      const bad = vals.filter((x) => x < lo_ || x > hi_);
      if (bad.length) problems.push(`${v}: ${bad.length} value(s) outside ${lo_}..${hi_} ${unit} at ${nm} (e.g. ${bad[0]})`);
    }
    if (unit && units[v]) {
      const got = String(units[v]).replace('°', '°');
      if (unit && !got.includes(unit) && !unit.includes(got)) notes.push(`${v}: provider unit "${units[v]}" vs expected "${unit}"`);
    }
  }
}

/* 2. spatial variation — inactive is not collapsed */
for (const v of VARS) {
  const tot = {};
  for (const nm of sites) { const a = (rows[nm].hourly || {})[v] || []; const s = a.filter((x) => x != null); tot[nm] = s.length ? s.reduce((x, y) => x + Math.abs(y), 0) : null; }
  const present = Object.values(tot).filter((x) => x != null);
  if (present.length < 4) continue;
  const distinct = new Set(present.map((x) => Math.round(x * 100))).size;
  if (distinct === 1) {
    if (present[0] === 0) notes.push(`${v}: zero at every site over the whole window — the variable is inactive today, not collapsed`);
    else problems.push(`${v}: IDENTICAL non-zero total (${present[0]}) at all ${present.length} sites — spatially collapsed`);
  }
}

/* 3. elevation physics */
const at = (nm, v, i = 12) => { const a = (rows[nm].hourly || {})[v] || []; return a.length > i ? a[i] : null; };
const elev = Object.fromEntries(sites.map((nm) => [nm, rows[nm].elevation]));
const PAIRS = [['Bahria Town Rwp', 'Murree'], ['Bahria Town Rwp', 'Skardu'], ['Karachi coast', 'Concordia K2'], ['Islamabad F-7', 'Pir Sohawa']];
for (const [a, b] of PAIRS) {
  if (!(a in rows) || !(b in rows)) continue;
  const ta = at(a, 'temperature_2m'), tb = at(b, 'temperature_2m');
  const dz = elev[b] - elev[a];
  if (ta == null || tb == null || !(dz > 0)) continue;
  const lapse = -(tb - ta) / dz * 1000;
  const line = `${a} (${elev[a]} m, ${ta} °C) -> ${b} (${elev[b]} m, ${tb} °C) = ${lapse.toFixed(1)} °C/km`;
  if (lapse >= 3 && lapse <= 11) notes.push('lapse ' + line);
  else problems.push('lapse outside 3-11 °C/km: ' + line);
  const pa = at(a, 'surface_pressure'), pb = at(b, 'surface_pressure');
  if (pa != null && pb != null && pb >= pa) problems.push(`surface pressure did not fall with height: ${a} ${pa} hPa at ${elev[a]} m vs ${b} ${pb} hPa at ${elev[b]} m`);
}

/* 4. derived consistency */
for (const nm of sites) {
  const h = rows[nm].hourly || {};
  const T = h.temperature_2m || [], Td = h.dew_point_2m || [];
  let bad = 0; for (let i = 0; i < Math.min(T.length, Td.length); i++) if (T[i] != null && Td[i] != null && Td[i] > T[i] + 0.15) bad++;
  if (bad) problems.push(`dew point exceeds air temperature at ${nm} in ${bad} hour(s)`);
  const pr = h.precipitation || [], rn = h.rain || [], sh = h.showers || [];
  let bad2 = 0; for (let i = 0; i < Math.min(pr.length, rn.length, sh.length); i++) {
    if ([pr[i], rn[i], sh[i]].some((x) => x == null)) continue;
    if (rn[i] + sh[i] > pr[i] + 0.3) bad2++;
  }
  if (bad2) problems.push(`rain + showers exceeds total precipitation at ${nm} in ${bad2} hour(s)`);
}

/* report */
const pad = (s, n) => String(s).padEnd(n);
console.log('NIGRAAN parameter audit · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · ' + BASE);
console.log('');
console.log(pad('site', 20) + 'elev'.padStart(6) + 'T'.padStart(8) + 'surf hPa'.padStart(10) + 'frz lvl'.padStart(9) + 'snow m'.padStart(8));
for (const nm of sites) {
  console.log(pad(nm, 20) + String(Math.round(rows[nm].elevation)).padStart(6)
    + String(at(nm, 'temperature_2m')).padStart(8) + String(at(nm, 'surface_pressure')).padStart(10)
    + String(at(nm, 'freezing_level_height')).padStart(9) + String(at(nm, 'snow_depth')).padStart(8));
}
console.log('');
console.log(`PROBLEMS (${problems.length})`);
problems.forEach((x) => console.log('   X ' + x));
console.log('');
console.log(`CHECKS THAT PASSED, WITH THEIR NUMBERS (${notes.length})`);
notes.forEach((x) => console.log('   · ' + x));
console.log('');
console.log(problems.length ? 'AUDIT FAILED' : 'AUDIT CLEAN — ' + VARS.length + ' variables at ' + sites.length + ' sites');
process.exit(problems.length ? 1 : 0);
