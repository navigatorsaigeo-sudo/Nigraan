import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.111 · cold is UTCI cold stress.  node scripts/tests111/v111.test.mjs (server running) */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const ROOT = (__T.ROOT + '/');
const M = await import(ROOT + 'server/api/utci.mjs');
/* v91.17.283.12 (owner, 24 Oct 2026): a cold level only from strong cold stress (UTCI -13 C); moderate cold stress is Normal */
ok([[9, 0], [0, 10], [-0.1, 10], [-13, 23], [-13.1, 45], [-27, 64], [-27.1, 65], [-40, 81], [-40.1, 82], [-50, 99], [20, 0], [-60, 100]].every(([u, s]) => M.utciColdScore(u) === s), 'cold mapping puts the published class bounds on the AGN band cuts; a level only from strong cold stress; a value on a bound is the warmer class');
ok([-0.1, -13, -13.1, -27.1, -40, -40.1, 5].every(u => { const sc = M.utciColdScore(u), b = sc >= 82 ? 4 : sc >= 65 ? 3 : sc >= 45 ? 2 : sc >= 25 ? 1 : 0, c = M.utciClass(u); return ({ 'Extreme cold stress': 4, 'Very strong cold stress': 3, 'Strong cold stress': 2 })[c] === b || (b === 0 && /Moderate cold|Slight|No thermal/.test(c)); }), 'level and published class agree at and around every bound');
const UC = JSON.parse(readFileSync(ROOT + 'data/utci-cold-climatology.json', 'utf8')); const ids = Object.keys(UC.units);
let bad = 0; for (const k of ids) { const u = UC.units[k]; for (let d = 0; d < 366; d++) if (!(u.p05[d] <= u.p10[d] && u.p10[d] <= u.p50[d])) bad++; }
ok(ids.length >= 570 && bad === 0, 'cold-stress climate for ' + ids.length + ' tehsils, percentiles ordered');
const g = (re) => UC.units[ids.find(k => re.test(k))];
ok(g(/\|Gojal$/).p10[14] < g(/\|Lahore City$/).p10[14] - 15 && g(/\|Lahore City$/).daysPerYear[2] === 0, 'Gojal mid-January far colder than Lahore; Lahore never reaches strong cold stress');
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction((n) => { try { const f = PK_DISTRICTS.features.find(x => x.properties.tehsil === n); const r = DISTRICT_IN[f.properties.key]; return AGN.hz5.sweep().done && window.__agnClimAnchors && r && r.fc72 && r.utci90 != null; } catch (_) { return false; } }, 'Gojal', { timeout: 480000, polling: 3000 }).catch(() => {});   /* a cold server's first sweep can take minutes */
await pg.waitForTimeout(60000);
const R = await pg.evaluate(() => { const c = (o) => hzCold(o, { zone: 'high_mountain', emin: 2400, elev: 3000 });
  const a = c({ tminDay: -7, t: -7, hum: 70, wind: 10 }), b = c({ tminDay: -2, t: -2, hum: 80, wind: 0 }), w = c({ tminDay: 12, t: 12, hum: 60, wind: 5 }), n = c({ tminDay: -10, t: -10, wind: 20 });
  const t1 = c({ tminDay: -10, t: -10, hum: 70, wind: 20, tn10: -20 }).score, t2 = c({ tminDay: -10, t: -10, hum: 70, wind: 20, tn10: 5 }).score;
  const e1 = hzCold({ tminDay: -10, t: -10, hum: 70, wind: 20 }, { zone: 'irrigated_plains', elev: 150 }).score;
  const day = { coldUtciShade: -30, coldUtciT: -15, coldUtciWind: 25, coldUtciBasis: 'test' }; const d = c(Object.assign({ tminDay: -15, hum: 70, wind: 25 }, day));
  return { a: [a.score, a.utciShade, a.utciClass], b: [b.score, b.utciClass], w: [w.score, w.utciClass], n: [n.score, n.unavailable], t1, t2, e1, d: [d.score, d.utciClass] }; });
ok(R.a[0] >= 45 && R.a[0] < 65 && /^Strong cold/.test(R.a[2]), '-7 C with 10 km/h wind: strong cold stress = Moderate (' + R.a.join(' / ') + ')');
ok(R.b[0] < 25 && R.w[0] < 25, '-2 C calm: moderate cold stress = Normal, a level only from strong cold stress (' + R.b.join(' / ') + '); +12 C: Normal (' + R.w.join(' / ') + ')');
ok(R.n[0] == null && R.n[1] === true, 'no humidity: cold not scored (no assumed humidity)');
ok(R.t1 === R.t2 && R.t1 === R.e1, 'the level depends on the air, not on the local baseline or the zone/elevation (' + [R.t1, R.t2, R.e1].join(', ') + ')');
ok(R.d[0] >= 65 && R.d[0] < 82 && /Very strong cold/.test(R.d[1]), 'day input: coldest-hour UTCI -30 C = very strong cold stress = High (' + R.d.join(' / ') + ')');
const S = await pg.evaluate(() => { const r = AGN.selfcheck.run(); const s5 = r.checks.find(c => c.id === 'S5'); const f = PK_DISTRICTS.features.find(x => x.properties.tehsil === 'Gojal'); const k = f.properties.key; const rr = aiDistrictRisk(hzDayInput(k, 'cold'), 'cold', 24, k); return { s5: s5.status, n: s5.n, c: r.layers.cold.counts, nd: r.layers.cold.nd, note: rr && rr.notes && rr.notes.join(' | ') }; });
ok(S.s5 === 'PASS' && S.nd === 0, 'self-check S5: every cold level equals its UTCI class band; no unit without data (' + JSON.stringify(S.c) + ')');
ok(/UTCI .* coldest hour/.test(S.note || '') && /cold stress (below|above)/.test(S.note || ''), 'Gojal cold popup names the UTCI and how unusual it is for the place', S.note);
const EV = await (await fetch(BASE + '/api/ai/evidence?prompt=' + encodeURIComponent('cold in Gilgit tonight'))).json();
const cc = EV.facts && EV.facts.askedUnits && EV.facts.askedUnits[0] && EV.facts.askedUnits[0].coldClimate;
ok(cc && cc.p10C != null && cc.daysPerYearAtLevel, 'AI facts carry the place\'s cold-stress climate', JSON.stringify(cc));
const G = JSON.parse(readFileSync(ROOT + 'data/model-gate.resolved.json', 'utf8')).entries.find(e => e.id === 'cold');
ok(G && G.class === 'published_standard' && G.status === 'operational', 'gate: cold is a published standard, operational');
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v111: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
