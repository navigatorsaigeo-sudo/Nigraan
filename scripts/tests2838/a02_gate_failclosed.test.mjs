// audit 2 · a missing or unreadable model gate FAILS CLOSED in every consumer: served.mjs (unit, national), the engine's alert re-gate,
// index.mjs (/api/levels, /api/alerts, checked live in a02b), the AI and the report (they read servedUnit). The client never gets the raw
// combined flood level or the local-rain flood layer; every layer is "Not assessed" with the reason "model gate unavailable".
import { imp, src, ok, done } from './lib.mjs';
const SV = await imp('server/api/served.mjs');
const rec = { ready: true, unit: 'Sindh|Sujawal|Jati', key: 'Sindh|Sujawal|Jati', words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'],
  days: [{ day: 0, date: '2026-10-22', layers: { flood: { name: 'Flood', level: 4, word: 'Severe' }, flood_pluvial: { name: 'Local-rain flooding', level: 4, word: 'Severe' }, flood_riverine: { name: 'River flooding', level: 0, word: 'Normal' }, heat: { name: 'Heat', level: 2, word: 'Moderate' } } }],
  alerts: [{ hazard: 'flood', name: 'Jati', sev: 5, classRank: 4, band: 'Act' }] };
const engine = { unit: () => JSON.parse(JSON.stringify(rec)), levels: (l) => ({ ready: true, levels: { 'Sindh|Sujawal|Jati': 4 }, words: rec.words, day: 0, counts: [0, 0, 0, 0, 1] }), latest: () => ({ unitKeys: {} }) };
for (const [label, gate] of [['missing (no gate object)', undefined], ['unreadable (full() not ready)', { full: () => ({ ready: false }), entryOf: () => null, canAlert: () => false }], ['readable but no client_rules', { full: () => ({ ready: true, entries: [] }), entryOf: () => null, canAlert: () => false }]]) {
  const app = { engine, gate, dataDir: '/nonexistent' };
  const R = SV.clientRules(app); const U = SV.servedUnit(app, 'Sindh|Sujawal|Jati', false); const L = U.days ? U.days[0].layers : {};
  ok(R.ready === false, 'gate ' + label + ': clientRules says not ready (fail closed)', JSON.stringify(R).slice(0, 160));
  ok(!('flood_pluvial' in L) && L.flood && L.flood.assessed === false && L.flood.word === 'Not assessed' && /model gate unavailable/.test(L.flood.notAssessedWhy || '') && L.flood.level !== 4,
    'gate ' + label + ': client flood is "Not assessed (model gate unavailable)", never the raw Severe; local-rain flooding not served', JSON.stringify(L.flood || null).slice(0, 200));
  ok(Object.values(L).every((v) => v.assessed === false) && (U.alerts || []).length === 0, 'gate ' + label + ': every layer not assessed and every alert withheld', JSON.stringify({ alerts: U.alerts, withheld: U.alertsWithheld }).slice(0, 200));
  const N = SV.servedNational(app, 'flood', 0, false);
  ok(N.ready === false && /model gate unavailable/.test(N.why || ''), 'gate ' + label + ': national counts not served', JSON.stringify(N).slice(0, 160));
  const O = SV.servedUnit(app, 'Sindh|Sujawal|Jati', true); ok(O.days && O.days[0].layers.flood_pluvial, 'gate ' + label + ': the operator view keeps the engine record');
}
const { alertGate } = await imp('server/api/engine.mjs');
const E = src('server/api/engine.mjs');
ok(/if \(!app\.gate\) \{ if \(dropped\)[^]*return \[\]; \}/.test(E), 'engine gateServed: no gate object -> no row served unchecked (fail closed)');
const I = src('server/api/index.mjs');
ok(/if \(!R\.ready\) return \{ ready: false, gateUnavailable: true/.test(I) && /if \(!CR\.ready\) \{[^]*rows: \[\], gateUnavailable: true/.test(I), 'index.mjs /api/levels and /api/alerts: fail closed when the gate is not ready');
done('A02-GATE-FAILCLOSED');
