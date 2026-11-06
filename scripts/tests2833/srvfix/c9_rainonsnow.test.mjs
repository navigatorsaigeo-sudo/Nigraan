// C9 · rain on snow (5-day snowfall, no snowpack) raises no report action: it is a watch row ("watch only", screening class).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imp, src, ok, done, TREE } from './lib.mjs';
process.env.NIGRAAN_DATA_DIR = join(TREE, 'data');
const { createReport } = await imp('server/api/report.mjs');
const tehs = JSON.parse(readFileSync(join(TREE, 'data', 'pk-tehsils.json'), 'utf8')).features.map((f) => ({ unitId: f.properties.uid, key: f.properties.key, name: f.properties.tehsil, district: f.properties.district, province: f.properties.province, lat: 36, lon: 74, elevM: 2400 }));
const iso = (n) => new Date(Date.now() + 5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const events = { rainOnSnow: { p: 100, onset: iso(3) } };
const app = { dataDir: join(TREE, 'data'), provider: { call: async () => { throw new Error('offline'); } }, units: { tehsil: tehs },
  outlook: { findUnit: (k) => tehs.find((t) => t.unitId === k || t.key === k) || null, unit: () => ({ unit: { elevM: 2400 }, events }), seasonalUnit: () => null },
  smog: { unit: () => null }, seasVerify: { summary: () => ({ logs: {}, ec46: {}, seas5: {} }) }, skill: { sheet: () => ({}) }, sources: { methodsLine: () => 'Sources: test' }, gate: null };
const R = createReport(app);
const c = await R.context({ unit: 'Gilgit Baltistan|Gilgit|Gilgit', section: 'operations' }, { customer: true });
const acts = ((c || {}).actions || []).filter((a) => /Rain on snow/.test(a.hazard));
const wl = ((c || {}).watch || []).filter((w) => w.hazard === 'Rain on snow');
ok(c && Array.isArray(c.actions), 'context built', c && c.why);
ok(acts.length === 0, 'C9: rain on snow at 100 % raises no action', JSON.stringify(acts).slice(0, 200));
ok(wl.length === 1 && /watch only: a screening class/.test(wl[0].what) && wl[0].value === 100, 'C9: one watch row, "watch only, screening class", with the member share', JSON.stringify(wl).slice(0, 300));
ok(!/Treat downstream channels and culverts as carrying more than the rainfall suggests/.test(src('server/api/report.mjs')), 'C9: the action instructions are gone');
done('C9-RAINONSNOW');
