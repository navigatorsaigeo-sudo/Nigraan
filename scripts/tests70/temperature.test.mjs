/* tests70/temperature.test.mjs · v91.17.70 Sprint 1 · TEMPERATURE
   Run after the integrator restarts the server:  node scripts/tests70/temperature.test.mjs
   What a customer sees:
     1  the PMD-fitted station tables are off on the served path (internal reference only)
     2  a mountain point is served on its zone basis (data/model-zone.json), as ONE plain response, with no seam
     3  the day card's max / min are the served hourly curve's own (T4, <= 0.3 C, every full day)
     4  the seasonal panel in a mountain unit shows the season as its anomaly, the plains keep the absolute month
     5  the ensemble and the pool carry their height / correction basis; no hard-coded skill string in the thresholds
     6  the client asks for the zone models inside the mountain boxes (FIX f70t1 applied by the integrator)
   Prints PASS / FAIL / SKIP lines; exits 1 on any FAIL. */
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0;
const pass = (n, d = '') => console.log('PASS ' + n + (d ? ' · ' + d : ''));
const fail = (n, d = '') => { fails++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); };
const skip = (n, d = '') => console.log('SKIP ' + n + (d ? ' · ' + d : ''));
const H = { 'Sec-Fetch-Site': 'same-origin' };
async function get(p) {
  const r = await fetch(BASE + p, { headers: H });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: /json/.test(ct) ? await r.json() : await r.text(), headers: r.headers };
}
const px = (q) => get('/px/v1/forecast?' + new URLSearchParams({ __omhost: 'api.open-meteo.com', ...q }).toString());
function dayCheck(name, j, tol = 0.3) {
  const Hh = j.hourly, D = j.daily; if (!Hh || !D) return fail(name, 'no hourly/daily in the response');
  let n = 0, worst = 0, where = null;
  D.time.forEach((d, i) => {
    const v = Hh.time.map((t, k) => String(t).startsWith(d) ? Hh.temperature_2m[k] : undefined).filter(x => x !== undefined);
    if (v.length !== 24 || v.some(x => x == null)) return;
    n++;
    const dx = Math.abs(Math.max(...v) - D.temperature_2m_max[i]), dn = Math.abs(Math.min(...v) - D.temperature_2m_min[i]);
    if (Math.max(dx, dn) > worst) { worst = Math.max(dx, dn); where = d; }
  });
  if (!n) return fail(name, 'no full day to compare');
  worst <= tol ? pass(name, n + ' days, worst |daily - hourly curve| ' + worst.toFixed(2) + ' C') : fail(name, 'day card differs from the hourly curve by ' + worst.toFixed(2) + ' C on ' + where);
}

