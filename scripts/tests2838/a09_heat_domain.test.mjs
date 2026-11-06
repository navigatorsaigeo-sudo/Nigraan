// audit 9 · the heat Moderate alert permission is limited to the domain its evidence tested: forecast days 1-2 in Sindh and Punjab
// (data/skill-evidence.json heat.client: read, never typed). Elsewhere (day 0, day 3, other provinces) the level is Indicative with the
// reason "outside the tested domain"; the level tag takes the day and the region; an owner-decision level (Low) keeps its rule.
import { imp, json, ok, done, TREE } from './lib.mjs';
import { join } from 'node:path';
const SV = await imp('server/api/served.mjs');
const G = json('data/model-gate.resolved.json'); const E = json('data/skill-evidence.json');
const entry = G.entries.find((e) => e.id === 'utci');
const app = { dataDir: join(TREE, 'data'), gate: { full: () => ({ ready: true, ...G }), entryOf: (l) => (l === 'heat' ? entry : null), canAlert: () => true } };
const C = (E.heat && E.heat.client) || {}; ok(Array.isArray(C.leads) && C.leads.join() === '1,2' && /Sindh/.test(C.region) && /Punjab/.test(C.region), 'the evidence names the tested domain: days ' + C.leads + ', ' + C.region);
const tag = (day, uid) => SV.levelTag(app, 'heat', 'Moderate', { day, uid });
const inD = [tag(1, 'Sindh|Karachi|X'), tag(2, 'Punjab|Lahore|Y')], outD = [tag(0, 'Sindh|Karachi|X'), tag(3, 'Punjab|Lahore|Y'), tag(1, 'Balochistan|Quetta|Z'), SV.levelTag(app, 'heat', 'Moderate')];
ok(inD.every((t) => t.canAlert && t.productType === 'Forecast'), 'Moderate heat on days 1-2 in Sindh / Punjab: Forecast, may alert', JSON.stringify(inD.map((t) => t.productType)));
ok(outD.every((t) => !t.canAlert && t.productType === 'Indicative' && /outside the tested domain/.test(t.why || '')), 'Moderate heat on day 0, day 3, in Balochistan, or with no day/place: Indicative, "outside the tested domain"', JSON.stringify(outD.map((t) => t.why)).slice(0, 300));
const low = SV.levelTag(app, 'heat', 'Low', { day: 0, uid: 'Balochistan|Quetta|Z' }); ok(low.canAlert === true, 'heat Low (owner decision, no evidence row) keeps its rule');
const rec = { ready: true, unit: 'Balochistan|Quetta|Z', words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], days: [0, 1].map((d) => ({ day: d, date: 'd' + d, layers: { heat: { name: 'Heat', level: 2, word: 'Moderate' } } })), alerts: [] };
const U = SV.servedUnit({ ...app, engine: { unit: () => JSON.parse(JSON.stringify(rec)) } }, 'Balochistan|Quetta|Z', false);
ok(U.days.every((d) => d.layers.heat.outsideTestedDomain === true && d.layers.heat.productType === 'Indicative'), 'servedUnit: a Balochistan heat Moderate is marked outside the tested domain on every day');
ok(SV.levelPhrase(U.days[1].layers.heat).includes('outside the tested domain'), 'the AI / report phrase says it', SV.levelPhrase(U.days[1].layers.heat));
done('A09-HEAT-DOMAIN');
