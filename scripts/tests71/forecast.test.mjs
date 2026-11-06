/* tests71/forecast.test.mjs · v91.17.71 · FORECAST QUALITY (agent T)
   Run against a server:  node scripts/tests71/forecast.test.mjs [baseUrl]      (default http://127.0.0.1:8787)
   What a customer sees:
     1  the mountain station calibration is ON by default (stationData()): the provenance block agn_temperature_basis says
        so, credits the generic label, tier B, never MACH-verified, names no supplier
     2  the day card is the served hourly curve (T4) and the calibrated curve has no step; the humidity pair is consistent
     3  hills: a synop-anchored calibration on best_match; plains: no station calibration (MACH L2 only, unchanged)
     4  the ensemble P50 day 1 sits near the day card at Gilgit / Skardu (same corrected basis)
     5  the seasonal panel: station-anchored GB / Chitral tehsils show the absolute month again (tier B); an unanchored
        mountain tehsil keeps the anomaly; the plains keep the absolute month
     6  the day chance of rain in the mountain liquid-rain domain is station-calibrated, labelled generically
     7  no supplier name and no station skill figure in any of these customer responses
   PASS / FAIL / SKIP lines; exit 1 on any FAIL. NIGRAAN_STATION_DATA=0 is not needed. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const HERE = dirname(fileURLToPath(import.meta.url));
const LABELS = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'source-labels.json'), 'utf8'));
const FORBID = LABELS.forbiddenInCustomerOutput || [];
let fails = 0;
const pass = (n, d = '') => console.log('PASS ' + n + (d ? ' · ' + d : ''));
const fail = (n, d = '') => { fails++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); };
const skip = (n, d = '') => console.log('SKIP ' + n + (d ? ' · ' + d : ''));
const H = { 'Sec-Fetch-Site': 'same-origin' };
async function get(p) {
  const r = await fetch(BASE + p, { headers: H });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: /json/.test(ct) ? await r.json() : await r.text() };
}
const px = (q) => get('/px/v1/forecast?' + new URLSearchParams({ __omhost: 'api.open-meteo.com', ...q }).toString());
/* whole-word match in TEXT values only (keys and values of strings), not inside hashes or colours */
function forbiddenIn(obj) {
  const hits = new Set(); const words = FORBID.map(w => new RegExp('(^|[^A-Za-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9]|$)'));
  const walk = (x) => { if (x == null) return; if (typeof x === 'string') { words.forEach((re, i) => { if (re.test(x)) hits.add(FORBID[i]); }); return; } if (Array.isArray(x)) return x.forEach(walk); if (typeof x === 'object') for (const [k, v] of Object.entries(x)) { walk(k); walk(v); } };
  walk(obj); return [...hits];
}
const noSupplier = (name, obj) => { const h = forbiddenIn(obj); h.length ? fail(name, 'names ' + h.join(', ')) : pass(name); };
function dayCurve(j) {
  const Hh = j.hourly, D = j.daily; let n = 0, worst = 0;
  D.time.forEach((d, i) => { const v = Hh.time.map((t, k) => String(t).startsWith(d) ? Hh.temperature_2m[k] : undefined).filter(x => x !== undefined);
    if (v.length !== 24 || v.some(x => x == null)) return; n++; worst = Math.max(worst, Math.abs(Math.max(...v) - D.temperature_2m_max[i]), Math.abs(Math.min(...v) - D.temperature_2m_min[i])); });
  return { n, worst };
}
const UNITS = JSON.parse(readFileSync(join(HERE, '..', '..', 'server', 'contract', 'units.json'), 'utf8'));
const es = (t) => 6.112 * Math.exp(17.62 * t / (243.12 + t));

