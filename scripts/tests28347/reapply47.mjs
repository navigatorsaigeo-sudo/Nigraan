/* v91.17.283.47 · test helper: the 1.0.8 server steps (landslide GIRI rule, combined flood) applied to a HELD engine record (the laptop's),
   as the first engine report / input change after the deploy applies them; every other layer is left as held (river, rain, sponge ...).
   usage: node reapply47.mjs <tree> <engine-latest.json in> <out> */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [tree, inp, out] = process.argv.slice(2);
const H = await import(join(tree, 'server/api/hazsci.mjs'));
const rec = JSON.parse(readFileSync(inp, 'utf8')); const D = (f) => JSON.parse(readFileSync(join(tree, 'data', f), 'utf8'));
const app_ = D('hazard-applicability.json'); const mask = app_.layers.landslide.units;
/* the odds of the held record (the in-mask cells' served ratio), so the in-mask levels are re-made from the same ratio */
const units = {}; for (const d of rec.days) { const S = d.layers.landslide; if (!S) continue; for (const [u, r] of Object.entries(S.S || {})) { (units[u] = units[u] || { days: [] }).days.push({ date: d.date, ratio: r, ...(S.facts && S.facts[u] ? S.facts[u] : {}) }); } }
const before = {}; for (const k of ['landslide', 'flood']) before[k] = JSON.stringify(rec.days[0].layers[k].counts) + ' na ' + rec.days[0].layers[k].na + ' nd ' + rec.days[0].layers[k].nd;
const r1 = H.applyLandslide(rec, { mask, groups: D('landslide-groups.json'), possible: D('landslide-possible.json'), odds: { ready: true, units } });
const r2 = H.applyFloodCombined(rec);
rec.hazSci = { ...(rec.hazSci || {}), reapplied47: { landslide: r1, flood: r2, at: new Date().toISOString() } };
writeFileSync(out, JSON.stringify(rec));
const cnt = (L) => { const c = {}; for (const v of Object.values(L)) c[v] = (c[v] || 0) + 1; return c; };
for (const d of rec.days.slice(0, 1)) for (const k of ['landslide', 'flood', 'flood_riverine', 'flood_pluvial']) console.log(d.date, k, JSON.stringify(cnt(d.layers[k].L)));
