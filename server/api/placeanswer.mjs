/* ══ v91.17.283.49 · NIGRAAN 1.0.10 · THE PLACE ANSWER ════════════════════════════════════════════════════════════════════════════════
   GET /api/place/answer?lat=&lon=[&scenario=<saved id>][&view=customer|operator]
   ONE served object for a place and its issue time: what every page shows and what every report prints. It is ASSEMBLED, not computed:
   each part is read from the endpoint the pages read, through this server's own port, with the caller's view (a customer answer passes
   the response-point scrub like any customer answer), so a change in a served part reaches the pages and the reports alike:
     /api/point                 values (now, 72 hours, 7 days), site levels by day, hazard count (incl. air quality), air quality days,
                                site screening, river, glacial lakes, facts, provenance stamp
     /api/report/context        forecast-triggered actions, standing measures, watch list, 15-day ensemble, weeks and season ahead,
                                the measured skill line, provenance
     /api/hazards/applicability what cannot happen here, with the reason
     /api/guidance              "What to do" items (NDMA / PDMA guidance; only when GUIDANCE_PANEL=1)
     /api/registry/levels       the level words and the UTCI class cuts of the heat and cold levels
     /api/scenario/result       a saved Scenario Lab result, when its id is given
   A part that did not answer is listed under unavailable with its reason and, where the part said so, the time of its last good value;
   it is never replaced by a number. */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { boundedCache } from './boundcache.mjs';

const PORT = () => Number(process.env.PORT || 8787);
const HZ = [   /* the hazard rows of a place, in print order: bar key (hazard count), layer key (levels), name */
  ['heat', 'heat', 'Heat'], ['cold', 'cold', 'Cold'], ['rain', 'rain_hz', 'Heavy rain'], ['wind', 'wind', 'Wind'], ['flood', 'flood', 'River flood'],
  ['landslide', 'landslide', 'Landslide'], ['glof', 'glof', 'Glacial lake flood'], ['drought', 'drought', 'Drought'], ['air', null, 'Air quality']];
export const HAZARD_ROWS = HZ;
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

