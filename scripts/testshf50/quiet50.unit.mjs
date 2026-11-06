#!/usr/bin/env node
/* v91.17.283.50 (1.0.10.1) · linter L11 on a quiet place, no server. Laptop 3 Nov 10:04 PKT: "L11 p1 tile Heat Normal is worse than anything
   the summary names" refused every report of a place with no hazard above Normal (E-7 Islamabad). (1) all-Normal tiles pass L11, in
   every combination of the other rules' inputs (no hazards named, air quality named or not); (2) the rule still catches a real
   contradiction (an unnamed Low / High tile, a named hazard whose tile differs); (3) a quiet synthetic place through the whole engine
   (every hazard Normal on every day, air quality Good / no air row, no actions) passes ALL lint rules; (4) the summary names only the
   days the tiles show (a level day outside the 7 tile days is not summarised). */
import { lint } from '../../server/api/replint.mjs';
import { buildReport, summaryOf } from '../../server/api/repengine.mjs';
import { pdf, html } from '../../server/api/repdraw.mjs';
import { Canvas } from '../../server/api/repdraw.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const base = () => ({ sections: [], tables: [], tiles: [], summary: { text: '', facts: {} }, customerPages: 1, pages: 1, actions: [] });
const cv = () => { const c = new Canvas(); c.page(); c.text(40, 100, 'ok', { size: 9 }); return c; };
const L11 = (m) => lint({ cv: cv(), manifest: m, answer: {} }).failures.filter((f) => f.code === 'L11');
const D = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const tiles = (hz, word) => D.map((d) => ({ hazard: hz, date: d, word, tier: 2 }));
/* (1) all Normal */
for (const air of [null, 'Good', 'Unhealthy', 'Normal']) {
  const m = base(); m.tiles = [...tiles('Heat', 'Normal'), ...tiles('Landslide', 'Normal'), ...tiles('Drought', 'Normal')];
  m.summary = { text: 'Near E-7, next 7 days: no hazard above Normal on the days with issued levels.', facts: { hazards: [] } };
  if (air) { m.tiles.push(...tiles('Air quality', air)); m.summary.text += ' air quality ' + air.toLowerCase(); m.summary.facts.air = { word: air, dates: D }; }
  ok(!L11(m).length, 'all-Normal tiles raised L11 (air ' + air + '): ' + JSON.stringify(L11(m)[0])); }
{ const m = base(); m.tiles = [...tiles('Heat', 'Normal'), ...tiles('Drought', 'Low')]; m.summary.facts = { hazards: [{ name: 'Drought', word: 'Low', dates: D }] };
  ok(!L11(m).length, 'Normal heat tile beside a named Low drought raised L11'); }
/* (2) real contradictions still caught */
{ const m = base(); m.tiles = tiles('Heat', 'Low'); m.summary.facts = { hazards: [] }; ok(L11(m).length > 0, 'unnamed Low tile under "no hazard" not raised'); }
{ const m = base(); m.tiles = [...tiles('Heat', 'Low'), ...tiles('Flood', 'High')]; m.summary.facts = { hazards: [{ name: 'Heat', word: 'Low', dates: D }] }; ok(L11(m).some((f) => /Flood High/.test(f.what)), 'unnamed High tile above a named Low not raised'); }
{ const m = base(); m.tiles = tiles('Heat', 'Normal'); m.summary.facts = { hazards: [{ name: 'Heat', word: 'Low', dates: [D[0]] }] }; ok(L11(m).length > 0, 'summary Low against a Normal tile not raised'); }
/* (3) a quiet place through the engine: every rule */
const days = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: '2026-11-0' + (3 + i), lead: i, tmaxC: 24 + i * 0.2, tminC: 11, rainMm: 0, gustMaxKmh: 18, rainProbMax: 4, utciMaxC: 21 }));
const hz = (key, name, tier) => ({ key, layer: key, name, tier, days: days.slice(0, 4).map((d) => ({ date: d.date, level: 0, word: 'Normal', state: 'value' })) });
const A = { ok: true, view: 'customer', issuedAt: '2026-11-03T05:04:00Z', run: '2026-11-03T00:00~x', levelsAt: '2026-11-03T05:00:00Z',
  place: { lat: 33.7233, lon: 73.0435, name: 'E-7', kind: 'near', near: { name: 'E-7', km: 0.3 }, tehsil: 'Islamabad', district: 'Islamabad', province: 'Islamabad Capital Territory' },
  days, levels: { days: days.slice(0, 4).map((d) => d.date), hazards: [hz('heat', 'Heat', 2), hz('landslide', 'Landslide', 2), hz('drought', 'Drought', 2), hz('flood', 'Flood', 1)] },
  air: null, actions: [], standing: [], cannotHappen: [] };
for (const variant of ['no air', 'air Good']) {
  const AA = JSON.parse(JSON.stringify(A)); if (variant === 'air Good') AA.air = { days: days.slice(0, 4).map((d) => ({ date: d.date, category: 'Good', aqi: 35 })) };
  let R = null, err = null; try { R = buildReport(AA, { kind: 'site_assessment', view: 'customer', id: 'NGR-TEST-QUIET', dataDir: new URL('../../data', import.meta.url).pathname }); } catch (e) { err = e; }
  ok(R && !err, 'quiet place (' + variant + ') did not build: ' + (err && err.stack || '').slice(0, 300));
  if (R) { const P = pdf(R.cv, { title: R.title, subject: 's', date: AA.issuedAt }), H = html(R.cv, { title: R.title, id: 'NGR-TEST-QUIET' });
    const r = lint({ cv: R.cv, manifest: R.manifest, pdf: P, html: H, answer: AA }); ok(r.ok, 'quiet place (' + variant + ') failed the linter: ' + r.failures.slice(0, 4).map((f) => f.code + ' ' + f.what).join(' | '));
    ok(/no hazard above Normal/.test(R.manifest.summary.text), 'quiet summary: ' + R.manifest.summary.text); } }
/* (4) the summary names only the tile days */
{ const T = { rows: [{ name: 'Heat', tier: 2, days: [{ date: '2026-11-02', level: 2 }, { date: '2026-11-03', level: 0 }] }] };
  const S = summaryOf({ place: A.place, days }, T, null); ok(!S.facts.hazards.length && /no hazard above Normal/.test(S.text), 'a level day before the tile days was summarised: ' + S.text); }
console.log('\nquiet50: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
