// v91.17.283.9 · the river truth adapter (operator only, never served): a gauge sheet dropped by the operator is cleaned with the rules
// of the owner's Shahdara sheet, registered once, and scored as a shadow (GloFAS flow, the served flood-chance coefficients, persistence
// and climatology). Nothing reaches a served value: the server does not schedule it and no API names it.
//  R1 time parsing: dd/mm/yyyy HH, dd-mm-yyyy HH, yyyy-mm-dd HH:MM; hour 24 = 00 next day; 00 listed after 18:00 = 00 next day
//  R2 non-numeric / zero = missing; an isolated 3x one-reading excursion = missing (JUMP); the 06:00 reading and the day maximum
//  R3 drop registry: once per file (sha256); no unit -> not scorable; unknown gauge -> not scorable
//  R4 classes on the official limits (thousand cusecs 40/65/90/135/180); chances = server/api/riverprob.mjs on the same inputs
//  R5 scoring writes only under data/agents/river and data/flood-truth/river (operator state, never packaged); not served
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { imp, src, json, ok, done } from '../tests2838/lib.mjs';
const F = await imp('scripts/agents/river_truth.mjs').catch((e) => ({ __e: e.message }));
if (F.__e) { ok(false, 'scripts/agents/river_truth.mjs loads', F.__e); done('RIVER-TRUTH'); }
const sheet = ['Time,Inflow (cusecs)', '2021-06-14 06:00,10000', '15/06/2021 06,11000', '15/06/2021 12,12000', '15/06/2021 18,13000', '15/06/2021 00,14000',
  '16/06/2021 06,**', '16/06/2021 12,0', '16/06/2021 18,40000', '16/06/2021 24,15000', '08-08-2021 12,9000', '17/06/2021 06,16000', '17/06/2021 12,1600', '17/06/2021 18,16500'].join('\n');
