/* ══ v91.17.79 · SITE RISK: "What could affect this site in the next 15 days" ════════════════════════════════════
   CEO (27 Sep): the sector × hazard matrix, the compound-pathway chains and the engineering readiness table read the
   same at every site and told a customer nothing. This module answers two questions at a POINT:

   risk(lat, lon, sector)   which compound / cascading pathways are switched on at this site in the 15-day ensemble,
                            with the dates and numbers that switch them on, and the consequence and first action for
                            the asset type. Rules and text: data/site-risk-pathways.json. No pathway on → one line.
   screening(lat, lon)      screening values for engineering: 2/10/25-year daily rain and 10/50-year daily max gust
                            from the 1940-2025 reanalysis annual maxima at the point (Gumbel, L-moments), the hot-season
                            temperature from the climatology baseline, and the flood position of the point (height
                            above the nearest river and local channel, tehsil flooded share in 2010 / 2022 / 2025).
                            v91.17.252 · A4 · every row carries a level on the one customer scale (Normal / Low / Moderate /
                            High / Severe, data/hazard-scale.json) or a `state` that names why it has none ("Input required:
                            ...", standing, reference); heat is levelled on UTCI only.

   Both are screening, not design values. The return levels are cached per 0.25° reanalysis cell in
   data/cache/site-rl/, so a cell is fetched once (one archive call, 3 daily variables, 86 years). */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatGrid } from './featgrid.mjs';
import { unitAtPoint } from './unitresolve.mjs';
import { createSpongeTiles } from './spongetiles.mjs';   /* v283.49 · 1.0.10 item 3: the 250 m ground class at the site */   /* v91.17.162 · audit A-2 */
import { utciAgnScore, utciClass } from './utci.mjs';   /* v91.17.252 · A4 · UTCI, the public heat scale */
import { pktDay } from './pktday.mjs';
import { clientWhy } from './clientwhy.mjs';
import { ensAge, limitH as dataLimitH, DATA_AGE } from './dataage.mjs';   /* v283.36 item 29: one data-age table */   /* v91.17.283 · INTEG (F4): plain reasons, never raw exception text */

const R1 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10;
const R0 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x);
const med = (a) => Array.isArray(a) ? a[1] : null;
const hi = (a) => Array.isArray(a) ? a[2] : null;
const kmBetween = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
const fmtDay = (iso) => { if (!iso) return null; const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const span = (a, b) => !a ? null : (!b || a === b ? fmtDay(a) : fmtDay(a) + '–' + fmtDay(b));

/* Gumbel by L-moments (Hosking 1990): robust with 30-90 annual maxima; x_T = xi - alpha * ln(-ln(1 - 1/T)) */
export function gumbelL(xs) {
  const x = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = x.length; if (n < 20) return null;
  let b0 = 0, b1 = 0; for (let i = 0; i < n; i++) { b0 += x[i]; b1 += (i / (n - 1)) * x[i]; } b0 /= n; b1 /= n;
  const l1 = b0, l2 = 2 * b1 - b0; const alpha = l2 / Math.LN2, xi = l1 - 0.5772156649 * alpha;
  return { n, xi, alpha, at: (T) => xi - alpha * Math.log(-Math.log(1 - 1 / T)) };
}

/* v91.17.283.52 D · plain words for the report and the pages: great-circle km; an ISO week as the date its Monday falls on ("week of 19 Oct",
   live test 52 N21: "week 2026-W43"); why the observed drought month lags (#107: "to Sep 2026" on 3 Nov) */
const kmTo = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function weekText(w) { const m = /^(\d{4})-W(\d{1,2})$/.exec(String(w || '')); if (!m) return w ? 'week ' + w : 'this week';
  const y = +m[1], n = +m[2], j4 = new Date(Date.UTC(y, 0, 4)), mon = new Date(j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 864e5 + (n - 1) * 7 * 864e5);
  return 'week of ' + mon.getUTCDate() + ' ' + MON3[mon.getUTCMonth()] + ' ' + mon.getUTCFullYear(); }
export function lagWhy(month, nowMs = Date.now()) { const m = /^(\d{4})-(\d{2})$/.exec(String(month || '')); if (!m) return '';
  const pk = new Date(nowMs + 5 * 3600e3), last = new Date(Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth() - 1, 1)); const have = Date.UTC(+m[1], +m[2] - 1, 1);
  if (have >= last.getTime()) return '';
  const nxt = new Date(have); nxt.setUTCMonth(nxt.getUTCMonth() + 1);
  return '; the latest month of the satellite rain record (' + MON3[nxt.getUTCMonth()] + ' is added when the record publishes it, about three weeks after the month ends)'; }
