// W3 · /api/outlook/unit by point: the temperature percentiles are at the point's terrain height (standard lapse, read from
// data/engineering-references.json), labelled; by name, nothing changes. Without a lapse rate on file nothing moves and it is labelled
// "area outlook at N m".
import { mkdtempSync, writeFileSync, symlinkSync, copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, src, ok, done, TREE } from './lib.mjs';
const O = await imp('server/api/outlook.mjs');
const units = JSON.parse(readFileSync(join(TREE, 'server', 'contract', 'units.json'), 'utf8'));
const mur = units.find((u) => u.tehsil === 'Murree');
const mk = (withLapse) => { const dir = mkdtempSync(join(tmpdir(), 'w3-')); symlinkSync(join(TREE, 'data', 'feat'), join(dir, 'feat'));
  const ER = join(TREE, 'data', 'engineering-references.json'), ERL = '/tmp/claude-0/x/code/nig/nigraan-local/data/engineering-references.json';
  if (withLapse) copyFileSync(existsSync(ER) ? ER : ERL, join(dir, 'engineering-references.json'));
  const days = ['2026-10-22', '2026-10-23']; const row = { tx: [20, 22.9, 25], tn: [10, 12, 14], at: [19, 21, 23], pr: [0, 0, 1], gu: [20, 30, 40], sn: [0, 0, 0], n: 51, p: { tx40: 0 } };
  writeFileSync(join(dir, 'outlook.json'), JSON.stringify({ ensemble: { at: '2026-10-22T00:00:00Z', members: 51, days, units: { [mur.unitId]: [row, row] }, events: {} } }));
  const app = { units: { tehsil: units }, store: { find: () => null, filter: () => [] }, verification: {}, provider: { configured: () => false } };
  return { dir, o: O.createOutlook(app, dir) }; };
const A = mk(true);
const byName = A.o.unit(mur.unitId), byPt = A.o.unit(mur.unitId, { lat: 33.90836, lon: 73.3903 });
ok(byName && byName.ensemble && byName.ensemble.days[0].tx[1] === 22.9 && !byName.heightBasis, 'by name: unchanged (tehsil height), no height label');
const hb = byPt && byPt.heightBasis;
ok(hb && hb.mode === 'point' && hb.pointElevM > 1800 && hb.areaElevM === mur.elevM, 'W3 by point: the point terrain height is used (' + (hb && hb.pointElevM) + ' m vs tehsil ' + mur.elevM + ' m)', JSON.stringify(hb));
const exp = Math.round((22.9 + hb.shiftC) * 10) / 10;
ok(byPt.ensemble.days[0].tx[1] === exp && hb.shiftC < 0, 'W3: Tmax P50 moved by the lapse to the point (' + byPt.ensemble.days[0].tx[1] + ' C, shift ' + hb.shiftC + ')');
ok(byPt.ensemble.days[0].pr[1] === 0 && byPt.ensemble.days[0].p.tx40 === 0 && /area outlook at/.test(hb.label), 'W3: rain and probabilities stay the area\'s and are labelled', hb.label);
const B = mk(false); const nb = B.o.unit(mur.unitId, { lat: 33.90836, lon: 73.3903 });
ok(nb.heightBasis && nb.heightBasis.mode === 'area' && /area outlook at/.test(nb.heightBasis.label) && nb.ensemble.days[0].tx[1] === 22.9, 'W3: no lapse rate on file -> nothing moved, labelled "area outlook at N m"', JSON.stringify(nb.heightBasis));
ok(/O\.unit\(hit\.u\.unitId, hit\.pt \|\| null\)/.test(src('server/api/index.mjs')), 'W3: /api/outlook/unit passes the point when resolved by point');
for (const x of [A, B]) rmSync(x.dir, { recursive: true, force: true });
done('W3-OUTLOOKPOINT');