const R = F.parseSheet(sheet, 'cusecs');
const at = (iso) => R.find((r) => r.ms === Date.parse(iso + ':00Z'));
ok(at('2021-06-16T00:00') && at('2021-06-16T00:00').flags.includes('H00_NEXTDAY') && at('2021-06-17T00:00') && at('2021-06-17T00:00').flags.includes('H24') && at('2021-08-08T12:00'), 'R1 00-after-18 and hour 24 -> 00 of the next day; dd-mm-yyyy parsed', R.filter((r) => r.flags.length).map((r) => r.row + ':' + r.flags.join('+')).join(' '));
ok(at('2021-06-16T06:00').q === null && at('2021-06-16T06:00').flags.includes('NONNUM') && at('2021-06-16T12:00').flags.includes('ZERO'), 'R2 ** and 0 are missing, not values');
ok(at('2021-06-17T12:00').flags.includes('JUMP') && at('2021-06-17T12:00').q === null, 'R2 1,600 between 16,000 and 16,500 is an isolated excursion (JUMP)');
ok(!at('2021-06-16T18:00').flags.includes('JUMP'), 'R2 40,000 between 13,000 (-12 h) and 15,000 (+6 h) is 3.1x and 2.7x: not both above 3x, so kept', at('2021-06-16T18:00').flags.join(',') || 'none');
const D = F.daily(R); const d15 = D.find((d) => d.date === '2021-06-15'), d17 = D.find((d) => d.date === '2021-06-17');
ok(d15.q06 === 11 && d15.qmax === 13 && d17.q06 === 16 && d17.qmax === 16.5, 'R2 daily: the 06:00 reading and the day maximum, thousand cusecs', JSON.stringify([d15, d17]));
const T = mkdtempSync(join(tmpdir(), 'rt-')); const drop = join(T, 'flood-truth', 'river', 'drop'); mkdirSync(drop, { recursive: true });
writeFileSync(join(drop, 'shahdara_2021_cusecs.csv'), sheet); writeFileSync(join(drop, 'shahdara_nounit.csv'), 'Time,Inflow\n15/06/2021 06,11000\n'); writeFileSync(join(drop, 'jassar_2021_kcusecs.csv'), 'Time,Inflow\n15/06/2021 06,11\n');
const G1 = F.registerRiverTruth(T), G2 = F.registerRiverTruth(T); const E = (n) => G1.registry.entries.find((e) => e.file.endsWith(n));
ok(G1.added === 3 && G2.added === 0 && E('shahdara_2021_cusecs.csv').status === 'registered' && E('shahdara_2021_cusecs.csv').sha256.length === 64 && /state the unit/.test(E('shahdara_nounit.csv').status) && /no known gauge/.test(E('jassar_2021_kcusecs.csv').status), 'R3 registered once; no unit / unknown gauge -> not scorable');
ok(F.classOf(39.78, [40, 65, 90, 135, 180]) === 0 && F.classOf(40, [40, 65, 90, 135, 180]) === 1 && F.classOf(213.4, [40, 65, 90, 135, 180]) === 5 && F.CLASSES[5] === 'Exceptional', 'R4 classes: 39.78 Below Low, 40 Low, 213.4 Exceptional (2025-08-29)');
// chances: the same numbers as server/api/riverprob.mjs on the same inputs
const M = json('data/river-prob-model.json'); const RP = await imp('server/api/riverprob.mjs');
const fake = mkdtempSync(join(tmpdir(), 'rp-')); const now = new Date().toISOString(); const day = now.slice(0, 10);
const RA = { rp2: 1240.1, p95: Array(24).fill(600) };
writeFileSync(join(fake, 'river-prob-model.json'), JSON.stringify({ ...M, reaches: ['shahdara'] }));
writeFileSync(join(fake, 'river-rarity.json'), JSON.stringify({ reaches: { shahdara: { levels: { rp2: RA.rp2 }, seasonal: Array(24).fill([0, 0, 0, 600, 0]) } } }));
writeFileSync(join(fake, 'flood.json'), JSON.stringify({ forecast: { at: now, days: [day], points: { shahdara: { point: { name: 'Shahdara' }, days: [{ date: day, q: [0, 2493.6, 0] }] } } } }));
const N = RP.createRiverProb(fake).national(); const srv = N.reaches.shahdara.days[0].p; const mine = F.chances(M, 2493.6, RA, day);
ok(srv && Math.abs(srv['1'] - Math.round(mine['1'] * 1000) / 10) < 0.051 && Math.abs(srv['2'] - Math.round(mine['2'] * 1000) / 10) < 0.051, 'R4 chances equal server/api/riverprob.mjs on the same flow and rarity', JSON.stringify([srv, mine]));
// end to end with a tiny GloFAS station file
const lake = join(T, 'lake'); mkdirSync(join(lake, 'archive', 'glofas'), { recursive: true });
const rows = ['date,Jassar,Shahdara']; for (let t = Date.UTC(1997, 0, 1); t <= Date.UTC(2021, 11, 31); t += 864e5) { const d = new Date(t).toISOString().slice(0, 10); const doy = (t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / 864e5; rows.push(d + ',1,' + (100 + 900 * Math.exp(-(((doy - 200) / 20) ** 2)) * (1 + (new Date(t).getUTCFullYear() % 7) / 7)).toFixed(1)); }
writeFileSync(join(lake, 'archive', 'glofas', 'glofas_irsa_daily.csv.gz'), gzipSync(Buffer.from(rows.join('\n') + '\n')));
writeFileSync(join(T, 'river-prob-model.json'), JSON.stringify(M));
const S = F.scoreStation({ dataDir: T, lake, station: 'shahdara' });
ok(S.status === 'ok' && S.summary.served === false && S.summary.days >= 4 && S.summary.model.rarity && S.summary.model.rarity.years === 25, 'R5 scored end to end (shadow, served:false)', JSON.stringify({ days: S.summary.days, model: S.summary.model.maeKcs, rarity: S.summary.model.rarity }));
const written = []; const walk = (d, p = '') => { for (const n of readdirSync(d, { withFileTypes: true })) { const q = p ? p + '/' + n.name : n.name; if (n.isDirectory()) walk(join(d, n.name), q); else written.push(q); } }; walk(T);
const PR = await imp('scripts/pack-release.mjs');
ok(written.filter((f) => !/^(lake\/|river-prob-model\.json$|flood-truth\/river\/drop\/)/.test(f)).every((f) => /^(agents\/river\/|flood-truth\/river\/registry\.json$)/.test(f)) && PR.STATE.test('data/agents/river/shahdara/summary.json') && PR.STATE.test('data/flood-truth/river/registry.json'), 'R5 writes only data/agents/river and data/flood-truth/river (operator state, never packaged)', written.join(' '));
ok(!/river_truth/.test(src('server/api/agents.mjs')) && !/river_truth/.test(src('server/api/index.mjs')) && !/river_truth/.test(src('server/api/riverprob.mjs')), 'R5 not scheduled and not named by any served API (ready, not wired)');
ok(!(json('data/river-prob-model.json').reaches || []).includes('shahdara') && !/shahdara/i.test(JSON.stringify(Object.keys((json('data/flood-glofascal/glofascal.json') || {}).reaches || {}))), 'R5 Shahdara is in neither the flood-chance reaches nor the GloFAS calibration (both failed their held-out rule)');
rmSync(T, { recursive: true, force: true }); rmSync(fake, { recursive: true, force: true });
done('RIVER-TRUTH');
