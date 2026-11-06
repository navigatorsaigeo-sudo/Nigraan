/* v91.17.283.28 . CONSISTENCY GUARD (the acceptance test of every package): for the 20 places of scripts/tests28328/places.json, on a
   server of its own (mock provider; one place read while the ensemble answers HTTP 500), the shared values are IDENTICAL everywhere the
   server serves them:
     C1  daily max / min / feels max / rain: the place record (customer, operator), the point state's days, the report context, the
         Customize batch (/api/point/batch with=placeRecord)
     C2  site levels per hazard and day: the bundle (customer, operator), the report context, the Customize batch, /api/scenario baseline
     C3  tehsil day levels per hazard: /api/levels/unit, the bundle's levels part, the report context, the Customize batch levels
     C4  rain return levels: the place record, the bundle's rainRarity part, the report context
     C5  river status: the place record and the site levels' flood (one rule), never 'Normal' without a gauged reach
     C6  accuracy (one figure) and station counts: every view and the report
     C7  the failing provider part is named in the bundle, and the place record / site levels are still served (not assessed where they
         need the missing input, never Normal by default)
   usage: node scripts/tests28328/consistency.test.mjs   (starts and stops its own server) */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownServer, req, counter } from '../tests283/permanent/lib.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const PL = JSON.parse(readFileSync(join(HERE, 'places.json'), 'utf8')).places;
