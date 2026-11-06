// audit 3 · each holder of an alert row is judged by ITS OWN policy. A permitted Moderate heat holder survives when a non-alerting flood
// holder is dropped from the same row, and the row is rebuilt at the heat holder's own permitted level (Moderate -> Monitor), not
// required to be High. Inside the tested domain only (audit 9: domainOk); outside it the heat holder raises no alert.
import { imp, ok, done } from './lib.mjs';
const { alertGate } = await imp('server/api/engine.mjs');
const scale = { screeningCuts: [{ level: 'Severe', min: 82 }, { level: 'High', min: 65 }, { level: 'Moderate', min: 45 }, { level: 'Low', min: 25 }, { level: 'Normal', min: 0 }], operationalLadder: { Low: 'Low', Monitor: 'Moderate', Watch: 'High', Act: 'Severe', none: 'Normal' } };
const policy = { layers: { heat: { alertLevels: ['Low', 'Moderate'], indicativeLevels: ['High', 'Severe'], evidenceLevels: ['Moderate'], productType: 'Indicative' } } };
const canAlert = (h) => h === 'heat' || h === 'wind';
const inside = alertGate({ canAlert, scale, policy, names: { heat: 'Heat stress' }, domainOk: () => ({ ok: true }) });
const alone = inside([{ name: 'Jacobabad', hazard: 'heat', index: 50, holders: [{ hazard: 'heat', index: 50 }] }]);
const mixed = inside([{ name: 'Jacobabad', hazard: 'flood', index: 70, band: 'Watch', sev: 4, classRank: 3, holders: [{ hazard: 'flood', index: 70 }, { hazard: 'heat', index: 50 }] }]);
ok(alone.length === 1, 'heat Moderate alone: kept');
ok(mixed.length === 1 && mixed[0].hazard === 'heat' && mixed[0].band === 'Monitor' && mixed[0].classRank === 2 && mixed[0].sev === 3 && mixed[0].gateDropped.join() === 'flood',
  'heat Moderate + a non-alerting flood holder: the row survives, rebuilt at Moderate (Monitor, rank 2, sev 3) from the heat holder; flood dropped', JSON.stringify(mixed[0] || null).slice(0, 300));
const wind = inside([{ name: 'X', hazard: 'flood', index: 70, holders: [{ hazard: 'flood', index: 70 }, { hazard: 'wind', index: 50 }] }]);
ok(wind.length === 0, 'a holder without a per-level policy keeps the general threshold (High): wind Moderate alone after flood is dropped is not an alert');
const outside = alertGate({ canAlert, scale, policy, names: {}, domainOk: () => ({ ok: false, why: 'outside the tested domain: day 0' }) });
const d = []; const o = outside([{ name: 'Quetta', hazard: 'heat', index: 50, holders: [{ hazard: 'heat', index: 50 }] }], d);
ok(o.length === 0 && d.length === 1 && /outside the tested domain/.test(d[0].why), 'outside the tested domain: the heat Moderate holder raises no alert, with the reason', JSON.stringify(d));
done('A03-ALERTGATE');