export const selfGet = (...a) => selfGetHttp(...a);
function selfGetHttp(path, { customer = true, ms = 60000 } = {}) {
  return new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port: PORT(), path, agent: false, timeout: ms,
      headers: { host: 'localhost:' + PORT(), 'accept-encoding': 'identity', 'x-agn-report': 'engine', 'x-agn-view': customer ? 'customer' : 'operator' } }, (x) => {
      const ch = []; x.on('data', (c) => ch.push(c)); x.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch (_) { j = null; } resolve({ status: x.statusCode, json: j }); });
      x.on('error', () => resolve({ status: 0, json: null })); });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null, timeout: true }); }); r.on('error', () => resolve({ status: 0, json: null }));
  });
}
const fin = (x) => x != null && x !== '' && Number.isFinite(Number(x));
const lvOf = (L) => { if (!L) return null; if (fin(L.level) && +L.level >= 0 && +L.level <= 4) return +L.level; const i = WORDS.indexOf(String(L.word || '')); return i >= 0 ? i : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPlaceAnswer(app) {
  /* v283.51g3 · bounded by bytes as well (boundcache.mjs): at most 60 answers, NIGRAAN_PLACEANSWER_CACHE_MB (default 24 MB) in all, 20 s each */
  const CACHE = boundedCache({ ttlMs: 20e3, maxBytes: Math.max(1, Number(process.env.NIGRAAN_PLACEANSWER_CACHE_MB) || 24) * 1048576, maxItems: 60 }), INFLIGHT = new Map();
  { const t = setInterval(() => CACHE.sweep(), 30e3); t.unref?.(); }   /* an answer is served 20 s at most */
  /* v91.17.283.51 · B2 · the parts are read in-process through the server's own request listener (inproc.mjs: the same routes, view rules
     and customer scrub, no socket); over the port only when the listener is not there (a test harness without server.mjs) */
  const selfGet = (path, { customer = true, ms = 60000 } = {}) => (typeof app.inject === 'function'
    ? app.inject(path, { 'x-agn-report': 'engine', 'x-agn-view': customer ? 'customer' : 'operator' }, { ms })
    : selfGetHttp(path, { customer, ms }));
  /* single flight: one assembly per place, view and scenario at a time; a second caller waits for it */
  async function answer(q, opt = {}) {
    const lat = Number(q.lat), lon = Number(q.lon), customer = opt.customer !== false;
    const k = (Number.isFinite(lat) ? lat.toFixed(5) : 'x') + '|' + (Number.isFinite(lon) ? lon.toFixed(5) : 'x') + '|' + (customer ? 'c' : 'o') + '|' + (q.scenario || '') + '|' + (q.audience || '');
    const f = INFLIGHT.get(k); if (f) return f;
    const pr = answer1(q, { customer }).finally(() => INFLIGHT.delete(k)); INFLIGHT.set(k, pr); return pr;
  }
  async function answer1(q, { customer = true } = {}) {
    const lat = Number(q.lat), lon = Number(q.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 23 || lat > 38 || lon < 60 || lon > 78) return { ok: false, status: 400, why: 'lat and lon are required, inside Pakistan' };
    const ll = 'lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5), view = customer ? 'customer' : 'operator';
    const ck = ll + '|' + view + '|' + (q.scenario || '');
    const hit = CACHE.get(ck); if (hit) return hit;   /* v91.17.283.49 merge: 20 s (was 120 s): a report must say the 'now' the pages say; the live station layer moves it every poll */
    const opt = { customer };
    /* the place bundle; a bundle whose place record is still being made is asked again (up to 3 times, 3 s apart) */
    /* v91.17.283.51 · B2 · the other parts are asked at the same time as the place bundle (they never read it); a bundle whose place record is
       still being made is read once more with complete=1 (the server answers when its parts have settled: the same bundle and values,
       without the 3-second waits of 1.0.10) */
    const others = Promise.all([
      selfGet('/api/report/context?' + ll + '&section=operations', opt), selfGet('/api/hazards/applicability?' + ll, opt),
      selfGet('/api/guidance?' + ll + '&audience=' + encodeURIComponent(q.audience || 'business'), opt), selfGet('/api/registry/levels', opt),
      q.scenario ? selfGet('/api/scenario/result?id=' + encodeURIComponent(q.scenario), opt) : Promise.resolve(null), selfGet('/api/alerts', opt)]);
    let pt = await selfGet('/api/point?' + ll, opt);
    const recOk = (x) => { const v = x && x.json; return !!(v && v.ok !== false && v.parts && v.parts.placeRecord && v.parts.placeRecord.ok); };
    const outside = (x) => !!(x && x.json && x.json.ok === false && (x.json.outside || x.json.atSea));
    /* a bundle not yet made (ok:false for a passing reason: the provider limit, a time-out) is asked again, up to 3 times, as 1.0.10 did */
    for (let i = 0; i < 3 && !recOk(pt) && !outside(pt); i++) { if (i || !(pt.json && pt.json.ok !== false)) await sleep(i ? 2000 : 1000); pt = await selfGet('/api/point?' + ll + '&complete=1', opt); }
    const [ctx, apl, gd, reg, scen, nat] = await others;
    const unavailable = [];
    const P = pt && pt.json && pt.json.ok !== false ? pt.json : null;
    if (!P) { if (outside(pt)) { const w = String(pt.json.why || '').trim(); return { ok: false, status: 404, outside: true, why: w ? w[0].toUpperCase() + w.slice(1) : 'NIGRAAN publishes no forecast or hazard level at this point.' }; }   /* v91.17.283.51: a plain reason, not a status code */
      return { ok: false, status: 503, why: 'The forecast for this point is not available right now. Please try again in a few minutes.' }; }
    const part = (k) => { const x = P.parts && P.parts[k]; if (x && x.ok && x.v) return x.v; unavailable.push({ part: k, why: (x && (x.why || (x.v && (x.v.why || x.v.reason)))) || 'not held', lastGood: (x && x.v && (x.v.at || x.v.lastGoodAt)) || null }); return null; };
    const LV = part('levels'), HC = part('hazardCount'), SM = part('smog'), SS = part('siteScreening'), RV = part('river'), GL = part('glof'), FC = part('facts'), SL = part('siteLevels');
    const C = ctx && ctx.json && ctx.json.schema ? ctx.json : null; if (!C) unavailable.push({ part: 'reportContext', why: 'the outlook and actions could not be read', lastGood: null });

    /* ── values ── */
    const nowT = (P.now && P.now.time) || null;
    const hours = (P.hours || []).filter((h) => !nowT || h.time >= nowT.slice(0, 13)).slice(0, 72);
    const days = (P.days || []).slice(0, 7).map((d) => ({ date: d.date, lead: d.lead, tmaxC: d.tmaxC, tminC: d.tminC, feelsMaxC: d.feelsMaxC, rainMm: d.rainMm, rainMmRaw: fin(d.rainMmRaw) ? +d.rainMmRaw : null, rainProbMax: d.rainProbMax,
      gustMaxKmh: d.gustMaxKmh, windMaxKmh: d.windMaxKmh, snowCm: d.snowCm, utciMaxC: d.heat && d.heat.utciMaxC, utciMinC: d.cold && d.cold.utciMinC,
      heat: d.heat && d.heat.assessed ? { word: d.heat.level, level: WORDS.indexOf(d.heat.level) } : null, cold: d.cold && d.cold.assessed ? { word: d.cold.level, level: WORDS.indexOf(d.cold.level) } : null }));

    /* ── levels by day: the hazard count's bars (the one per-day answer the pages count, incl. air quality), the tehsil layer for the
       product type and the alert rule (tier 1 = a level the gate lets raise an alert, i.e. it passed its event test) ── */
    const lvDays = (HC && HC.days) || [];
    const layerOf = (date, k) => { const d = LV && (LV.days || []).find((x) => x.date === date); return d && d.layers ? d.layers[k] : null; };
    const hz = HZ.map(([key, lk, name]) => {
      const rows = lvDays.map((d) => { const b = (d.bars || []).find((x) => x.key === key) || null; const L = lk ? layerOf(d.date, lk) : null;
        const lv = b && b.state === 'level' ? lvOf(b) : null;
        return { date: d.date, level: lv, word: lv != null ? WORDS[lv] : (b ? b.word : 'Not assessed'), state: b ? (b.state === 'level' ? 'value' : b.state) : 'missing',
          why: (L && (L.notAssessedWhy || L.why)) || (b && b.why) || null, productType: (b && b.productType) || (L && L.productType) || null,
          canAlert: b && b.canAlert != null ? !!b.canAlert : (L ? L.canAlert === true : false), area: !!(b && b.area), value: L && fin(L.value) ? +L.value : null, unit: L ? L.unit || null : null,
          valueBasis: L ? L.valueBasis || null : null, tier: b && (b.tier === 1 || b.tier === 2) ? b.tier : null }; });
      /* days 5-7: heat and cold are issued at the site for 7 days (the same UTCI levels, the place forecast's days) */
      if (key === 'heat' || key === 'cold') for (const d of days.slice(rows.length)) { const x = d[key]; if (x && x.level >= 0) rows.push({ date: d.date, level: x.level, word: x.word, state: 'value', productType: rows[0] && rows[0].productType, canAlert: rows[0] ? rows[0].canAlert : false, valueOnly: false, extended: true }); }
      const tier = rows.some((r) => r.tier === 1) ? 1 : rows.some((r) => r.tier === 2) ? 2 : (rows.some((r) => r.level != null && r.canAlert) ? 1 : 2);
      return { key, layer: lk, name, tier, days: rows };
    });
    /* air quality: the served air-quality days (AQI category of the day from the served daily PM2.5); a served air level on the hazard count
       (when the count carries one) is the tile's level, otherwise the tile carries the category word */
    const air = SM && Array.isArray(SM.days) ? { at: SM.at || null, stale: !!SM.stale, staleWhy: SM.staleWhy || null, ageH: SM.ageH,
      days: SM.days.map((d) => ({ date: d.date, aqi: fin(d.aqi) ? +d.aqi : null, category: d.aqiCategory || null, pollutant: d.aqiPollutant || null, pm25: fin(d.pm25) ? +d.pm25 : null, pm10: fin(d.pm10) ? +d.pm10 : null })),
      basis: (SM.days[0] && SM.days[0].aqiOwnBasis) || null, caveats: SM.caveats || null } : null;
    if (air && air.stale) unavailable.push({ part: 'air', why: air.staleWhy || 'the air-quality forecast is not current', lastGood: air.at });

    /* ── applicability: what cannot happen here (the applicability answer, and a hazard row not applicable on every day held) ── */
    const A = apl && apl.json && apl.json.ok ? apl.json : null;
    const cannot = [];
    for (const h of (A && A.hazards) || []) if (h.applies === false || h.state === 'not_applicable') cannot.push({ key: h.hazard, name: h.name, why: h.why || h.text || null });
    for (const r of hz) if (r.days.length && r.days.every((d) => d.state === 'not_applicable') && !cannot.some((c) => c.key === r.key || (c.key === 'flood_riverine' && r.key === 'flood'))) cannot.push({ key: r.key, name: r.name, why: (r.days[0] && r.days[0].why) || null });
    /* v91.17.283.51 g2 · live test 51 (Clifton): a hazard the applicability answer says CAN happen here but that has no row in the place's
       levels (coastal heat and surge, tropical cyclone, ...) was printed nowhere; it is now named, with its applicability text */
    const noLevel = []; for (const h of (A && A.hazards) || []) { if (!(h.applies === true || h.state === 'value')) continue; const k = h.hazard; if (k === 'frost' || k === 'snow') continue;   /* frost and snow are read on the Cold row (UTCI cold stress) */ if (HZ.some(([hk]) => hk === k || (hk === 'flood' && k === 'flood_riverine') || (hk === 'rain' && k === 'rain_hz'))) continue; noLevel.push({ key: k, name: h.name || k, why: h.why || h.text || null }); }
    for (const r of hz) r.cannot = cannot.some((c) => c.key === r.key || (r.key === 'flood' && c.key === 'flood_riverine') || (r.key === 'rain' && c.key === 'rain_hz'));

    /* ── river and glacial lakes: only where they concern the place ── */
    const reaches = RV && RV.reaches ? Object.keys(RV.reaches) : [];
    const river = RV ? { relevant: reaches.length > 0, reaches: reaches.map((k) => ({ id: k, ...RV.reaches[k] })), floodMap: FC && FC.fields && FC.fields.floodMap ? FC.fields.floodMap.summary || null : null } : null;
    const glofRow = hz.find((r) => r.key === 'glof');
    const lakesUp = GL ? (GL.counts && fin(GL.counts.lakes) ? +GL.counts.lakes : (Array.isArray(GL.lakes) ? GL.lakes.length + (+GL.more || 0) : null)) : null;
    const glof = GL ? { relevant: !glofRow.cannot && GL.applicable !== false && (lakesUp || 0) > 0, applicable: GL.applicable !== false, lakesUpstream: lakesUp, counts: GL.counts || null,
      lakes: (Array.isArray(GL.lakes) ? GL.lakes : []).slice(0, 6).map((k) => ({ name: k.name, tier: k.tierLabel || null, kmAlong: k.kmAlong, S: k.susceptibility ? k.susceptibility.S : null, events: k.documentedEvents ? k.documentedEvents.n : null, condition: k.condition ? k.condition.text : null })),
      text: GL.text || null } : null;

    /* ── outlook ── */
    const O = C && C.outlook ? C.outlook : null;
    const ens = O && O.ensemble && Array.isArray(O.ensemble.days) ? { at: O.ensemble.at, members: O.ensemble.members, days: O.ensemble.days } : null;
    const ensAgeH = ens && Date.parse(ens.at) ? (Date.parse(P.issuedAt || new Date().toISOString()) - Date.parse(ens.at)) / 3600e3 : null;
    if (ens && ensAgeH != null && ensAgeH > 18) unavailable.push({ part: 'ensemble', why: 'the 15-day ensemble run is older than 18 hours', lastGood: ens.at });
    const outlook = { ensemble: ens && !(ensAgeH > 18) ? ens : null, weeks: C && C.subseasonal ? { at: C.subseasonal.at || null, weeks: C.subseasonal.weeks || [], use: C.subseasonal.use || null } : null,
      months: C && C.seasonal ? { months: C.seasonal.months || [], use: C.seasonal.use || null } : null };

    /* ── actions: forecast-triggered first, then the guidance for a hazard at Low or above, then standing measures; the watch list ── */
    const G = gd && gd.status === 200 && gd.json && gd.json.ok !== false && Array.isArray(gd.json.hazards) ? gd.json : null;
    const actions = [];
    for (const a of (C && C.actions) || []) actions.push({ source: 'event', hazard: a.hazard, trigger: a.trigger || null, action: a.action || (a.actions || []).join(' '), owner: a.owner || null, when: a.prepareBy || a.when || null, productType: a.productType || null, tier: a.productType === 'Forecast' ? 1 : 2 });
    if (G) for (const h of G.hazards) { if (h.status === 'coming' || h.status === 'not_relevant' || h.status === 'no_level' || !h.tabs || !h.tabs.do) continue;
      /* v91.17.283.51 g2 · live test 51 (Lahore 'Plan shifts so heavy outdoor work avoids 10 am to 5 pm. Why: Heat Low' in November): the guidance
         pack's own level map (data/guidance/manifest.json levelMap) sends Normal and Low to 'standing preparedness', which takes every
         'before' item whatever its levels tag; that is the panel's preparedness list, not an action the issued level triggers. A guidance
         action now enters the report only for a mapped level (Moderate -> monitor, High -> watch, Severe -> act; status 'level'), and the item
         must carry that level in its own levels tag */
      if (!(h.status === 'level' && h.level && ['Moderate', 'High', 'Severe'].includes(h.level.word))) continue;   /* v91.17.283.49 merge: as the line above says, Low or above only (real data 3 Nov: "Why: Landslide Normal" was a top action) */
      const it = (h.tabs.do.phases || []).flatMap((ph) => ph.items || []).find((x) => !Array.isArray(x.levels) || !h.guidanceLevel || x.levels.includes(h.guidanceLevel)); if (!it) continue;
      actions.push({ source: 'guidance', hazard: h.name, trigger: h.level && h.level.word ? h.name + ' ' + h.level.word : h.label || null, action: it.text, owner: null, sourceName: (it.source && (it.source.short || it.source.doc)) || null, tier: 1 }); }
    const standing = ((C && C.standing) || []).map((s) => ({ id: s.id, hazard: s.hazard, measure: s.measure, why: s.why, owner: s.owner || null, evidence: s.evidence || null, fact: !!s.fact }));
    const watch = ((C && C.watch) || []).map((w) => ({ hazard: w.hazard, what: w.what, source: w.source || null, productType: w.productType || null }));

    const scenario = scen && scen.status === 200 && scen.json ? scen.json : null;
    if (q.scenario && !scenario) unavailable.push({ part: 'scenario', why: 'the saved scenario is not held on this server', lastGood: null });

    const pl = P.place || {}, ar = P.area || {};
    const out = {
      ok: true, schema: 'agn.place-answer.v1', view,
      issuedAt: P.issuedAt || null, run: P.run || null, levelsAt: LV ? LV.at || null : null, levelsValidUntil: LV ? LV.validUntil || null : null, levelsIssueId: LV ? LV.issueId || null : null,
      place: { name: pl.name || null, label: pl.label || null, kind: pl.kind || null, near: pl.near && pl.near.name ? { name: pl.near.name, km: pl.near.km } : null, tehsil: pl.tehsil || ar.tehsil || null, district: pl.district || ar.district || null, province: pl.province || ar.province || null,
        unitId: pl.unitId || ar.unitId || null, lat: P.point ? P.point.lat : lat, lon: P.point ? P.point.lon : lon, elevM: P.point ? P.point.elevM : null, zone: P.point ? P.point.zone : null },
      now: P.now || null, shown: P.shown || null, hours, days,   /* v91.17.283.49 merge: shownplace.mjs strings for the report's 'Now at the site' line */ levels: { words: WORDS, days: lvDays.map((d) => d.date), hazards: hz, threshold: HC ? HC.threshold || null : null, alerts: LV ? LV.alerts || [] : [] },
      cannotHappen: cannot, noLevel, air, river, glof, siteScreening: SS && Array.isArray(SS.rows) ? { rows: SS.rows } : null,
      outlook, actions, standing, watch, guidance: G ? { library: G.library || null, contacts: G.contacts || null, footer: G.footer || null } : null, scenario,
      skill: C ? { line: C.skill && C.skill.label || null, measured: C.measuredSkill && C.measuredSkill.lines || null, drought: C.drought || null } : null,
      /* v91.17.283.52 D · #150 (Situation "1 area on alert: Karachi (Heat stress · Low)" while the map legend says Low is never an alert): an
         area is ON ALERT at Moderate or above, the map's alert rule; Low rows are counted apart (watch) and never called an alert */
      national: nat && nat.json && nat.json.ready ? (() => { const all = nat.json.rows || [], isAlert = (r) => !/^\s*(normal|low|none)\b/i.test(String(r.band || String(r.alert || '').split(' · ').pop() || ''));
        const al = all.filter(isAlert); return { at: nat.json.at || null, stale: !!nat.json.stale, count: al.length, watch: all.length - al.length, rows: al.slice(0, 12).map((r) => ({ name: r.name, alert: r.alert, band: r.band, hazard: r.hazard })) }; })() : null,
      heatCuts: reg && reg.json && reg.json.levels ? reg.json.levels : null,
      provenance: { snapshot: (C && C.provenance && C.provenance.snapshot) || null, chainId: P.chainId || null, stamp: P.stamp || null, app: (C && C.provenance && C.provenance.app) || null,
        digest: (C && C.provenanceSha256) || null, levelsIssueId: LV ? LV.issueId || null : null },
      unavailable,
    };
    out.answerId = 'A' + createHash('sha256').update(JSON.stringify([out.place, out.issuedAt, out.levelsIssueId, out.days, out.levels.hazards, out.air && out.air.days, view, q.scenario || ''])).digest('hex').slice(0, 16);
    CACHE.set(ck, out);   /* v91.17.283.51 · memory: 60 answers (was 200), and the expired ones dropped below */
    return out;
  }
  return { answer };
}
