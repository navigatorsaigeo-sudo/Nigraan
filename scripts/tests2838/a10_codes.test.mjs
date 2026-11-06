// audit 10 · the -3 code ("no modelled river reach") is in the /api/levels code dictionary, and the national summary counts -3 (and the
// -1 "no reach scored here" of a river layer that scored other tehsils) apart from "no data", with the same reasons as the unit answer.
import { imp, src, BASE, get, CUST, ok, done } from './lib.mjs';
const SV = await imp('server/api/served.mjs');
const G = { ready: true, client_rules: { hidden_layers: {}, substitute: { flood: { from: 'flood_riverine', note: 'river' } } }, entries: [] };
const app = { gate: { full: () => G, entryOf: () => null }, dataDir: '/x', engine: { levels: (l) => ({ ready: true, day: 0, words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], counts: [3, 1, 0, 0, 0], levels: { a: 0, b: 1, c: -3, d: -3, e: -1, f: -2 } }), latest: () => ({ unitKeys: {} }) } };
const N = SV.servedNational(app, 'flood', 0, false); const NA = N.notAssessed || {};
ok(NA.noRiverReach && NA.noRiverReach.tehsils === 2 && /no (modelled|gauged) river reach/.test(NA.noRiverReach.why) /* v283.35 states.mjs wording */ && NA.noRiverReachScored && NA.noRiverReachScored.tehsils === 1 && NA.noData.tehsils === 0 && NA.outsideMethodRange.tehsils === 1,
  'national summary: -3 counted as "no modelled river reach" (2), a -1 of a scored river layer as "no reach scored here" (1), none left in "no data"', JSON.stringify(NA).slice(0, 400));
ok(/const code = codeDict\(\)/.test(src('server/api/index.mjs')) && /'-3': 'no gauged river reach/.test(src('server/api/states.mjs')), 'index.mjs: the /api/levels code dictionary names -3 (v283.35: every code, states.mjs)');
if (BASE) { const r = await get('/api/levels?layer=flood&day=0', CUST); ok(r.j && r.j.code && /no (modelled|gauged) river reach/.test(r.j.code['-3'] || ''), 'GET /api/levels?layer=flood: code -3 explained', JSON.stringify(r.j && r.j.code)); }
else console.log('     (live part skipped: no server address)');
done('A10-CODES');