(async () => {
  /* 1 · the station-fitted tables are off by default */
  const st = await get('/api/mos/status');
  const S = st.body || {};
  if (st.status !== 200) fail('mos status reachable', 'HTTP ' + st.status);
  else {
    S.enabled === false ? pass('station MOS / learned model off on the served path') : fail('station MOS off', 'enabled=' + S.enabled + ' (NIGRAAN_INTERNAL_REF must be unset in service)');
    (S.measured == null && !/4\.8 -> 2\.0|raw_mae_c|260,645/.test(JSON.stringify(S))) ? pass('no hard-coded skill figures in the correction status') : fail('no hard-coded skill figures', 'status still carries measured figures');
  }
  const TB = S.temperatureBasis || {};
  const zm = TB.zones && TB.zones.mountain; const reqModels = TB.request && TB.request.models;
  (TB.ready && zm && zm.temperatureModel && zm.temperatureModel !== 'best_match' && reqModels) ? pass('zone basis loaded', 'mountain = ' + zm.temperatureModel) : fail('zone basis loaded', JSON.stringify(TB).slice(0, 200));

  /* 2 · a mountain point on its zone basis, one plain response, no seam */
  if (reqModels) {
    const gq = { latitude: '35.92', longitude: '74.31', hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation', daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum', forecast_days: '16', timezone: 'Asia/Karachi', models: reqModels };
    const g = await px(gq);
    const j = g.body;
    if (g.status !== 200 || !j || !j.hourly) fail('Gilgit zone request', 'HTTP ' + g.status);
    else {
      const models = reqModels.split(',');
      const suffixed = [...Object.keys(j.hourly), ...Object.keys(j.daily || {})].filter(k => models.some(m => k.endsWith('_' + m)));
      suffixed.length ? fail('one plain response', 'suffixed keys left: ' + suffixed.slice(0, 4).join(', ')) : pass('one plain response (zone models folded)');
      const b = j.agn_temperature_basis || {};
      (b.zone === 'mountain' && b.model && b.model !== 'best_match') ? pass('Gilgit served on the mountain basis', b.model + ' at ' + b.elevM + ' m') : fail('Gilgit mountain basis', JSON.stringify(b));
      /* v91.17.70 (harness integration) · an hour no model carries yet (the last hours of day 16, before the next run reaches them:
         provider best_match is empty there too) is not a merge gap. The merge must leave no hour empty that ANY raw series
         carries, and must cover at least 15 of the 16 days. */
      const T = j.hourly.temperature_2m; const rw = await px({ ...gq, __raw: '1' }); const RH = (rw.body && rw.body.hourly) || {};
      const rawKeys = Object.keys(RH).filter(k => /^temperature_2m_/.test(k)); const carried = (i) => rawKeys.some(k => RH[k] && RH[k][i] != null);
      const gaps = T.filter((x, i) => x == null && carried(i)).length, beyond = T.filter((x, i) => x == null && !carried(i)).length;
      (rawKeys.length >= 2 && T.length === 384 && !gaps && T.length - beyond >= 360) ? pass('16 days of temperature, no gap', (T.length - beyond) + ' hours' + (beyond ? ' (' + beyond + ' hours beyond every model run yet)' : '')) : fail('16 days of temperature, no gap', gaps + ' empty hours a raw series carries · ' + beyond + ' beyond every run · ' + T.length + ' hours');
      let step = 0; for (let i = 1; i < T.length; i++) if (T[i] != null && T[i - 1] != null) step = Math.max(step, Math.abs(T[i] - T[i - 1]));
      step < 6 ? pass('no seam where a zone model ends', 'largest hour-to-hour change ' + step.toFixed(1) + ' C') : fail('no seam', 'hour-to-hour jump ' + step.toFixed(1) + ' C');
      const ref = JSON.stringify(j.agn_bias_correction || {});
      /learned model|PMD|station or height-band/i.test(ref) ? fail('no station-table correction on the served mountain point', ref.slice(0, 160)) : pass('no station-table correction on the served mountain point');
      /* 3 · T4 at a mountain point */
      dayCheck('T4 day card = hourly curve (Gilgit)', j);
    }
  } else skip('Gilgit zone request', 'no request.models in the zone file');
  /* 3 · T4 at a plains point with the default (no models) request */
  const lh = await px({ latitude: '31.55', longitude: '74.34', hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m', daily: 'temperature_2m_max,temperature_2m_min', forecast_days: '7', timezone: 'Asia/Karachi' });
  if (lh.status === 200 && lh.body && lh.body.hourly) {
    dayCheck('T4 day card = hourly curve (Lahore)', lh.body);
    lh.body.agn_plains_correction ? fail('no PMD city offset on the plains day card', JSON.stringify(lh.body.agn_plains_correction).slice(0, 120)) : pass('no PMD city offset on the plains day card');
  } else fail('Lahore forecast', 'HTTP ' + lh.status);

  /* 4 · seasonal panel: anomaly in the mountains, absolute in the plains */
  const sg = await get('/api/outlook/seasonal?unit=Gilgit');
  if (sg.status === 200 && sg.body && sg.body.seasonal && sg.body.seasonal.months && sg.body.seasonal.months.length) {
    const M = sg.body.seasonal.months;
    const bad = M.filter(m => !(m.display === 'anomaly' && m.tMean == null && typeof m.tText === 'string' && /warmer|cooler|close to normal/.test(m.tText) && (m.pText == null || /% of normal|against normal/.test(m.pText))));
    bad.length ? fail('Gilgit season shown as anomaly', JSON.stringify(bad[0]).slice(0, 200)) : pass('Gilgit season shown as anomaly', M[0].tText + ' · ' + M[0].pText);
    M.some(m => m.tText == null && m.tMean == null) ? fail('every mountain month carries a value', 'a month with neither text nor value') : pass('every mountain month carries a value');
  } else if (sg.status === 404 || (sg.body && sg.body.error === 'not_ready')) skip('Gilgit season', 'seasonal job not run yet (not_ready)'); else fail('Gilgit season', 'HTTP ' + sg.status);
  const sl = await get('/api/outlook/seasonal?unit=Lahore');
  if (sl.status === 200 && sl.body && sl.body.seasonal && sl.body.seasonal.months && sl.body.seasonal.months.length) {
    const M = sl.body.seasonal.months;
    M.every(m => m.display !== 'anomaly') && M.some(m => typeof m.tMean === 'number') ? pass('Lahore season keeps the absolute month', M[0].tMean + ' C') : fail('Lahore absolute month', JSON.stringify(M[0]).slice(0, 160));
  } else if (sl.status === 404 || (sl.body && sl.body.error === 'not_ready')) skip('Lahore season', 'not ready'); else fail('Lahore season', 'HTTP ' + sl.status);

  /* 5 · ensemble basis, thresholds without skill strings, pool basis, fleet running correction */
  const ou = await get('/api/outlook/unit?unit=Gilgit');
  if (ou.status === 200) {
    const th = ou.body.thresholds || [];
    const withSkill = th.filter(t => ['tx40', 'tx45', 'tn0'].includes(t.id) && t.skill);
    withSkill.length ? fail('no hard-coded skill strings on the temperature thresholds', withSkill.map(t => t.id).join(',')) : pass('no hard-coded skill strings on the temperature thresholds');
    /detection 0\.|false-alarm rate fell|22,226 station-days/.test(JSON.stringify(ou.body)) ? fail('no station skill figures in the outlook text') : pass('no station skill figures in the outlook text');
    const E = ou.body.ensemble;
    if (E && E.basis) (E.basis.elevM != null && E.basis.version) ? pass('ensemble members carry their basis', 'elevM ' + E.basis.elevM + ', ' + E.basis.reference + ', ' + E.basis.version) : fail('ensemble basis', JSON.stringify(E.basis));
    else skip('ensemble basis', 'the ensemble has not re-run since the restart (6-hourly job)');
  } else fail('outlook unit', 'HTTP ' + ou.status);
  const pp = await get('/api/pool/point?lat=35.92&lon=74.31&days=2');
  if (pp.status === 200 && pp.body) {
    (pp.body.basis && pp.body.basis.correction && !/MOS/.test(pp.body.correctionNote || '')) ? pass('pool on the served basis', pp.body.basis.correction + ' at ' + pp.body.basis.elevM + ' m') : fail('pool basis', JSON.stringify(pp.body.basis || null) + ' ' + (pp.body.correctionNote || ''));
  } else skip('pool basis', 'HTTP ' + pp.status);
  const fs = await get('/api/fleet/status');
  (fs.status === 200 && fs.body && fs.body.runningCorrection && fs.body.runningCorrection.version) ? pass('MACH running correction present', JSON.stringify(fs.body.runningCorrection)) : fail('MACH running correction status', 'HTTP ' + fs.status + ' ' + JSON.stringify(fs.body && fs.body.runningCorrection));

  /* 6 · the client asks for the zone models inside the mountain boxes */
  try {
    const r = await fetch(BASE + '/analyst', { headers: H }); const html = await r.text();
    const m = html.match(/var ZB=(\[\[[^;]*?\]\]), ZM='([^']+)'/);
    if (!m) fail('client zone request (FIX f70t1)', 'not found in the served page');
    else {
      const boxes = JSON.parse(m[1]);
      (m[2] === reqModels) ? pass('client zone models = data/model-zone.json', m[2]) : fail('client zone models', m[2] + ' vs ' + reqModels);
      const zs = await get('/api/mos/status'); const want = zs.body && zs.body.temperatureBasis && zs.body.temperatureBasis.clientBoxes;
      if (want) JSON.stringify(boxes) === JSON.stringify(want) ? pass('client boxes = data/model-zone.json') : fail('client boxes', 'differ from the zone file');
      else skip('client boxes', 'status does not expose clientBoxes');
    }
  } catch (e) { fail('client page', e.message); }

  console.log(fails ? fails + ' FAIL' : 'all temperature checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness error ' + e.message); process.exit(1); });