(async () => {
  /* ── 1 · the calibration service is on by default ── */
  const st = await get('/api/mos/status');
  const S = st.body || {}; const C = S.calibration || {};
  if (st.status !== 200) fail('mos status reachable', 'HTTP ' + st.status);
  else {
    C.serving === true ? pass('station calibration serving by default', C.version + ', tier ' + C.tier) : fail('station calibration serving by default', JSON.stringify(C).slice(0, 200));
    (C.tier === 'B' && C.label === LABELS.labels.calibration) ? pass('calibration is tier B with the generic label', C.label) : fail('tier B / generic label', C.tier + ' / ' + C.label);
    (C.credit && C.credit.mountain === LABELS.labels.mountainNetwork) ? pass('mountain calibration credited with label(mountainNetwork)') : fail('mountain credit label', JSON.stringify(C.credit));
    (S.enabled === false) ? pass('the v91.17.69 best_match tables are not on the served path') : fail('v91.17.69 tables off', 'enabled=' + S.enabled);
    /mae|heldOut|skill|brier/i.test(JSON.stringify(Object.keys(C))) || /\b(1\.72|2\.15|2\.33)\b/.test(JSON.stringify(C)) ? fail('no station skill figure in the calibration status') : pass('no station skill figure in the calibration status');
    noSupplier('mos status names no supplier', S);
  }
  const reqModels = S.temperatureBasis && S.temperatureBasis.request && S.temperatureBasis.request.models;

  /* ── 2 · Gilgit and Skardu: calibrated, provenance, T4, smooth, humidity consistent ── */
  const pts = [['Gilgit', '35.92', '74.31'], ['Skardu', '35.30', '75.63']];
  const card = {};
  for (const [nm, la, lo] of pts) {
    if (!reqModels) { skip(nm + ' zone request', 'no request.models'); continue; }
    const q = { latitude: la, longitude: lo, hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature', daily: 'temperature_2m_max,temperature_2m_min', forecast_days: '7', timezone: 'Asia/Karachi', models: reqModels };
    const r = await px(q); const j = r.body;
    if (r.status !== 200 || !j || !j.hourly) { fail(nm + ' zone request', 'HTTP ' + r.status); continue; }
    const b = j.agn_temperature_basis || {}; const cal = b.calibration || {};
    (b.zone === 'mountain' && b.correction === 'L0+SC' && cal.applied === true) ? pass(nm + ': mountain correction applied by default', b.model + ' + ' + cal.label + ' (' + cal.via + ')') : fail(nm + ': correction applied', JSON.stringify(b).slice(0, 240));
    (cal.tier === 'B' && cal.label === LABELS.labels.calibration && cal.source === LABELS.labels.mountainNetwork) ? pass(nm + ': provenance generic, tier B') : fail(nm + ': provenance generic', JSON.stringify(cal).slice(0, 200));
    /MACH(?! forecast)/i.test(JSON.stringify(cal) + JSON.stringify(j.agn_bias_correction || {})) ? fail(nm + ': never MACH-labelled') : pass(nm + ': not labelled MACH');
    cal.internal ? fail(nm + ': no internal site identity on the default path', JSON.stringify(cal.internal)) : pass(nm + ': no internal site identity on the default path');
    noSupplier(nm + ': forecast response names no supplier', j);
    const dc = dayCurve(j); (dc.n && dc.worst <= 0.1) ? pass(nm + ': day card = hourly curve', dc.n + ' days, worst ' + dc.worst.toFixed(2) + ' C') : fail(nm + ': day card = hourly curve', dc.n + ' days, worst ' + dc.worst.toFixed(2));
    card[nm] = j;
    /* the calibration itself has no step: served minus the zone blend of the raw members, hour to hour */
    const rw = await px({ ...q, __raw: '1' }); const RH = (rw.body && rw.body.hourly) || {};
    const mem = String(b.model || '').split('+'); const T = j.hourly.temperature_2m;
    /* the stretch scales the day's own curve, so the offset may move only as fast as the raw curve moves: a change of the
       offset larger than 0.3 C + the raw curve's own change in that hour is a seam */
    let worst = -9, where = null, n = 0, prevA = null, prevR = null, maxA = 0;
    for (let i = 0; i < T.length; i++) {
      const v = mem.map(m => RH['temperature_2m_' + m] ? RH['temperature_2m_' + m][i] : null); if (v.some(x => x == null) || T[i] == null) { prevA = null; continue; }
      const r = v.reduce((s2, x) => s2 + x, 0) / v.length, a = T[i] - r;
      if (prevA != null) { const ex = Math.abs(a - prevA) - (0.3 + Math.abs(r - prevR)); maxA = Math.max(maxA, Math.abs(a - prevA)); if (ex > worst) { worst = ex; where = RH.time[i]; } n++; }
      prevA = a; prevR = r;
    }
    n > 48 ? (worst <= 0.05 ? pass(nm + ': calibration has no seam', 'largest hourly change of the offset ' + maxA.toFixed(2) + ' C, always within the raw curve\'s own change + 0.3 C (' + n + ' h)') : fail(nm + ': calibration seam', 'offset outruns the curve by ' + worst.toFixed(2) + ' C at ' + where)) : skip(nm + ': calibration seam', 'raw members not returned');
    /* humidity pair: RH recomputed from the served temperature and dew point */
    let wr = 0, m = 0; const Hh = j.hourly;
    for (let i = 0; i < Hh.time.length; i++) { const t = Hh.temperature_2m[i], td = Hh.dew_point_2m[i], rh = Hh.relative_humidity_2m[i]; if (t == null || td == null || rh == null) continue; m++; wr = Math.max(wr, Math.abs(100 * es(Math.min(td, t)) / es(t) - rh)); }
    m ? (wr <= 1.5 ? pass(nm + ': temperature, dew point and humidity are one state', 'worst |RH(T,Td) - RH| ' + wr.toFixed(2) + ' %') : fail(nm + ': humidity consistency', wr.toFixed(2) + ' %')) : skip(nm + ': humidity', 'no humidity');
  }

  /* ── 3 · hills and plains ── */
  /* v91.17.71 · the hills are served on the mountain blend: a client request inside the zone boxes carries the zone models */
  const CB = (S.temperatureBasis && S.temperatureBasis.clientBoxes) || []; const inBox = (a, o) => CB.some(z => a >= z[0] && a <= z[2] && o >= z[1] && o <= z[3]);
  inBox(30.25, 66.95) ? pass('Quetta lies inside the client zone boxes', CB.length + ' boxes') : fail('Quetta inside the client zone boxes', JSON.stringify(CB).slice(0, 160));
  const hq = await px({ latitude: '30.25', longitude: '66.95', hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m', daily: 'temperature_2m_max,temperature_2m_min', forecast_days: '5', timezone: 'Asia/Karachi', ...(reqModels && inBox(30.25, 66.95) ? { models: reqModels } : {}) });
  if (hq.status === 200 && hq.body && hq.body.hourly) {
    const b = hq.body.agn_temperature_basis || {}; const cal = b.calibration || {};
    const zh = S.temperatureBasis && S.temperatureBasis.zones && S.temperatureBasis.zones.hills;
    if (b.zone !== 'hills') skip('Quetta hills calibration', 'zone ' + b.zone + ' at ' + b.elevM + ' m');
    else (b.correction === 'L0+SC' && zh && b.model === zh.temperatureModel && cal.source === LABELS.labels.synopNetwork && cal.tier === 'B') ? pass('Quetta (hills): served on the hills zone basis with the synop-anchored calibration', b.model + ', ' + cal.via + ', ' + cal.meanTermC + ' C mean') : fail('Quetta hills calibration', JSON.stringify(b).slice(0, 220));
    const dc = dayCurve(hq.body); (dc.n && dc.worst <= 0.1) ? pass('Quetta: day card = hourly curve', dc.worst.toFixed(2) + ' C') : fail('Quetta day card', dc.worst.toFixed(2));
    noSupplier('Quetta response names no supplier', hq.body);
  } else fail('Quetta forecast', 'HTTP ' + hq.status);
  const lh = await px({ latitude: '31.55', longitude: '74.34', hourly: 'temperature_2m', daily: 'temperature_2m_max,temperature_2m_min', forecast_days: '5', timezone: 'Asia/Karachi' });
  if (lh.status === 200 && lh.body && lh.body.hourly) {
    const b = lh.body.agn_temperature_basis || {};
    (!b.calibration && b.correction !== 'L0+SC' && !lh.body.agn_plains_correction) ? pass('Lahore (plains): no station calibration, MACH-based path unchanged', 'correction ' + b.correction) : fail('Lahore plains unchanged', JSON.stringify(b).slice(0, 200));
    const dc = dayCurve(lh.body); (dc.n && dc.worst <= 0.1) ? pass('Lahore: day card = hourly curve', dc.worst.toFixed(2) + ' C') : fail('Lahore day card', dc.worst.toFixed(2));
  } else fail('Lahore forecast', 'HTTP ' + lh.status);

  /* a lowland point inside a (coarse) box: the zone request must serve exactly what the plain request serves */
  if (reqModels && inBox(34.01, 71.58)) {
    const pq = { latitude: '34.01', longitude: '71.58', hourly: 'temperature_2m,dew_point_2m', daily: 'temperature_2m_max,temperature_2m_min', forecast_days: '5', timezone: 'Asia/Karachi' };
    const [a1, a2] = [await px(pq), await px({ ...pq, models: reqModels })];
    const A = a1.body && a1.body.hourly, B2 = a2.body && a2.body.hourly;
    if (A && B2) { const d = A.temperature_2m.reduce((w, x, i) => Math.max(w, Math.abs((x ?? 0) - (B2.temperature_2m[i] ?? 0))), 0), dd = A.dew_point_2m.reduce((w, x, i) => Math.max(w, Math.abs((x ?? 0) - (B2.dew_point_2m[i] ?? 0))), 0);
      (d === 0 && dd === 0 && !(a2.body.agn_temperature_basis || {}).calibration) ? pass('Peshawar (plains, inside a box): the zone request serves the plain values', 'max |diff| T ' + d + ', Td ' + dd) : fail('Peshawar plains unchanged inside a box', 'T ' + d + ' Td ' + dd); }
    else fail('Peshawar forecast', a1.status + ' / ' + a2.status);
  }

  /* ── 4 · the ensemble P50 day 1 against the day card at the unit's settlement height ── */
  for (const nm of ['Gilgit', 'Skardu']) {
    const ou = await get('/api/outlook/unit?unit=' + nm);
    if (ou.status !== 200 || !ou.body) { fail(nm + ' outlook unit', 'HTTP ' + ou.status); continue; }
    noSupplier(nm + ' outlook names no supplier', ou.body);
    const E = ou.body.ensemble, U = ou.body.unit;
    if (!E || !E.basis) { skip(nm + ' ensemble P50 vs day card', 'the ensemble has not run on this server'); continue; }
    if (!E.basis.calibration) { skip(nm + ' ensemble P50 vs day card', 'the stored ensemble predates the calibration (version ' + E.basis.version + '); it re-runs every 6 h'); continue; }
    const d1 = E.days[1]; if (!d1 || !d1.tx) { fail(nm + ' ensemble day 1'); continue; }
    const cu = UNITS.find(x => x.unitId === (U && U.unitId)); if (!cu || U.elevM == null) { skip(nm + ' ensemble P50 vs day card', 'unit coordinates unknown'); continue; }
    /* v91.17.73 (agent A) · the card is requested with the AI local correction's inputs (cloud, wind, rain), as the dashboard
       requests it: the members carry the AI term where the unit's served card does (E.basis.aiLocal) */
    const q = { latitude: String(cu.lat), longitude: String(cu.lon), elevation: String(U.elevM), daily: 'temperature_2m_max,temperature_2m_min', hourly: 'temperature_2m,cloud_cover,wind_speed_10m,precipitation', forecast_days: '3', timezone: 'Asia/Karachi', models: reqModels };
    const r = await px(q); const D = r.body && r.body.daily; if (!D) { fail(nm + ' day card for the unit'); continue; }
    const k = D.time.indexOf(d1.date); if (k < 0) { skip(nm + ' ensemble P50 vs day card', 'dates do not overlap (' + d1.date + ')'); continue; }
    const dx = d1.tx[1] - D.temperature_2m_max[k], dn = d1.tn[1] - D.temperature_2m_min[k];
    /* same basis: the members carry exactly the offsets the day card carries (card minus the raw zone blend of that day) */
    const rw = await px({ ...q, __raw: '1' }); const RH = (rw.body && rw.body.hourly) || {}; const mem = String(E.basis.reference || '').split('+');
    const blend = (RH.time || []).map((t, i) => String(t).startsWith(d1.date) ? mem.map(m => RH['temperature_2m_' + m] ? RH['temperature_2m_' + m][i] : null) : null).filter(Boolean).filter(v => v.every(x => x != null)).map(v => v.reduce((a, x) => a + x, 0) / v.length);
    if (blend.length === 24) {
      const offX = D.temperature_2m_max[k] - Math.max(...blend), offN = D.temperature_2m_min[k] - Math.min(...blend);
      const aiL = E.basis.aiLocal || {}; const mX = E.basis.calibration.tx + (aiL.tx || 0), mN = E.basis.calibration.tn + (aiL.tn || 0);   /* v91.17.73 · calibration + the AI term */
      (Math.abs(offX - mX) <= 0.2 && Math.abs(offN - mN) <= 0.2) ? pass(nm + ': members carry the day card\'s calibration', 'members +' + mX.toFixed(2) + ' / ' + mN.toFixed(2) + (aiL.tx != null ? ' (incl. the AI term)' : '') + ', card +' + offX.toFixed(2) + ' / ' + offN.toFixed(2))
        : fail(nm + ': members carry the day card\'s calibration', 'members ' + mX.toFixed(2) + ' / ' + mN.toFixed(2) + ' vs card ' + offX.toFixed(2) + ' / ' + offN.toFixed(2));
    } else skip(nm + ': member offsets vs card', 'raw hourly members not returned for the day');
    /* near: what is left is the ensemble's own disagreement with the deterministic zone blend for that day */
    (Math.abs(dx) <= 3.5 && Math.abs(dn) <= 3.5) ? pass(nm + ': ensemble P50 day 1 near the day card', 'Tmax ' + d1.tx[1] + ' vs ' + D.temperature_2m_max[k] + ' (' + dx.toFixed(1) + '), Tmin ' + d1.tn[1] + ' vs ' + D.temperature_2m_min[k] + ' (' + dn.toFixed(1) + ')')
      : fail(nm + ': ensemble P50 day 1 near the day card', 'Tmax ' + d1.tx[1] + ' vs ' + D.temperature_2m_max[k] + ', Tmin ' + d1.tn[1] + ' vs ' + D.temperature_2m_min[k]);
  }

  /* ── 5 · the seasonal panel ── */
  let NAF = null; try { NAF = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'normal-anchor.json'), 'utf8')); } catch (_) {}
  const full = NAF && NAF.serve ? Object.entries(NAF.units).filter(([, v]) => v.tm.every(x => x != null)).map(([k]) => k) : [];
  const pickFull = full.find(k => /Ali Abad/.test(k)) || full[0];
  if (pickFull) {
    const tname = pickFull.split('|')[2];
    const sa = await get('/api/outlook/seasonal?unit=' + encodeURIComponent(tname));
    if (sa.status === 200 && sa.body && sa.body.seasonal && sa.body.seasonal.months && sa.body.seasonal.months.length) {
      const M = sa.body.seasonal.months; const ok = M.filter(m => m.display === 'absolute' && typeof m.tMean === 'number' && m.normalTier === 'B');
      ok.length === M.length ? pass(tname + ' (station-anchored normal): the absolute month again', M[0].month + ' ' + M[0].tMean + ' C, normal ' + M[0].tNormal + ' C') : fail(tname + ' absolute month', JSON.stringify(M.find(m => !ok.includes(m))).slice(0, 220));
      M.every(m => m.pText == null || /% of normal|against normal/.test(m.pText)) ? pass(tname + ': precipitation stays relative') : fail(tname + ': precipitation text');
      (M.every(m => !m.displayBasis || m.displayBasis.includes(LABELS.labels.mountainNetwork) || !/station/.test(m.displayBasis))) ? pass(tname + ': the normal is credited generically') : fail(tname + ': normal credit', M[0].displayBasis);
      noSupplier(tname + ' season names no supplier', sa.body);
    } else if (sa.status === 404 || (sa.body && sa.body.error === 'not_ready')) skip(tname + ' season', 'not ready'); else fail(tname + ' season', 'HTTP ' + sa.status);
  } else skip('station-anchored season', 'no fully anchored tehsil in data/normal-anchor.json');
  const sg = await get('/api/outlook/seasonal?unit=Gilgit');
  if (sg.status === 200 && sg.body && sg.body.seasonal && sg.body.seasonal.months && sg.body.seasonal.months.length) {
    const M = sg.body.seasonal.months; const kinds = [...new Set(M.map(m => m.display))];
    (kinds.length === 1 && M.every(m => m.tMean != null || typeof m.tText === 'string')) ? pass('Gilgit season: one display for the whole table', kinds[0]) : fail('Gilgit season display', kinds.join('+'));
  } else if (sg.status === 404 || (sg.body && sg.body.error === 'not_ready')) skip('Gilgit season', 'not ready'); else fail('Gilgit season', 'HTTP ' + sg.status);
  const anchored = NAF ? NAF.units : null;
  const loose = anchored ? UNITS.find(u => (u.province === 'Gilgit Baltistan' || /Chitral/.test(u.district)) && !anchored[u.unitId] && (u.elevM || 0) > 1000) : null;
  if (loose) {
    const sx = await get('/api/outlook/seasonal?unit=' + encodeURIComponent(loose.tehsil));
    if (sx.status === 200 && sx.body && sx.body.seasonal && sx.body.seasonal.months && sx.body.seasonal.months.length) {
      const M = sx.body.seasonal.months; M.every(m => m.display === 'anomaly' && m.tMean == null && typeof m.tText === 'string') ? pass(loose.tehsil + ' (no station): the anomaly display stays', M[0].tText) : fail(loose.tehsil + ' anomaly display', JSON.stringify(M[0]).slice(0, 200));
    } else skip(loose.tehsil + ' season', 'HTTP ' + sx.status);
  } else skip('unanchored mountain tehsil', 'none found');
  const sl = await get('/api/outlook/seasonal?unit=Lahore');
  if (sl.status === 200 && sl.body && sl.body.seasonal && sl.body.seasonal.months && sl.body.seasonal.months.length) {
    const M = sl.body.seasonal.months; M.every(m => m.display !== 'anomaly') && M.some(m => typeof m.tMean === 'number') ? pass('Lahore season keeps the absolute month', M[0].tMean + ' C') : fail('Lahore absolute month', JSON.stringify(M[0]).slice(0, 160));
  } else if (sl.status === 404 || (sl.body && sl.body.error === 'not_ready')) skip('Lahore season', 'not ready'); else fail('Lahore season', 'HTTP ' + sl.status);

  /* ── 6 · the day chance of rain in the mountain liquid domain ── */
  const hz0 = await get('/api/point?lat=35.92&lon=74.31'); const hz = { status: hz0.status, body: hz0.body && hz0.body.parts && hz0.body.parts.poolHazard ? hz0.body.parts.poolHazard.v : null };   /* v283.19: the bundle part poolHazard */
  if (hz.status === 200 && hz.body && Array.isArray(hz.body.days)) {
    const mo = Number(new Date(Date.now() + 5 * 3600e3).toISOString().slice(5, 7)); let dom = null; try { dom = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'rain-gauge-calibration.json'), 'utf8')).domain; } catch (_) {}
    const inDom = dom && dom.months.includes(mo);
    const cal = hz.body.days.filter(d => d.pRainDayBasis === 'station calibration');
    if (inDom) (cal.length && cal.every(d => d.pRainDay >= 0 && d.pRainDay <= 1) && hz.body.rainDayCalibration && hz.body.rainDayCalibration.source === LABELS.labels.mountainNetwork && hz.body.rainDayCalibration.tier === 'B') ? pass('Gilgit day chance of rain is station-calibrated in the liquid season', cal.map(d => d.date.slice(5) + ' ' + Math.round(100 * d.pRainDay) + '%').join(', ')) : fail('Gilgit calibrated day chance', JSON.stringify(hz.body.days[0]).slice(0, 200));
    else skip('Gilgit calibrated day chance', 'outside the liquid-rain months');
    noSupplier('pool hazard names no supplier', hz.body);
  } else skip('pool hazard', 'HTTP ' + hz.status);

  console.log(fails ? fails + ' FAIL' : 'all forecast checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness error ' + e.message); process.exit(1); });