export function createSiteRisk(app, dataDir) {
  const fg = app.featGrid || createFeatGrid(dataDir, { maxBlocks: 24 });
  /* v91.17.252 · A4 · one reader for every table this module uses, re-read when the file changes; null when absent */
  const JS = new Map();
  const json = (name) => { const f = join(dataDir, name); try { const m = statSync(f).mtimeMs, c = JS.get(name); if (c && c.m === m) return c.v; const v = JSON.parse(readFileSync(f, 'utf8')); JS.set(name, { m, v }); return v; } catch (_) { return null; } };
  const cfg = () => json('site-risk-pathways.json'), fx = () => json('flood-extent-calibration.json');
  /* v91.17.252 · A4 · the one customer scale (data/hazard-scale.json): a 0-100 score by screeningCuts, an engine class by operationalLadder */
  const levelOfScore = (s) => { const H = json('hazard-scale.json'); const c = s == null || !H ? null : H.screeningCuts.find((x) => s >= x.min); return c ? c.level : null; };
  const ladder = (cls) => { const H = json('hazard-scale.json'); return (H && H.operationalLadder && H.operationalLadder[cls]) || null; };
  /* forecast against two return levels, as the a-priori return-period ladder of data/river-rarity.json: below the first no class, at the first
     and at the second the ladder's two upper classes. The keys are hazard-scale.json operationalLadder keys (engine classes, never shown);
     the words come from the file (none → Normal, first → High, second → Severe today) */
  const K_NONE = 'none', K_FIRST = 'Watch', K_SECOND = 'Act';
  const rlLevel = (x, first, second) => x == null || first == null ? null : ladder(second != null && x >= second ? K_SECOND : x >= first ? K_FIRST : K_NONE);
  /* v91.17.252 · A4 · "reached": a level at or above the one the first return level gives; served with the scale so no page holds a list */
  const scale = () => { const H = json('hazard-scale.json'); return H && Array.isArray(H.levels) ? { levels: H.levels, reachedFrom: ladder(K_FIRST), source: 'data/hazard-scale.json operationalLadder' } : null; };
  const isReached = (lv, S) => !!(lv && S && S.reachedFrom && S.levels.indexOf(lv) >= S.levels.indexOf(S.reachedFrom));
  /* the standard lapse (engineering-references.json: ICAO Doc 7488, -6.5 °C/km), the one AGN's 46-station test kept (lapse-table.json decision) */
  const lapseCperM = () => { const E = json('engineering-references.json'); const v = E && E.references && E.references.standard_lapse_rate_C_per_m && E.references.standard_lapse_rate_C_per_m.value; return Number.isFinite(v) ? v : null; };
  /* its measured daytime residual far from the grid height (lapse-dynamic.json, leave one station out): the gap of the test split and the bias */
  const lapseTest = () => { const D = json('lapse-dynamic.json'); const m = D && Array.isArray(D.metrics) ? D.metrics.find((x) => x.option === 'provider fixed lapse (served)' && /\|dz\| > \d+ m, day$/.test(x.split || '')) : null;
    return m ? { dzM: Number(m.split.match(/\|dz\| > (\d+) m/)[1]), biasC: m.bias_c, maeC: m.mae_c, n: m.n } : null; };
  const need = (what) => 'Input required: ' + what;
  let SPT = null;   /* v283.49 item 3 */
  const STANDING = 'Standing (not a 15-day forecast)', REFERENCE = 'Reference (not a forecast)';
  /* v91.17.253 · W3 · W3-6 · the HAND class of a height and the share of such ground under water in each mapped flood (data/hand-calibration.json,
     scripts/hand_calibration.py: breaks fitted to the NDMA 2010/2014/2022/2025 extents, order checked on each event held out and on UNOSAT 2022) */
  const HAND_TO = { t_hand: 'a river', t_hand_local: 'a drain or stream' };
  const handClass = (band, h) => { const B = json('hand-calibration.json'), b = B && B.bands && B.bands[band]; if (h == null || !b) return null;
    const c = b.classes.find((x) => h >= x.fromM && (x.toM == null || h < x.toM)); if (!c) return null;
    const fl = Object.entries(c.floodedShare).filter(([k, v]) => b.events[k] && b.events[k].fitted && v != null).map(([k, v]) => ({ year: k.slice(-4), pct: R1(100 * v) }));
    return fl.length ? { fromM: c.fromM, toM: c.toM, flooded: fl, source: 'data/hand-calibration.json',
      text: 'of the ground ' + (c.toM == null ? c.fromM + ' m or more' : c.fromM + '–' + c.toM + ' m') + ' above ' + HAND_TO[band] + ', ' + fl.map((x, i) => x.pct + ' %' + (i ? '' : ' was under water') + ' in ' + x.year).join(', ') } : null; };

  /* v91.17.162 · audit A-2 · the tehsil the point lies IN (polygon, unitresolve.mjs). The old nearest-centroid fallback within 60 km
     screened Amritsar (India) as Lahore Cantt. Only a polygon hit or a boundary snap of at most SNAP_KM (a coastal or survey point
     just outside the outline) is accepted; anything else is 'no tehsil at this point'. */
  const SNAP_KM = 5;
  /* v91.17.283 · INTEG (WS4 B6) · ONE ensemble-age rule, the same as the report kit's (page: "more than 18 hours old"): the 15-day ensemble
     refreshes every NIGRAAN_ENSEMBLE_HOURS (outlook.mjs, default 12 h since v283: the 00 and 12 UTC runs only, WS1 decision D1); a run
     counts as current for one refresh interval plus half of one for the provider's availability delay: 1.5 x 12 h = 18 h. The server
     used 36 h here, twice what the page printed for the same run. */
  const ENS_CYCLE_H = DATA_AGE.ens.cycleH, ENS_MAX_AGE_H = dataLimitH('ens');   /* v283.36 item 29 (was 1.5 x 12 = 18 h from receipt) */
  const ENS_AGE_RULE = 'the 15-day forecast ensemble is updated every ' + ENS_CYCLE_H + ' h (the 00 and 12 UTC runs); a run more than ' + ENS_MAX_AGE_H + ' h past its base time (' + ENS_CYCLE_H + ' h cycle + ' + DATA_AGE.ens.delayH + ' h delivery) is not used';   /* v91.17.252 · A4 · HEAT_ELEV_GAP_M (200 m, no source) retired: the heat values are moved to the site height */
  function unitOf(lat, lon) {
    let r = null; try { r = unitAtPoint(app, lat, lon); } catch (_) { r = null; }
    if (r && r.unit && (r.by === 'polygon' || (r.km != null && r.km <= SNAP_KM))) { const u = app.outlook.findUnit(r.unit.unitId); if (u) return u; }
    { try { const f = app.urbanHeat && app.urbanHeat.unitAt ? app.urbanHeat.unitAt(lat, lon) : null; const u = f && f.uid ? app.outlook.findUnit(f.uid) : null; if (u) return u; } catch (_) {} }
    return null;
  }
  function ground(lat, lon, unitId) {
    const v = (b) => { try { return fg.value(b, lat, lon); } catch (_) { return null; } };
    const g = { handRiverM: R1(v('t_hand')), handLocalM: R1(v('t_hand_local')), waterKm: R1(v('w_dist')), waterOccurrencePct: R0(v('w_occ')), slopeDeg: R1(v('t_slope')), elevM: R0(v('t_elev')) };
    g.handRiverClass = handClass('t_hand', g.handRiverM); g.handLocalClass = handClass('t_hand_local', g.handLocalM);
    const X = fx(); g.flooded = {};
    if (X && X.sets) for (const [k, y] of [['pk2010', 2010], ['pk2022', 2022], ['pk2025', 2025]]) { const s = X.sets[k]; const r = s && s.units && s.units[unitId]; if (r && r.floodedShare != null) g.flooded[y] = Math.round(r.floodedShare * 1000) / 10; }
    let w = null; try { w = app.wetness && app.wetness.current ? app.wetness.current(unitId) : null; } catch (_) {}   /* v91.17.172 · audit E-4: a run older than 9 h is not the ground now */
    g.wetness = w && w.now ? { state: w.now.state, plus72h: w.plus72h ? w.plus72h.state : null } : null;
    if (!g.wetness) { try { const sn = app.wetness && app.wetness.staleNote ? app.wetness.staleNote() : null; if (sn) g.wetnessStale = sn; } catch (_) {} }
    return g;
  }
  function nearestRiver(lat, lon, maxKm) {
    const F = app.flood; if (!F || !F.POINTS) return null; let best = null, bd = Infinity;
    for (const p of F.POINTS) { if (p.lat == null) continue; const d = kmBetween(lat, lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } }
    if (!best || bd > maxKm) return null;
    let v = null; try { v = F.point(best.id); } catch (_) {}
    /* v91.17.157 · audit · a river forecast older than 30 h is not compared with the next 15 days */
    const ageH = v && v.at ? (Date.now() - Date.parse(v.at)) / 3600e3 : Infinity;
    if (v && !(ageH <= 30)) return { id: best.id, name: v.point && v.point.name, river: v.point && v.point.river, km: R1(bd), days: [], stale: true, staleWhy: 'the river forecast is ' + (isFinite(ageH) ? Math.round(ageH) + ' h' : 'of unknown age') + ' old' };
    return v ? { id: best.id, name: v.point && v.point.name, river: v.point && v.point.river, km: R1(bd), days: v.days || [] } : null;
  }
  /* v91.17.252 · A4 · the next 15 days, read one way by risk() and screening(): the run no older than ENS_MAX_AGE_H (v91.17.162 · audit
     A-12; screening() compared an old run before), and only its days from today in Pakistan (a run's first days are already past) */
  function outlookOf(u) {
    const O = app.outlook.unit(u.unitId), E = O && O.ensemble, at = (E && E.at) || null, DR = (() => { try { return app.outlook.dayRows ? app.outlook.dayRows() : null; } catch (_) { return null; } })(), ageH = at ? ensAge({ at, issueInit: DR && DR.at === at ? DR.issueInit : null }).ageH : NaN, today = pktDay(Date.now());
    const days = E && E.days ? E.days.filter((d) => d && d.tx && d.date >= today) : [];
    const why = !E || !E.days ? 'the 15-day outlook has not run for ' + u.name
      : !(ageH <= ENS_MAX_AGE_H) ? 'the 15-day forecast ensemble for ' + u.name + ' is ' + (Number.isFinite(ageH) ? Math.round(ageH) + ' h old' : 'of unknown age') + ', more than ' + ENS_MAX_AGE_H + ' h'
      : !days.length ? 'the 15-day forecast for ' + u.name + ' holds no day from today' : null;
    return { O, at, ageH: Number.isFinite(ageH) ? Math.round(ageH) : null, days: why ? [] : days, why };
  }

  function risk(lat, lon, sector) {
    const C = cfg(); if (!C) return { ready: false, why: 'data/site-risk-pathways.json is not in this install' };
    const u = unitOf(lat, lon); if (!u) return { ready: false, why: 'no tehsil at this point' };
    const F = outlookOf(u), O = F.O, days = F.days;
    if (F.why) return { ready: false, at: F.at, ageH: F.ageH, place: { unitId: u.unitId, name: u.name, district: u.district, province: u.province }, why: F.why + '; site pathways are not assessed on it' };
    const ev = (O.events) || {}; const on = C.chanceOn; const R = C.rules; const G = ground(lat, lon, u.unitId);
    const sec = C.pathways.humidHeat.sectors[sector] ? sector : 'general';
    const act = [];
    const add = (id, facts, when, chance) => { const P = C.pathways[id]; const s = P.sectors[sec] || P.sectors.general;
      act.push({ id, title: P.title, when, chance: chance == null ? null : chance, facts: facts.filter(Boolean), chain: P.chain, impact: s.impact, action: s.action,
        productType: C.productType || 'Indicative', basis: (C.rules[id] && C.rules[id].basis) || null }); };   /* v91.17.283 · INTEG (WS4 B6): each card prints its product type and the basis of its cut */
    const evp = (k) => ev[k] && ev[k].p != null ? ev[k] : null;

    /* humid heat: apparent temperature */
    { const hot = days.filter((d) => med(d.at) != null && med(d.at) >= R.humidHeat.apparentC); const ch = evp('coastalHeat');
      if (hot.length || (ch && ch.p >= on)) { const pk = hot.slice().sort((a, b) => med(b.at) - med(a.at))[0];
        add('humidHeat', [pk && ('feels like ' + R0(med(pk.at)) + ' °C on ' + fmtDay(pk.date) + ' (air ' + R0(med(pk.tx)) + ' °C; median of the ensemble runs, so it can differ from the single named run on the next page)'), hot.length > 1 ? hot.length + ' days at or above ' + R.humidHeat.apparentC + ' °C feels-like' : null,
          ch && ch.p >= on ? 'humid-heat spell in ' + ch.p + ' % of forecast runs' : null], hot.length ? span(hot[0].date, hot[hot.length - 1].date) : span(ch.earliest, ch.onset), ch ? ch.p : null); } }
    /* hot nights */
    /* v91.17.253 · W3 · scan · the warm-night class floor from site-risk-pathways.json only (a typed 25 °C fallback removed) */
    { const nn = days.filter((d) => med(d.tx) >= R.hotNights.txC && med(d.tn) >= R.hotNights.tnC); const C2 = ev.heatSpellClasses || {};
      const warmest = Math.max(...days.map((d) => med(d.tn) ?? -99)); const cls = R.hotNights.classFloorTnC != null && warmest >= R.hotNights.classFloorTnC ? [C2.dayAndNight, C2.warmNight].filter((x) => x && x.p != null && x.p >= on).sort((a, b) => b.p - a.p)[0] : null; const tn30 = Math.max(0, ...days.map((d) => (d.p && d.p.tn30) || 0));
      if (nn.length || cls || tn30 >= on) { const warm = days.slice().sort((a, b) => med(b.tn) - med(a.tn))[0];
        add('hotNights', ['night minimum ' + R0(med(warm.tn)) + ' °C on ' + fmtDay(warm.date) + ' after a ' + R0(med(warm.tx)) + ' °C day', nn.length > 1 ? nn.length + ' hot days with hot nights' : null,
          cls ? 'warm-night spell in ' + cls.p + ' % of forecast runs' : null, tn30 >= on ? 'night at or above 30 °C in ' + tn30 + ' % of runs' : null],
          nn.length ? span(nn[0].date, nn[nn.length - 1].date) : (cls ? span(cls.earliest, cls.onset) : null), cls ? cls.p : (tn30 || null)); } }
    /* heavy rain on wet / low ground */
    { const r3 = evp('rain3_75'), rl = evp('rain3Local'); const big = days.filter((d) => d.p && d.p.pr25 >= R.rainFlood.dayChance);
      const heavy = (r3 && r3.p >= on) || (rl && rl.p >= on) || big.length;
      const wet = G.wetness && R.rainFlood.wetStates.includes(G.wetness.state); const low = (G.handLocalM != null && G.handLocalM < R.rainFlood.handLowM) || (G.handRiverM != null && G.handRiverM < R.rainFlood.handNearM);
      const past = Object.entries(G.flooded).filter(([, s]) => s >= 100 * R.rainFlood.floodedShare).map(([y]) => y);
      if (heavy && (wet || low || past.length)) { const pk = days.slice().sort((a, b) => (med(b.pr) || 0) - (med(a.pr) || 0))[0]; const best = [r3, rl].filter((x) => x && x.p >= on).sort((a, b) => b.p - a.p)[0];
        add('rainFlood', ['up to ' + R0(med(pk.pr)) + ' mm on ' + fmtDay(pk.date) + (hi(pk.pr) != null ? ' (wettest runs ' + R0(hi(pk.pr)) + ' mm)' : ''), best ? 'heavy 3-day rain in ' + best.p + ' % of forecast runs' : null,
          wet ? 'ground already ' + G.wetness.state : null, low ? (G.handLocalM != null && G.handLocalM < R.rainFlood.handLowM ? 'site sits ' + G.handLocalM + ' m above the nearest drain or stream' : 'site sits ' + G.handRiverM + ' m above the nearest river') : null,
          past.length ? 'this tehsil flooded in ' + past.join(', ') : null], best ? span(best.earliest, best.onset) : span(big[0].date, big[big.length - 1].date), best ? best.p : Math.max(...big.map((d) => d.p.pr25))); } }
    /* river running high */
    const notAssessed = [];   /* v91.17.161 · a pathway that could not be checked is named, never read as absent */
    /* v91.17.279 · CLAIMS279 S-11 · the trigger's own gate entry (site-risk-pathways.json riverHigh.gateEntry) must be able to alert: the river
       class ladder is experimental (its Watch+ steps failed their tests), so it does not switch this pathway on; the card says so */
    const rvGate = R.riverHigh.gateEntry && app.gate && app.gate.byId ? app.gate.byId(R.riverHigh.gateEntry) : null;
    if (R.riverHigh.gateEntry && !(rvGate && rvGate.resolved && rvGate.resolved.canAlert)) notAssessed.push({ id: 'riverHigh', why: 'river high: the river class forecast behind it is ' + ((rvGate && rvGate.product_type) || 'Indicative').toLowerCase() + ' and not tested well enough to switch a pathway on; use the measured gauge outlook where the gauge sheet is fresh' });
    else { const rv = nearestRiver(lat, lon, R.riverHigh.maxKm); if (rv && rv.stale) notAssessed.push({ id: 'riverHigh', why: 'river high: ' + rv.staleWhy + '; not assessed' }); const hot = rv ? rv.days.filter((d) => R.riverHigh.classes.includes(d.class)) : [];
      if (rv && hot.length && (G.handRiverM == null || G.handRiverM < R.riverHigh.maxHandM)) {
        add('riverHigh', [rv.river + ' at ' + rv.name + ' (' + rv.km + ' km): ' + hot[0].word + ' from ' + fmtDay(hot[0].date), G.handRiverM != null ? 'site ' + G.handRiverM + ' m above the river' : null], span(hot[0].date, hot[hot.length - 1].date), null); } }
    /* rain on snow */
    { const e = evp('rainOnSnow'); if (e && e.p >= on) add('rainOnSnow', ['rain on lying snow in ' + e.p + ' % of forecast runs', O.unit && O.unit.elevM ? 'settlement height ' + O.unit.elevM + ' m' : null], span(e.earliest, e.onset), e.p); }
    /* dust and wind */
    { let sm = null; try { sm = app.smog && app.smog.unit ? app.smog.unit(u.unitId) : null; } catch (_) {}
      const dd = sm && sm.days ? sm.days.filter((d) => d && d.dustClass != null && d.dustClass >= R.dustWind.dustClass) : [];
      const windy = new Map(days.filter((d) => (med(d.gu) != null && med(d.gu) >= R.dustWind.gustKmh) || (d.p && d.p.gu60 >= on)).map((d) => [d.date, d]));
      const both = dd.filter((d) => windy.has(d.date));
      if (both.length) { const w = windy.get(both[0].date);
        add('dustWind', ['dust ' + String(sm.dustClasses[both[0].dustClass]).toLowerCase() + ' on ' + fmtDay(both[0].date), 'gusts ' + R0(med(w.gu)) + ' km/h' + (w.p && w.p.gu60 ? ' (60 km/h in ' + w.p.gu60 + ' % of runs)' : '')], span(both[0].date, both[both.length - 1].date), w.p ? w.p.gu60 : null); } }

    /* v283.36 · NIGRAAN 1.0 · launch items 22 / 23 · NO PATHWAY SWITCH. Every switch-on cut of data/site-risk-pathways.json (feels-like
       40 C, hot nights 38 / 28 C, 30 % of runs at 25 mm, HAND under 2 / 5 m, 10 % flooded share, dust class and gust) is an untested
       screening convention: no pathway is switched on and no "none" is said. The plain facts are listed instead: the forecast values
       (members' median and wet / hot end), the ground (HAND m, past flooded shares) and the official river class nearby. */
    const facts = [];
    { const pkA = days.filter((d) => med(d.at) != null).sort((a, b) => med(b.at) - med(a.at))[0]; if (pkA) facts.push({ id: 'heat', text: 'highest feels-like ' + R0(med(pkA.at)) + ' °C on ' + fmtDay(pkA.date) + ' (air ' + R0(med(pkA.tx)) + ' °C)' }); }
    { const pkN = days.filter((d) => med(d.tn) != null).sort((a, b) => med(b.tn) - med(a.tn))[0]; if (pkN) facts.push({ id: 'nights', text: 'warmest night ' + R0(med(pkN.tn)) + ' °C on ' + fmtDay(pkN.date) }); }
    { const pk = days.filter((d) => med(d.pr) != null).sort((a, b) => (med(b.pr) || 0) - (med(a.pr) || 0))[0]; if (pk) facts.push({ id: 'rain', text: 'wettest day ' + R0(med(pk.pr)) + ' mm on ' + fmtDay(pk.date) + (hi(pk.pr) != null ? ' (wettest runs ' + R0(hi(pk.pr)) + ' mm)' : '') });
      const m3 = ev.max3dRain || (ev.rain3Amount ? [ev.rain3Amount.p10, ev.rain3Amount.p50, ev.rain3Amount.p90] : null); if (m3) facts.push({ id: 'rain3', text: 'wettest 3 days ' + R0(m3[1]) + ' mm (wet runs ' + R0(m3[2]) + ' mm)' }); }
    if (G.handLocalM != null) facts.push({ id: 'ground', text: 'site ' + G.handLocalM + ' m above the nearest drain or stream' }); if (G.handRiverM != null) facts.push({ id: 'ground', text: 'site ' + G.handRiverM + ' m above the nearest river' });
    { const pf = Object.entries(G.flooded || {}).filter(([, v]) => v > 0).map(([y, v]) => y + ' (' + v + ' % of the tehsil)'); if (pf.length) facts.push({ id: 'pastFloods', text: 'mapped flood extents: ' + pf.join(', ') }); }
    { const pkG = days.filter((d) => med(d.gu) != null).sort((a, b) => med(b.gu) - med(a.gu))[0]; if (pkG) facts.push({ id: 'gust', text: (O.unit && O.unit.elevM != null && O.unit.elevM >= 1500) ? 'gust not tested at this height' : 'strongest gust ' + R0(med(pkG.gu)) + ' km/h on ' + fmtDay(pkG.date) + (hi(pkG.gu) != null ? ' (strongest runs ' + R0(hi(pkG.gu)) + ' km/h)' : '') }); }
    return { ready: true, at: O.ensemble && O.ensemble.at, window: [days[0].date, days[days.length - 1].date], sector: sec,
      place: { unitId: u.unitId, name: u.name, district: u.district, province: u.province },
      active: [], facts, none: null, withheld: 'no site pathway is switched on in this release: the switch-on cuts are untested screening conventions; the values are listed', notAssessed, ground: G,
      note: 'Screening from the 15-day forecast ensemble at this tehsil and the terrain at the point. Chances are the share of forecast runs, not calibrated probabilities. '
        + (C.productType || 'Indicative') + ': the switch-on cuts are screening conventions, not tested against recorded site impacts; each pathway names its basis.',
      productType: C.productType || 'Indicative', productTypeWhy: C.productTypeWhy || null, ensembleAgeRule: ENS_AGE_RULE,
      source: 'data/site-risk-pathways.json' };
  }

  /* ── engineering screening values ── */
  const RLDIR = join(dataDir, 'cache', 'site-rl');
  const busy = new Map();
  async function returnLevels(lat, lon) {
    const clat = Math.round(lat * 4) / 4, clon = Math.round(lon * 4) / 4; const key = clat.toFixed(2) + '_' + clon.toFixed(2);
    const f = join(RLDIR, key + '.json'); if (existsSync(f)) { try { const v = JSON.parse(readFileSync(f, 'utf8')); delete v.rainMm; return v; } catch (_) {} }   /* v283.28 S6: a cell cached before keeps no rain level */
    if (busy.has(key)) return busy.get(key);
    const job = (async () => {
      if (!app.provider || !app.provider.configured()) return { ready: false, why: 'the paid forecast key is not configured on this server' };
      const body = await app.provider.call('archive', '/v1/archive', { latitude: clat, longitude: clon, start_date: '1940-01-01', end_date: '2025-12-31',
        daily: ['wind_gusts_10m_max', 'temperature_2m_max'], models: 'era5', timezone: 'Asia/Karachi' }, { timeoutMs: 180000 });
      const d = body && body.daily; if (!d || !d.time) return { ready: false, why: 'no reanalysis series returned' };
      const am = {}; const vars = { gust: 'wind_gusts_10m_max', tmax: 'temperature_2m_max' };
      for (const [k, v] of Object.entries(vars)) { const by = new Map(), cnt = new Map(); const col = d[v] || [];
        d.time.forEach((t, i) => { const y = t.slice(0, 4), x = col[i]; if (x == null) return; cnt.set(y, (cnt.get(y) || 0) + 1); if (!by.has(y) || x > by.get(y)) by.set(y, x); });
        am[k] = [...by.entries()].filter(([y]) => (cnt.get(y) || 0) >= 330).map(([, x]) => x); }
      const fit = (xs, Ts) => { const g = gumbelL(xs); return g ? { n: g.n, years: '1940-2025', levels: Object.fromEntries(Ts.map((T) => [T, R1(g.at(T))])), maxObserved: R1(Math.max(...xs)) } : null; };
      const out = { ready: true, cell: [clat, clon], cellElevM: body.elevation ?? null, built: new Date().toISOString(), method: 'Gumbel by L-moments on calendar-year maxima of the daily series (years with at least 330 days)',
        gustKmh: fit(am.gust, [10, 50]), tmaxC: fit(am.tmax, [10, 50]),   /* v283.28 S6: no reanalysis rain levels (rain-return-levels.json is their one home) */
        caveat: 'Reanalysis at about 30 km: it smooths short convective downpours, so the rain levels are a floor for a small catchment; gusts are not screened above 1,500 m, where the reanalysis over-reads mountain gusts.' };
      mkdirSync(RLDIR, { recursive: true }); writeFileSync(f, JSON.stringify(out)); return out; })();
    busy.set(key, job); try { return await job; } finally { busy.delete(key); }
  }
  /* v91.17.252 · A4 · the hottest day ahead on the UTCI scale. The ensemble carries air temperature but not humidity or wind, so a day's
     daily-max shade UTCI is the tehsil's 90th-percentile UTCI for the date plus the forecast's departure from its 90th-percentile Tmax (both
     on the forecast's own basis, climatology.thresholds), moved to the site height. At fixed vapour pressure and wind UTCI moves 0.9-1.2 °C
     per °C of air temperature over 25-45 °C (utci.mjs, checked 11 Oct 2026): a 5 °C departure carries at most ~1 °C. Level: utci.json
     agnMapping on the hazard-scale cuts, as the map. */
  function heatAhead(u, days, baseM, siteM, lapse) {   /* baseM: the height the members are served at */
    const mv = lapse != null && siteM != null && baseM != null ? lapse * (siteM - baseM) : 0; let pk = null;
    for (const d of days) { let th = null; try { th = app.climatology && app.climatology.thresholds ? app.climatology.thresholds(u.unitId, d.date) : null; } catch (_) {}
      const tx = hi(d.tx); if (!th || th.u90 == null || th.tx90 == null || tx == null) continue;
      const x = { date: d.date, txC: R1(tx + mv), utciC: R1(th.u90 + tx - th.tx90 + mv) }; if (!pk || x.utciC > pk.utciC) pk = x; }
    /* v91.17.283.3 · audit C2 · humidity and wind are not in the 15-day runs, so this is a temperature-only estimate: no UTCI class is
       given and the level is marked approximate (at 45 C the real UTCI spans about 45-53 C between 10 % and 50 % humidity) */
    return pk && { ...pk, level: levelOfScore(utciAgnScore(pk.utciC)), utciClass: null, approximate: true, basisNote: 'temperature-only estimate (humidity and wind are not in the 15-day runs)' };
  }

  async function screening(lat, lon, floorM = null) {
    const u = unitOf(lat, lon); if (!u) return { ready: false, why: 'no tehsil at this point' };   /* v91.17.162 · audit A-2 */
    const G = ground(lat, lon, u.unitId);
    const F = outlookOf(u), days = F.days, fresh = !F.why;
    /* the day with the highest value in the upper tenth (p90) of the 51 runs */
    const peak = (k) => days.reduce((b, d) => { const x = hi(d[k]); return x != null && (!b || x > b.v) ? { v: x, date: d.date } : b; }, null);
    /* a 15-day row's level, or the input it lacks */
    const judged = (p, level, missing) => !fresh ? { verdict: null, state: need('a current 15-day forecast (' + F.why + ')') } : p == null ? { verdict: null, state: need(missing) }
      : (level(p) ? { verdict: level(p) } : { verdict: null, state: need('the level scale (data/hazard-scale.json)') });
    let RL = null; try { RL = await returnLevels(lat, lon); } catch (e) { RL = { ready: false, why: String(e && e.message || e).replace(/apikey=[^&\s]+/g, 'apikey=***') }; }
    const rlWhy = (what) => need('the long ' + what + ' record at this point (' + ((RL && RL.why) ? clientWhy(RL.why) : 'not fetched yet') + ')');
    const rows = [];
    /* rain: High at the 2-year day (the median annual maximum), Severe at the 10-year day (FHWA HEC-22, 2009, Table 3-1: design frequency of main-road drainage) */
    /* v91.17.283.28 · S6 · the extreme daily rain levels come from their ONE home, data/rain-return-levels.json (the tehsil's 24-hour return
       levels: the satellite-rain GEV, point level where its gauge factor passed), not from the 30 km reanalysis Gumbel fit (removed). The
       level rule is unchanged: High at the 2-year day, Severe at the 10-year day (FHWA HEC-22, 2009, Table 3-1) */
    { const RR = json('rain-return-levels.json'), T = RR && RR.returnPeriods, U = RR && RR.units && RR.units[u.unitId], E = U && U.assessed !== false ? U['24h'] : null;
      const pt = !!(E && Array.isArray(E.pointRl)), lv = E ? (pt ? E.pointRl : E.areaRl) : null, at = (y) => (Array.isArray(T) && lv ? lv[T.indexOf(y)] ?? null : null);
      const L2 = at(2), L10 = at(10), L25 = at(25), p = peak('pr');
      if (L2 != null && L10 != null) rows.push({ parameter: 'Extreme daily rain', values: '2-year ' + L2 + ' mm · 10-year ' + L10 + ' mm' + (L25 != null ? ' · 25-year ' + L25 + ' mm' : ''), forecast: p ? 'wettest day ' + fmtDay(p.date) + ': ' + R0(p.v) + ' mm in the wettest tenth of forecast runs' : null,
        ...judged(p, (x) => rlLevel(x.v, L2, L10), 'the rain forecast for ' + u.name), mark: fresh && p ? (p.v >= L10 ? '10-year day' : p.v >= L2 ? '2-year day' : null) : null, scale: pt ? 'point' : 'area', source: 'data/rain-return-levels.json (tehsil ' + u.name + ', 24 hours)',
        meaning: 'High at the 2-year day (an ordinary year\'s wettest day), Severe at the 10-year day. The levels are the tehsil\'s 24-hour return levels from 25 years of satellite rain' + (pt ? ' at the point (station) scale' : ' (area rain, about 10 km: not a point level)') + '; drainage design uses the local rainfall intensity-duration-frequency (IDF) curve and the design standard.' });
      else rows.push({ parameter: 'Extreme daily rain', values: null, verdict: null, state: need('the 24-hour rain return levels of ' + u.name + ' (' + (!RR ? 'data/rain-return-levels.json is not in this install' : (U && U.why) || 'none for this tehsil') + ')'), meaning: 'The 2- and 10-year daily rain come from the tehsil\'s rain return levels, which are not available here.' }); }
    /* gust: High at the 10-year gust (ASCE 7-10 Commentary Appendix CC: serviceability wind), Severe at the 50-year gust (ASCE 7-05 6.5.4: basic
       wind speed); not above 1,500 m, where the reanalysis over-reads mountain gusts (the outlook's gust screen stops there too) */
    const elev = G.elevM != null ? G.elevM : u.elevM;
    if (elev != null && elev > 1500) rows.push({ parameter: 'Wind gust', values: null, verdict: null, state: need('the site\'s wind exposure (mountain site above 1,500 m)'), meaning: 'In the mountains the long record over-reads gusts and exposure decides them: a site anemometer or a wind study sets the value.' });
    else if (RL && RL.ready && RL.gustKmh) { const L = RL.gustKmh.levels, p = peak('gu');
      rows.push({ parameter: 'Wind gust', values: '10-year ' + R0(L[10]) + ' km/h · 50-year ' + R0(L[50]) + ' km/h', forecast: p ? 'strongest gust ' + fmtDay(p.date) + ': ' + R0(p.v) + ' km/h in the windiest tenth of forecast runs' : null,
        ...judged(p, (x) => rlLevel(x.v, L[10], L[50]), 'the gust forecast for ' + u.name), mark: fresh && p ? (p.v >= L[50] ? '50-year gust' : p.v >= L[10] ? '10-year gust' : null) : null, meaning: 'High at the 10-year gust, Severe at the 50-year gust. Screening only: a structural design wind comes from the building code with site exposure.' }); }
    else rows.push({ parameter: 'Wind gust', values: null, verdict: null, state: rlWhy('gust'), meaning: 'The 10- and 50-year gust need the long daily gust record at this point, which is not available yet.' });
    /* heat: v91.17.162 · audit A-6 printed nothing where the long-record cell sat over 200 m from the site, so Islamabad (cell 1018 m, site
       527 m) fell to "Site study". v91.17.252 · A4 · the cell's 10/50-year hottest day is moved to the site height at the standard lapse
       (Islamabad +3.2 °C); past the gap of the lapse test its measured daytime residual is printed with it. The level is UTCI's (heatAhead). */
    { const lapse = lapseCperM(), L = RL && RL.ready && RL.tmaxC ? RL.tmaxC.levels : null, cE = RL && RL.ready && Number.isFinite(RL.cellElevM) ? RL.cellElevM : null;
      const mv0 = L && lapse != null && cE != null && elev != null ? lapse * (elev - cE) : null, T = lapseTest(), far = mv0 != null && T && Math.abs(elev - cE) > T.dzM;
      /* v91.17.255 · C-29 · THE HOTTEST DAY CHECKED AGAINST STATIONS (CEO 12 Oct, HISAAB review checked on NIGRAAN): at 37 ISD stations
         (2017-2024) the printed value read 1.1 C low above 1,300 m (Drosh and Chitral 3.5-3.9 C low at the 2-year level), 1.2 C low at
         500-1,300 m and 1.8 C high within 60 km of the sea (2-year: 3.3 C high), and was right on the plains. data/heat-rl-check.json holds
         the station table; the group offset is applied where it lowered the error at held-out stations, and nowhere else. */
      const HC = json('heat-rl-check.json'), HCc = HC && HC.correction;
      let hcG = null, hcOff = 0; if (HCc && mv0 != null && elev != null) { let ck = null; try { ck = fg.value('f_coast_km', lat, lon); } catch (_) { ck = null; }
        hcG = (ck != null && ck <= HCc.coastKm) ? 'coast' : elev > HCc.mountainAboveM ? 'mountain' : elev >= HCc.midFromM ? 'mid' : null; hcOff = hcG ? (HCc.offsetC[hcG] || 0) : 0; }
      const mv = mv0 == null ? null : mv0 + hcOff;
      const B = F.O && F.O.ensemble && F.O.ensemble.basis, h = fresh ? heatAhead(u, days, B && B.elevM != null ? B.elevM : u.elevM, elev, lapse) : null, t10 = mv != null ? L[10] + mv : null, t50 = mv != null ? L[50] + mv : null;
      /* v91.17.283.52 D · #106/#110/#116 · THE STATION-CHECKED VALUE, SAID SO: the nearest checked station of data/heat-rl-check.json within the
         long-record cell (about 28 km, the Methods text) and the lapse test's height gap (T.dzM) is named with its own record, so the reader sees
         the station figure beside the grid-cell value (Lahore City 2017-2024: highest 45.0 C beside 48.1 C) */
      let near = null; if (HC && Array.isArray(HC.stations) && lat != null && lon != null && elev != null) { const dzMax = T && T.dzM ? T.dzM : null;
        for (const st of HC.stations) { const km = kmTo(lat, lon, st.lat, st.lon); if (km > 28 || (dzMax != null && Math.abs((st.elevM ?? 0) - elev) > dzMax)) continue; if (!near || km < near.km) near = { ...st, km }; } }
      const stName = (n) => String(n || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bIntl\b/, 'airport').replace(/\bAb\b/, 'air base');
      const checkTxt = near ? 'station check: ' + stName(near.name) + ', hottest day of 2017-2024 ' + R1(near.stationMaxC) + ' °C (typical yearly hottest ' + R1(near.stationMedianC) + ' °C' + (near.years && near.years < 8 ? ', ' + near.years + ' years with a record' : '') + ')'
        : hcOff ? 'station-checked: ' + (hcOff > 0 ? '+' : '') + hcOff + ' °C from ' + HC.groups[hcG].n + ' station records at this height' : HC ? 'no checked station record within reach (the grid-cell value is printed)' : null;
      rows.push({ parameter: 'Extreme heat', values: mv != null ? '10-year hottest day ' + R1(L[10] + mv) + ' °C · 50-year ' + R1(L[50] + mv) + ' °C (air, at the site height ' + R0(elev) + ' m' + (checkTxt ? '; ' + checkTxt : '') + ')' : null,
        valuesWhy: mv != null ? null : L ? need('the height of the long-record cell or of the site') : rlWhy('temperature'),
        forecast: h ? 'hottest day ' + fmtDay(h.date) + ': air ' + R0(h.txC) + ' °C in the hottest tenth of forecast runs, temperature-only UTCI estimate about ' + R0(h.utciC) + ' °C in shade (approximate: humidity and wind not included)' + (t10 == null ? '' : h.txC >= t10 ? '; reaches the 10-year hottest day' : '; below the 10-year hottest day') : null,
        /* v91.17.283.52 D · N16 (Gilgit "Now: Low" while every heat day of the place is Normal; Sheikhupura Low at 30 C beside a 48.5 C
           10-year day): this is a RARE-EVENT row, and its level was the UTCI level of a temperature-only estimate (the tehsil's 90th-percentile
           UTCI for the date moved by the forecast air temperature), i.e. an ordinary-day heat-stress word that disagreed with the served
           UTCI levels. The level is now the rare-event ladder of the gust row, on the same return levels the row prints: Watch (High) at
           the 10-year hottest day, Act (Severe) at the 50-year day, none below; the daily heat-stress level stays the served one. */
        ...(mv != null ? judged(h, (x) => rlLevel(x.txC, t10, t50), 'the heat-stress climate of ' + u.name + ' (data/utci-climatology.json, data/climatology.json)') : { verdict: null, state: need('the 10- and 50-year hottest day at this point') }),
        stationRecord: near ? { name: stName(near.name), km: Math.round(near.km * 10) / 10, elevM: near.elevM, years: near.years, maxC: near.stationMaxC, medianC: near.stationMedianC, nigraan10C: near.nigraan10C, bias10C: near.bias10C, source: 'data/heat-rl-check.json' } : null,
        utciC: h ? h.utciC : null, utciClass: null, ...(h ? { approximate: true, basisNote: h.basisNote } : {}), cellElevM: R0(cE), siteElevM: R0(elev), lapseMoveC: R1(mv0), stationCheck: hcG ? { group: hcG, offsetC: hcOff, source: 'data/heat-rl-check.json' } : null,
        meaning: 'Approximate level: a temperature-only estimate of shade UTCI (this tehsil\'s heat-stress climate moved by the forecast air temperature; humidity and wind are not in the 15-day runs), placed on the UTCI level cuts. It is not the map\'s UTCI and carries no UTCI class.'
          + (mv0 != null ? ' The 10/50-year hottest day is the long-record cell (' + R0(cE) + ' m) moved to the site (' + R0(elev) + ' m) at the standard 6.5 °C per km (' + (mv0 >= 0 ? '+' : '') + R1(mv0) + ' °C).' : '')
          + (hcOff ? ' Checked against station records (' + HC.groups[hcG].n + ' ISD stations ' + (hcG === 'coast' ? 'within ' + HCc.coastKm + ' km of the sea' : hcG === 'mountain' ? 'above ' + HCc.mountainAboveM + ' m' : 'at ' + HCc.midFromM + '-' + HCc.mountainAboveM + ' m') + ', 2017-2024) it read ' + Math.abs(HC.groups[hcG].bias10C) + ' °C ' + (HC.groups[hcG].bias10C > 0 ? 'high' : 'low') + ', so ' + (hcOff > 0 ? '+' : '') + hcOff + ' °C is applied (error at held-out stations ' + HC.groups[hcG].maeRawC + ' -> ' + HC.groups[hcG].maeCorrectedLooC + ' °C).' : '')
          + (far ? ' Tested at stations more than ' + T.dzM + ' m from their grid height, a value moved this way read ' + Math.abs(T.biasC) + ' °C ' + (T.biasC < 0 ? 'cold' : 'warm') + ' by day on average (mean error ' + T.maeC + ' °C), so read them as a ' + (T.biasC < 0 ? 'floor' : 'ceiling') + '.' : '')
          + ' Equipment ratings come from station records and the design basis.' }); }
    /* flood position */
    /* v91.17.253 · W3 · W3-6 · the typed HAND cuts 2/5/10 m (and the exposed/low/raised word from them) are gone: the site's height is placed in a
       class fitted to the mapped floods and the row states how much of such ground was under water in each. A share given a major flood is not a
       chance per year and no tested rule places it on the level scale (hand-calibration.json levels.why), so it is a standing fact, no level. */
    { const RC = G.handRiverClass, LC = G.handLocalClass, bits = [];
      if (G.handRiverM != null) bits.push(G.handRiverM + ' m above the nearest river' + (RC ? ' (' + RC.text + ')' : ''));
      if (G.handLocalM != null) bits.push(G.handLocalM + ' m above the nearest drain or stream' + (LC ? ' (' + LC.text + ')' : ''));
      const fl = Object.entries(G.flooded).filter(([, s]) => s > 0).map(([y, s]) => y + ' (' + s + ' % of the tehsil)');
      rows.push({ parameter: 'Flood position', values: RC ? bits.join(' · ') : null, history: fl.length ? 'mapped flooding in ' + fl.join(', ') + ' (any share of the tehsil)' : 'no mapped flooding in this tehsil in 2010, 2022 or 2025',
        verdict: null, state: G.handRiverM == null ? need('the height of the site above the nearest river (terrain grid)') : !RC ? need('the calibration of river height against mapped floods') : STANDING,
        handRiverClass: RC, handLocalClass: LC,
        meaning: 'Height of the site above the nearest river or drain, and how much of the ground at that height the mapped floods of 2010, 2014, 2022 and 2025 covered (river channels and water bodies left out). A flood level or depth for design needs a hydraulic study of the site.' }); }
    /* v91.17.207 · phase B · RIVER FLOOD DEPTH AT THE ASSET: the depth of an undefended river flood of 1 in 10 ... 500 years at the asset's own
       90 m cell (JRC / Copernicus GloFAS maps v2.1.2, flooddepth.mjs) and, with the floor height, from which return period water reaches the
       floor. Tested against the mapped 2010 and 2022 extents (data/flood-depth/index.json check): it separates flooded from dry ground better
       than the height above the river alone (AUC 0.83 vs 0.77 in 2010), so the site's standing flood flag comes from it where it is installed.
       exposed: water reaches the floor (the ground when no floor height is recorded) in a 1-in-100 flood or more often; low: wet in a rarer
       mapped flood, or a 1-in-100 flood within about 270 m; raised: dry in every mapped flood. Standing, not a 15-day verdict. */
    try { const FD = app.floodDepth && app.floodDepth.at(lat, lon, floorM);
      if (FD && FD.ready) { const R = FD.rows, i100 = R.findIndex((r) => r.returnPeriod === 100), lvl = floorM == null ? 0 : floorM;
        const reach100 = R.some((r, i) => i <= i100 && r.depthM > lvl), wetAny = R.some((r) => r.depthM > 0), near100 = R.some((r, i) => i <= i100 && r.within270mM > 0);
        /* v91.17.255 · C-27 · A DRY CELL IS NOT A RAISED SITE BY ITSELF (HISAAB review checked on NIGRAAN, 12 Oct: Nowshera, Sialkot, Jacobabad
           and Lahore all read "raised site" from this row alone). The map misses about a fifth of the ground the 2010 flood covered in the
           Indus plains (hit rate 0.79 at 1-in-100, data/flood-depth/index.json check) and draws no small streams. Where it is dry, the
           site is called raised only when the ground at its height above the nearest river AND above the nearest drain was flooded less
           often than the plains as a whole in 2010 (the share of all checked plains ground under water, the same check's base rate);
           otherwise it is a low site outside the river map, and the row says so. Both numbers are measured; no cut is typed here. */
        const base10 = FD.check && FD.check.baseRate2010 != null ? FD.check.baseRate2010 : null;
        const cls10 = (c) => { const f = c && c.flooded && c.flooded.find((x) => x.year === '2010'); return f ? f.pct / 100 : null; };
        const gR = G.handRiverClass, gL = G.handLocalClass, sR = cls10(gR), sL = cls10(gL);
        const lowGround = !wetAny && !near100 && base10 != null && ((sR != null && sR > base10) || (sL != null && sL > base10));
        const standing = reach100 ? 'exposed site' : (wetAny || near100) ? 'low site' : lowGround ? 'low site (outside the river map)' : (base10 == null || (sR == null && sL == null)) ? 'not judged (no height class)' : 'raised site';
        const show = R.filter((r) => [10, 25, 50, 100, 500].includes(r.returnPeriod) || r.returnPeriod === 20);
        const allDry = !wetAny, nw = FD.nearestWet;
        const nearRp = (R.find((r) => r.within270mM > 0) || {}).returnPeriod;
        const valTxt = allDry && !near100 ? 'dry at this 90 m cell from 1-in-10 to 1-in-500' + (nearRp ? ' · wet within about 270 m from the 1-in-' + nearRp + ' flood' : nw ? ' · nearest mapped wet ground ' + nw.km + ' km away (from 1-in-' + nw.firstWetReturnPeriod + ')' : ' · no mapped wet ground within 3 km')
          : show.map((r) => '1-in-' + r.returnPeriod + ' ' + (r.depthM > 0 ? r.depthM + ' m' : 'dry')).join(' · ');
        const lowWhy = lowGround ? ' Outside the river map here, but not raised: ' + [sR != null && sR > base10 ? Math.round(sR * 1000) / 10 + ' % of ground at this height above a river' : null, sL != null && sL > base10 ? Math.round(sL * 1000) / 10 + ' % of ground at this height above a drain or stream' : null].filter(Boolean).join(' and ') + ' was under water in 2010, against ' + Math.round(base10 * 1000) / 10 + ' % of the plains as a whole. Read the flood position and flood-prone rows for this site.' : '';
        rows.push({ parameter: 'River flood depth (undefended)', values: valTxt + (floorM == null ? ' · floor height not recorded' : ' · floor ' + floorM + ' m above ground'),
          history: FD.summary, verdict: null, state: STANDING, standing, depthByReturnPeriod: R, floorM: FD.floorM, floorReachedFrom: FD.floorReachedFrom,
          nearestWet: nw || null, meaning: 'Water depth of an undefended river flood at the asset\'s ~90 m cell (global river-flood maps). ' + FD.limits + lowWhy });
        /* one flood standing per site: the tested depth row sets it; the height-above-river row stays as the terrain fact beside it */
        const hp = rows.find((r) => r.parameter === 'Flood position'); if (hp) hp.meaning += ' The site\'s flood standing comes from the river flood depth row.'; } } catch (_) {}
    /* v91.17.151 · flood-prone ground: the standing chance that a monsoon season leaves mapped standing water on >= 1 % of this tehsil,
       from its ground alone (data/flood-susceptibility.json; each season of 2010/2014/2022/2025 held out in turn, AUC 0.80 since v91.17.153, river distance added and river channels removed from the labels). Standing
       susceptibility, not a forecast, so it carries no verdict. */
    try { const FS = JSON.parse(readFileSync(join(dataDir, 'flood-susceptibility.json'), 'utf8')); const r0 = u && FS.units && FS.units[u.unitId];
      if (r0) rows.push({ parameter: 'Flood-prone ground (standing)', values: Math.round(100 * r0.p) + ' % chance a monsoon season floods at least 1 % of the tehsil · flooding over at least 1 % of the tehsil in ' + r0.mappedSeasons + ' of ' + r0.of + ' seasons (2010, 2014, 2022, 2025)', verdict: null, state: STANDING,
        meaning: 'From low ground near rivers and drains, flat converging land, soil and built-up cover; tested with each season held out (AUC ' + FS.test.auc + '). Not a forecast; the day\'s flood level is in the hazard table.' }); } catch (_) {}
    /* v91.17.255 · C-28 · LANDSLIDE GROUND AT THE SITE (CEO 12 Oct, HISAAB review checked on NIGRAAN: the site checklist had no landslide
       row; valley towns sit on flat ground and the slopes that fail are above them). Two standing facts, no level: the tehsil's class on the
       tested 30 m susceptibility model (data/landslide-susceptibility30.json, the same class the daily landslide level uses), and the
       steepest ground ABOVE the site within 2 km (the feature grid's slope and height, sampled every 250 m on rings of 0.25-2 km in 16
       directions; a cell counts only if it stands higher than the site, i.e. ground that can shed onto it). No tested rule turns either
       into a Normal...Severe level at a point, so the row carries none. */
    try { const SU = app.terrain && app.terrain.susceptibility && u ? app.terrain.susceptibility(u.unitId) : null;
      const v = (b, la, lo) => { try { return fg.value(b, la, lo); } catch (_) { return null; } };
      const e0 = v('t_elev', lat, lon); let best = null;
      if (e0 != null) for (let rk = 0.25; rk <= 2.001; rk += 0.25) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, la = lat + rk * Math.cos(a) / 111.2, lo = lon + rk * Math.sin(a) / (111.2 * Math.cos(lat * Math.PI / 180));
        const sl = v('t_slope', la, lo), el = v('t_elev', la, lo); if (sl == null || el == null || el <= e0 + 10) continue;
        if (!best || sl > best.slope) best = { slope: R1(sl), km: R1(rk), riseM: R0(el - e0), dir: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][k] }; }
      const sl0 = R1(v('t_slope', lat, lon)); const bits = [];
      if (SU && SU.ready && SU.class != null) bits.push('tehsil class ' + SU.class + ' of 5 (' + SU.label + ') on the tested 30 m model');
      if (sl0 != null) bits.push('slope at the site ' + sl0 + '°');
      if (best) bits.push('steepest ground above the site within 2 km: ' + best.slope + '° (' + best.riseM + ' m higher, ' + best.km + ' km ' + best.dir + ')');
      else if (e0 != null) bits.push('no ground above the site within 2 km');
      if (bits.length) rows.push({ parameter: 'Landslide ground (standing)', values: bits.join(' · '), verdict: null, state: STANDING, tehsilClass: SU && SU.class != null ? { class: SU.class, label: SU.label, served: SU.served, auc: SU.auc } : null, slopeAtSiteDeg: sl0, steepestAbove: best,
        meaning: 'Where ground fails is the slope above a site, not the flat floor it stands on. The tehsil class is the one the daily landslide level uses (tested against mapped landslides); the steepest ground above the site is a terrain fact from about 250 m cells. A slope stability study sets a design value.' }); } catch (_) {}
    /* v91.17.153 · who lives here: the 2023 census for the tehsil (data/census-tehsil.json, PBS district tables matched to the 577 tehsils).
       Facts that change how hard a hazard lands (the old and the very young in heat, kacha houses in floods and heavy rain, homes without
       grid power when heat or a storm cuts supply). No vulnerability score is made from them: no Pakistani outcome record tests one. */
    try { const CT = JSON.parse(readFileSync(join(dataDir, 'census-tehsil.json'), 'utf8')); const c = u && CT.units && CT.units[u.unitId];
      if (c) { const pc = (x) => x == null ? null : (100 * x).toFixed(1) + ' %'; const v = [];
        if (c.pop2023 != null) v.push(Math.round(c.pop2023).toLocaleString('en-US') + ' people (' + (c.areaKm2 ? Math.round(c.pop2023 / c.areaKm2) + ' per km²' : 'area not given') + ')');
        if (c.age65Share != null) v.push(pc(c.age65Share) + ' aged 65+'); if (c.under5Share != null) v.push(pc(c.under5Share) + ' under 5');
        if (c.kachaShare != null) v.push(pc(c.kachaShare) + ' of homes kacha' + (c.semiPakkaShare != null ? ', ' + pc(c.semiPakkaShare) + ' semi-pakka' : ''));
        if (c.noGridLightingShare != null) v.push(pc(c.noGridLightingShare) + ' of homes without grid electricity for lighting');
        if (c.disabilityShare != null) v.push(pc(c.disabilityShare) + ' with a disability');
        if (v.length) rows.push({ parameter: 'People and housing (census 2023)', values: v.join(' · '), verdict: null, state: REFERENCE,
          meaning: (c.match === 'districtShareOnly' ? 'District figures (the census does not report this tehsil on its own). ' : c.match === 'subdiv' ? 'Figures for the census sub-division that contains this tehsil. ' : '') + 'Who is most affected when a hazard arrives: older people and young children in heat, kacha homes in floods and heavy rain, homes off the grid when power fails. Context, not a score.' }); } } catch (_) {}
    /* v91.17.152 · standing flood water OBSERVED by satellite over the last three days (server/api/floodobs.mjs). In 2022 the water stayed
       for weeks after the rain stopped; this row reports what is on the ground now. The share not seen (cloud) is always given. */
    try { const fo = app.floodobs && u ? app.floodobs.unit(u.unitId) : null;
      if (fo && fo.ok) { const pct = (x) => x == null ? null : (x >= 0.001 ? (100 * x).toFixed(1) : (x > 0 ? '<0.1' : '0')) + ' %';
        rows.push({ parameter: 'Flood water seen by satellite (' + fo.window.start + ' to ' + fo.window.end + ')',
          values: fo.seenShare != null && fo.seenShare < 0.05 ? 'not seen: cloud or masked ground over ' + pct(1 - fo.seenShare) + ' of the tehsil'
            : 'unusual flood water on ' + pct(fo.floodShareOfSeen) + ' of the ground seen (about ' + fo.floodKm2 + ' km²) · seasonal recurring flood ' + pct(fo.recurringShareOfSeen) + ' · ' + pct(fo.seenShare) + ' of the tehsil seen' + (fo.stale ? ' · map ' + Math.round(fo.ageDays) + ' days old' : ''),
          verdict: null, state: fo.seenShare != null && fo.seenShare < 0.05 ? need('a satellite view of the ground (cloud or masked over ' + pct(1 - fo.seenShare) + ')') : 'Observed now (not a forecast)',
          meaning: '250 m satellite flood map, three-day composite. Small channels, streets and fields under 250 m are missed, and cloud hides water, so "none seen" is not "none". An observation, not a forecast.' }); } } catch (_) {}
    /* v91.17.98 · seismic: the code values at the site's coordinates (server/api/seismic.mjs) */
    { let sz = null; try { sz = app.seismic ? app.seismic.point(lat, lon, null, null) : null; } catch (_) { sz = null; }
      if (sz && sz.ok) { const b7 = sz.bcp2007, b = sz.bcp2021 || {};
        const v = []; if (b7) v.push('BCP 2007 legacy zone ' + b7.zone + ' (PGA ' + b7.pga + ')');
        if (b.ssBand) v.push('BCP 2021 Ss ' + (b.ss_g != null ? b.ss_g.toFixed(2) + ' g' : b.ssBand + ' g') + ', S1 ' + (b.s1_g != null ? b.s1_g.toFixed(2) + ' g' : b.s1Band + ' g'));
        if (b.seismic_design_category) v.push('Seismic Design Category ' + b.seismic_design_category + ' (Site Class ' + b.siteClass + (b.siteClassAssumed ? ' assumed' : '') + ', Risk Category ' + b.riskCategory + (b.riskCategoryAssumed ? ' assumed' : '') + '; SDS ' + b.sds_g + ' g, SD1 ' + b.sd1_g + ' g)');
        rows.push({ parameter: 'Seismic design values', values: v.join(' · ') || null, verdict: null, state: b.siteClassAssumed ? need('the site class from a site investigation (Site Class ' + b.siteClass + ' assumed)') : REFERENCE,
          meaning: 'Code look-up at the site: Building Code of Pakistan 2021 Section 1613.2.1 maps (Ss, S1) and the legacy BCP SP-2007 zone. The site class needs a site investigation; the engineer of record sets the design values.',
          notes: b.notes || [] }); }
      else rows.push({ parameter: 'Seismic design values', values: null, verdict: null, state: need('the seismic code maps at this point (' + ((sz && sz.why) || 'not served') + ')'), meaning: 'Building Code of Pakistan 2021 Section 1613.2.1 maps (Ss, S1) and the legacy BCP SP-2007 zone, looked up at the site.' }); }
    /* v91.17.283.49 · 1.0.10 item 3 · THE GROUND AT THE SITE ITSELF: the 250 m runoff class of the site's own cell (data/sponge-250m.bin, the
       grid the map's class tiles draw) and the GHSL built-up share of its 270 m cell (data/urban.f16, the town-cell grid). The tehsil's
       retention class stays the AREA value (the levels table); this row is the site's. A fact, no level. */
    try { SPT = SPT || createSpongeTiles(dataDir); const sp = SPT.classAt(lat, lon); let ub = null; try { ub = app.urbanHeat && app.urbanHeat.cellAt ? app.urbanHeat.cellAt(lat, lon, 0) : null; } catch (_) { ub = null; }
      const bf = ub && Number.isFinite(ub.builtFraction) ? Math.round(ub.builtFraction * 100) : null;
      rows.push({ parameter: 'Ground at the site (250 m cell)', verdict: null, state: REFERENCE, reference: true, site: true,
        values: (sp.ok ? 'Runoff retention: ' + sp.word : 'Runoff retention: ' + sp.why) + ' · ' + (bf != null ? 'built-up ' + bf + ' % of the cell (satellite built-surface map, 2025)' : 'no built-up surface mapped in this cell (under 5 %)'),
        groundClass: sp.ok ? { cls: sp.cls, word: sp.word, cellM: sp.cellM } : null, builtUpPct: bf,
        meaning: 'The site\'s own cell: the runoff class from measured cover, soil group and slope (curve numbers, a screening index with no tested threshold) and the built-up share of the GHSL built surface. The tehsil\'s class in the levels table is the area value.' }); } catch (_) {}
    /* v91.17.216 · the nearest mapped active fault (GEM Global Active Faults, NIGRAAN's own copy data/gem-active-faults-pk.json): a reference fact, no standing */
    try { const nf = app.faults ? app.faults.nearest(lat, lon) : null;
      if (nf && nf.ok) { const n = nf.nearest;
        rows.push({ parameter: 'Nearest active fault', verdict: null, state: REFERENCE, standing: null, reference: true,
          values: n ? (n.distanceKm + ' km' + (n.name ? ' · ' + n.name : '') + ' · ' + (n.kind === 'mapped active fault' ? (n.slipType ? n.slipType.toLowerCase() + ' fault' : 'active fault') : n.kind)
            + (n.slipRateMmYr && n.slipRateMmYr[0] != null ? ' · slip ' + n.slipRateMmYr[0] + ' mm/yr' : '') + ' · ' + nf.faultsWithinKm[50] + ' mapped within 50 km') : nf.note,
          nearestFault: n, credit: nf.credit, meaning: nf.meaning }); } } catch (_) {}
    /* v91.17.101 · audit #98-#105 · the same served products the map paints, at the site's tehsil */
    if (u) {
      try { const rc = app.rainChance && app.rainChance.unit(u.unitId); if (rc && rc.ready) {   /* v91.17.147 · audit hazard F5 · a withheld chance is missing, not 0 % */
        /* v91.17.159 · audit UI-30: a withheld chance is said in words, and 'calibrated' only heads a row that carries a calibrated value */
        const anyRc = rc.days.slice(0, 3).some(d => d.p && ['1', '10', '25'].some(k => d.p[k] != null));
        const pc = (v) => v == null ? 'withheld' : v + ' %';
        rows.push({ parameter: anyRc ? 'Rain chance (next days, calibrated)' : 'Rain chance (next days)', values: anyRc ? rc.days.slice(0, 3).map(d => d.date + ': rain day ' + pc(d.p['1']) + ', 10 mm+ ' + pc(d.p['10']) + ', 25 mm+ ' + pc(d.p['25'])).join(' · ') : 'not available for these dates (the model needs the next day\'s forecast total)',
          /* v91.17.252 · A4 · the 50 % cut had no source: a chance becomes a level only against the chance at which the site acts, the client's
             operating trigger (engineering-references.json drainage_capacity: no design storm is issued, the client registers the limit) */
          verdict: null, state: anyRc ? need('the chance at which this site acts (a client trigger on the limit register)') : need('the next day\'s forecast total for the calibrated chance'), meaning: 'Chance of a satellite-measured day total at or above the amount for this tehsil, calibrated on 2024-25 and tested on 2026.' }); } } catch (_) {}
      try { const D = app.climatology && app.climatology.droughtNational && app.climatology.droughtNational(); const t = D && D.ready && D.spi && D.spi[u.unitId]; if (t && t.drought) {
        /* v91.17.252 · A4 · the level is the map's: the drought score on the hazard-scale cuts (the class word Monitor / Watch / Act is the engine's, not the customer's) */
        /* v91.17.283.49 · 1.0.10 data item 2 · the level was levelOfScore(t.drought.score); the class has carried no score since v283.36, so every
           tehsil read "Drought index not defined (arid climate)". The row now shows the MAP'S drought cell (app.hazSci.droughtAt: CHIRPS SPI-3 of the
           month on the USDM bounds; the arid, provisional and overdue states of the map) and names the index it shows (SPI-3, not SPI-90). */
        const c = t.drought.class, HS = json('hazard-scale.json'), nd = (HS && HS.separateStates && HS.separateStates.indexNotDefined) || 'Drought index not defined (arid climate)';
        const dc = app.hazSci && app.hazSci.droughtAt ? app.hazSci.droughtAt(u.unitId) : null;
        const LV = (HS && HS.levels) || ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
        const lv = dc && dc.L >= 0 ? LV[dc.L] || null : null;
        const st = !dc ? need('the drought layer of the map (hazard science not loaded)') : dc.L >= 0 ? null : dc.L === -2 ? nd : (dc.why || 'not assessed');
        const spi = dc && dc.facts && dc.facts.spi3 != null ? dc.facts.spi3 : null;
        rows.push({ parameter: 'Drought (last 30-90 days)', values: (lv || st) + (spi != null ? ' · SPI-3 ' + spi : '') + (dc && dc.mm != null ? ' · ' + dc.mm + ' mm in ' + (dc.month ? 'the 3 months to ' + (/^\d{4}-\d{2}$/.test(String(dc.month)) ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+String(dc.month).slice(5) - 1] + ' ' + String(dc.month).slice(0, 4) : dc.month) : '3 months') + (dc.climMm != null ? ' (normal ' + dc.climMm + ' mm)' : '') + lagWhy(dc.month) : ''),
          observed: true, basis: 'observed',   /* v91.17.283.2 · computed from the observed index, not a forecast */
          droughtState: dc ? dc.L : null,
          verdict: lv, state: lv ? null : st, meaning: 'Observed: computed from the observed drought index, not a forecast. ' + (t.drought.provisional ? 'Provisional: a high valley where no rain record was verified against gauges. ' : '') + 'Rain from ' + (/CHIRPS/.test(t.rainSource || '') ? 'the satellite-and-gauge rainfall record' : 'reanalysis rain') + ' (SPI-3 of the latest calendar month on the US Drought Monitor categories, the map\'s rule); a water-supply or crop decision needs the canal and groundwater situation too.' });
        /* v91.17.101 · C1/C3 · vegetation health and the canal tag beside the rain deficit */
        try { const V = app.vegetation && app.vegetation.unit(u.unitId); const rd = app.vegetation && app.vegetation.reading(u.unitId, c);
          if (V && (V.vhi != null || (V.canal && V.canal.canalFed))) rows.push({ parameter: 'Vegetation health (satellite, weekly)', values: (V.vhi != null ? 'VHI ' + V.vhi + ' (' + (V.word || V.level) + ') · ' + weekText(V.week) : 'no vegetation value this week') + (V.canal && V.canal.canalFed ? ' · canal-fed tehsil' : ''),
            verdict: V.level || null, state: V.level ? null : need('a vegetation reading this week (none this week, or bare ground)'), meaning:   /* v91.17.252 · A4 · the Kogan classes of vegetation-health-scale.json, as the map */ (rd ? rd.charAt(0).toUpperCase() + rd.slice(1) + '. ' : '') + 'Vegetation Health Index: greenness and canopy temperature against their own record for the week, 4 km; under 40 is vegetation drought.' }); } catch (_) {} } } catch (_) {}
      try { const G2 = app.glof && app.glof.national && app.glof.national(false); const g = G2 && G2.ok && G2.units && G2.units[u.unitId]; if (g && g.applicable) rows.push({ parameter: 'Glacial lake outburst flood (GLOF)', values: (g.word || 'no level') + (g.text ? ' · ' + g.text : ''), verdict: g.word || null, state: g.word ? null : need('a lake class for this tehsil'), standing:   /* v91.17.275 HAZ2 · the GLOF word from glof.mjs (one rule with the map and the AI: Low and the standing class Normal, precursor High, observed signal Severe); the operational ladder printed Moderate here where the map showed Normal */   /* v91.17.252 · A4 · hazard-scale operationalLadder, the map's GLOF words */ g.class === 'Monitor' ? 'standing lake susceptibility, no melt, rain or lake-growth precursor (not a 15-day forecast)' : null,   /* v91.17.157 · audit: Monitor is standing susceptibility; it was a 15-day Watch here and Normal in the AI */ meaning: 'Glacial lakes that drain towards this tehsil, weighted by susceptibility and distance; not a breach scenario.' }); } catch (_) {}
      /* v91.17.101 · dams upstream within the screening reach (station-lake/scripts/dam_exposure.py; a list, not an inundation model) */
      try { const f2 = join(dataDir, 'dam-exposure.json'); if (existsSync(f2)) { const DX = JSON.parse(readFileSync(f2, 'utf8')); const ds = DX.units && DX.units[u.unitId];
        if (ds && ds.length) { const big = ds.filter(e => e.cls === 'mega'), sm = ds.filter(e => e.cls === 'small').length, mi = ds.filter(e => e.cls === 'mini').length;
          rows.push({ parameter: 'Dams upstream (screening reach)', values: (big.length ? big.slice(0, 3).map(e => e.name + (e.heightM ? ' (' + Math.round(e.heightM) + ' m)' : '') + (e.km ? ', ' + Math.round(e.km) + ' km upstream' : ', in this tehsil')).join('; ') : 'no large dam') + (sm ? ' · ' + sm + ' small dam' + (sm === 1 ? '' : 's') : '') + (mi ? ' · ' + mi + ' farm-scale dam(s)' : ''),
            verdict: null, state: STANDING, standing: big.length ? 'large dam upstream' : null,   /* v91.17.157 · audit: a standing list, not a 15-day verdict */ meaning: 'Dams whose river path reaches this tehsil within ' + DX.reachKm.mega + ' km (large), ' + DX.reachKm.small + ' km (small) or ' + DX.reachKm.mini + ' km (farm-scale). A screening list for emergency planning, not a dam-break inundation map; controlled releases also reach these tehsils first.' }); } } } catch (_) {}
      try { const f = join(dataDir, 'event-memory.json'); if (existsSync(f)) { const M = JSON.parse(readFileSync(f, 'utf8')); const ev = M.units && M.units[u.unitId]; if (ev && ev.length) rows.push({ parameter: 'What happened here before', values: ev.slice(0, 5).map(e => e.text).join(' · '), verdict: null, state: REFERENCE, meaning: 'Recorded past events in this tehsil (satellite flood extents, a global landslide catalogue, documented glacial lake outbursts, AGN stations).' }); } } catch (_) {}
    }
    rows.push({ parameter: 'Other design values (snow load, future climate)', values: null, verdict: null, state: need('a site study (snow load and future-climate design values are not held here)'), meaning: 'The engineer of record sets these from the building code and a site study.' });
    /* v91.17.252 · A4 · no row leaves without a level or a named state */
    const SC = scale(); for (const r of rows) { if (!r.verdict && !r.state) r.state = need('a level rule for this row'); r.reached = isReached(r.verdict, SC); }
    /* v91.17.103 · each row that comes from a gated layer carries the gate status (operational / reference / experimental) */
    try { const GM = [[/^Rain chance/, 'rain_hz'], [/^Drought/, 'drought'], [/^Glacial la/, 'glof'], [/^Seismic design/, 'seismic'], [/^Vegetation health/, 'veg:vhi']];
      if (app.gate) for (const r of rows) { const m = GM.find(([re]) => re.test(r.parameter)); if (m) r.gate = app.gate.tagOf(m[1]); } } catch (_) {}
    return { ready: true, gateVersion: (app.gate && app.gate.version()) || null, place: u ? { unitId: u.unitId, name: u.name, district: u.district } : null, point: { lat, lon, elevM: elev ?? null }, rows,
      forecastWindow: days.length ? [days[0].date, days[days.length - 1].date] : null, returnLevels: RL && RL.ready ? { method: RL.method, years: '1940-2025', caveat: RL.caveat } : null,
      ensemble: { at: F.at, ageH: F.ageH, current: fresh, why: F.why }, scale: SC,
      note: 'Screening values from long free records, not design values. The level (Normal, Low, Moderate, High, Severe: the map\'s scale) compares the next 15 days with them; heat is levelled on UTCI. A row without a level says why: the input it needs, or that it is a standing or reference fact.' };
  }
  /* v91.17.283.19 · the sectors the pathway table names (data/site-risk-pathways.json): the place bundle carries the risk of every one */
  function sectors() { const C = cfg(); const P = C && C.pathways && C.pathways.humidHeat; return P && P.sectors ? Object.keys(P.sectors) : ['general']; }
  return { risk, screening, returnLevels, sectors };
}