const { ok, done } = counter('tests28328/consistency');
const S = await ownServer({ env: { NIGRAAN_POINT_FIRST_MS: '1500' } });
if (!S.up) { ok(false, 'own server started', S.log().slice(-1500)); await S.stop(); done(); process.exit(1); }
const C = { 'x-agn-view': 'customer' }, O = { 'x-agn-view': 'operator' };
const get = async (p, h = C) => { const r = await req(S.base, p, { headers: h, timeoutMs: 240000 }); return r.json || { __status: r.status, __text: (r.text || '').slice(0, 200) }; };
const J = (x) => JSON.stringify(x);
const daysOf = (d) => (d || []).map((x) => [x.date, x.tmaxC ?? null, x.tminC ?? null, x.feelsMaxC ?? null, x.rainMm ?? null]);
const siteOf = (s) => (s && s.hazards ? Object.fromEntries(Object.entries(s.hazards).map(([k, h]) => [k, h.days.map((d) => [d.date, d.assessed ? d.level : null])])) : null);
const unitLv = (days) => Object.fromEntries((days || []).map((d) => [d.day, Object.fromEntries(Object.entries(d.layers || {}).map(([k, v]) => [k, v.word === 'Not assessed' || v.assessed === false ? 'NA' : (v.word || v.level)]))]));
const rr = (r) => (r && r.ready ? J(r.durations && r.durations['24h']) : 'not:' + !!r);
const pv = (B, k) => B && B.parts && B.parts[k] && B.parts[k].ok ? B.parts[k].v : null;
let n = 0;
try {
  for (const p of PL) {
    if (p.fault) S.setMode(p.fault.mode, p.fault.paths);
    const ll = 'lat=' + p.lat.toFixed(5) + '&lon=' + p.lon.toFixed(5);
    const BC = await get('/api/point?' + ll + '&complete=1'), BO = await get('/api/point?' + ll + '&complete=1', O);
    if (!BC.ok) { ok(false, p.id + ' bundle served', BC); continue; }
    const uid = BC.place && BC.place.unitId;
    const [U, R, BT, SC] = [await get('/api/levels/unit?unit=' + encodeURIComponent(uid)), await get('/api/report/context?' + ll), await get('/api/point/batch?pts=' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5) + '&with=levels,placeRecord,siteLevels'), await get('/api/scenario?' + ll + '&preset=baseline')];
    const PRc = pv(BC, 'placeRecord'), PRo = pv(BO, 'placeRecord'), SLc = pv(BC, 'siteLevels'), SLo = pv(BO, 'siteLevels');
    const bt = BT && BT.states && BT.states[0], PRb = pv(bt, 'placeRecord'), SLb = pv(bt, 'siteLevels'), LVb = pv(bt, 'levels');
    const Rp = R && R.place, sc = SC && SC.places && SC.places[0];
    ok(PRc && PRo && SLc && SLo && Rp && PRb && SLb && sc && sc.baseline, p.id + ' every surface serves the place record and the site levels', { pr: !!PRc, sl: !!SLc, report: Rp && (Rp.why || Rp.complete), batch: !!PRb, scen: sc && (sc.why || sc.ok) });
    if (!(PRc && SLc)) continue; n++;
    const d0 = J(daysOf(PRc.days));
    ok(d0 === J(daysOf(PRo.days)) && d0 === J(daysOf(BC.days)) && d0 === J(daysOf(Rp && Rp.record && Rp.record.days)) && d0 === J(daysOf(PRb && PRb.days)), p.id + ' C1 daily max / min / feels / rain identical', [d0.slice(0, 160), J(daysOf(Rp && Rp.record && Rp.record.days)).slice(0, 160), J(daysOf(PRb && PRb.days)).slice(0, 160)]);
    const s0 = J(siteOf(SLc));
    ok(s0 === J(siteOf(SLo)) && s0 === J(siteOf(Rp && Rp.siteLevels)) && s0 === J(siteOf(SLb)) && s0 === J(siteOf(sc && sc.baseline)), p.id + ' C2 site levels identical (bundle customer / operator, report, Customize, scenario baseline)', [s0.slice(0, 200), J(siteOf(SLo)).slice(0, 200), J(siteOf(sc && sc.baseline)).slice(0, 200)]);
    const u0 = J(unitLv(U && U.days)), lvc = pv(BC, 'levels');
    ok(U && U.days && u0 === J(unitLv(lvc && lvc.days)) && u0 === J(unitLv(R && R.levels && R.levels.days)) && u0 === J(unitLv(LVb && LVb.days)), p.id + ' C3 tehsil day levels identical (/api/levels/unit, bundle, report, Customize)', [u0.slice(0, 200), J(unitLv(R && R.levels && R.levels.days)).slice(0, 200)]);
    const rr0 = rr(PRc.rainReturn), rar = pv(BC, 'rainRarity');
    ok(rr0 === rr(PRo.rainReturn) && rr0 === rr(Rp && Rp.record && Rp.record.rainReturn) && rr0 === rr(rar), p.id + ' C4 rain return levels identical', [rr0, rr(rar)]);
    const riv = PRc.river, fl = SLc.hazards.flood.days;
    ok(riv && ((riv.noGaugedReach && fl.every((d) => !d.assessed && /no gauged reach/.test(d.why))) || (riv.assessed === false && fl.every((d) => !d.assessed)) || (riv.assessed && fl.every((d) => { const x = (riv.days || []).find((y) => y.day === d.lead); return !x || (x.assessed ? x.level === d.level : !d.assessed); })))
      && J(riv) === J(PRo.river), p.id + ' C5 river status: one rule (no gauged reach: not assessed, never Normal)', riv);
    const ac = (x) => x && x.accuracy && x.accuracy.headline ? [x.accuracy.headline.maeC, x.accuracy.headline.n || null, x.accuracy.headline.zone] : null, stc = (x) => x && x.stations && x.stations.fleet ? J(x.stations.fleet) : null;
    ok(J(ac(PRc)) === J(ac(PRo)) && J(ac(PRc)) === J(ac(Rp && Rp.record)) && stc(PRc) === stc(PRo) && stc(PRc) === stc(Rp && Rp.record), p.id + ' C6 accuracy and station counts identical', [ac(PRc), ac(Rp && Rp.record), stc(PRc)]);
    if (p.fault) {
      const failed = Object.entries(BC.parts).filter(([, v]) => v && v.ok === false && !v.pending).map(([k]) => k);
      ok(failed.length > 0 && PRc.ok && SLc.ok && Object.values(SLc.hazards).every((h) => h.days.every((d) => d.assessed ? Number.isInteger(d.level) : typeof d.why === 'string' && d.why.length > 0)), p.id + ' C7 a failed provider part is named; the shared values are still served, not assessed with a reason where an input is missing', failed);
      S.setMode('ok');
    }
  }
  ok(n >= 18, 'at least 18 of the 20 places compared', n);
} finally { await S.stop(); }
done();
