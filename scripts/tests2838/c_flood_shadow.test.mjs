// planned C · the flood shadow (agent 4): two candidates as daily shadow outputs, a flood-truth drop folder and registry, scored later;
// shown on the operator Health page only; the extent model stays served:false.
//  S1 the event return period on the Gumbel line through the fitted 2- and 20-year flows; the JRC map: nearest return period, never below 10
//  S2 D25 from the as-issued archive: days >= 25 mm per tehsil over Pakistan days 0-3 of the morning issue
//  S3 missing inputs: "not assessed" with the reason, never zero
//  S4 the drop folder: a new file is registered once (sha256, window from the name); a file without a date is "not scorable"
//  S5 never served: fx-model.json served false; the agent writes only under data/agents/flood and data/flood-truth (state: never packaged)
//  S6 the server schedules it (daily 07:00 PKT) and the Health page draws its card (operator view only)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { imp, src, json, ok, done } from './lib.mjs';
const F = await imp('scripts/agents/flood_shadow.mjs').catch((e) => ({ __e: e.message }));
if (F.__e) { ok(false, 'scripts/agents/flood_shadow.mjs loads', F.__e); done('C-FLOOD-SHADOW'); }
const rp = F.gumbelRp(15675.7, 9920.4, 15675.7), rp2 = F.gumbelRp(9920.4, 9920.4, 15675.7);
ok(Math.abs(rp - 20) < 0.01 && Math.abs(rp2 - 2) < 0.01, 'S1 Gumbel: the 20-year flow -> 20 years, the 2-year flow -> 2 years', [rp, rp2].map((x) => x.toFixed(3)).join(' '));
const R = [10, 20, 50, 75, 100, 200, 500]; ok(F.rpIndex(3, R) === 0 && F.rpIndex(28, R) === 1 && F.rpIndex(92, R) === 4, 'S1 the JRC map: 3 y -> 1 in 10 (floor), 28 y -> 1 in 20, 92 y -> 1 in 100 (fx_dated_test2 rp_index)');
const D = mkdtempSync(join(tmpdir(), 'fs-')); mkdirSync(join(D, 'archive', 'forecast'), { recursive: true });
const row = (u, tot) => JSON.stringify({ d: '2026-10-22', u, D: tot.map((p, k) => ['2026-10-' + (22 + k), 300, 200, p == null ? null : p * 10, 30, 24]) });
writeFileSync(join(D, 'archive', 'forecast', 'fc_2026-10.jsonl.gz'), gzipSync(Buffer.from([row('A|a|x', [30, 26, 0, 1]), row('B|b|y', [5, 6, 7, 8])].join('\n') + '\n')));
const S = await F.shadowDay({ app: D, dataDir: D, day: '2026-10-22' });
const d25 = S.candidates.rain_d25, c3 = S.candidates.fx_jrc_hand;
ok(d25.status === 'ok' && d25.units['A|a|x'].d25 === 2 && d25.units['B|b|y'].d25 === 0 && d25.withSignal === 1, 'S2 D25: 2 days of 25 mm or more at A, none at B', JSON.stringify(d25.units));
ok(c3.status === 'not assessed' && /not assessed: .*not on this computer/.test(c3.why) && !('reaches' in c3), 'S3 C3 without its inputs: not assessed, with the list of what is missing', c3.why);
mkdirSync(join(D, 'flood-truth', 'drop'), { recursive: true }); writeFileSync(join(D, 'flood-truth', 'drop', 'UNOSAT_20250827_20250828_Punjab.geojson'), '{"type":"FeatureCollection","features":[]}'); writeFileSync(join(D, 'flood-truth', 'drop', 'nodate.geojson'), '{}');
const T1 = F.registerTruth(D), T2 = F.registerTruth(D);
const e = T1.registry.entries.find((x) => /Punjab/.test(x.file)), n = T1.registry.entries.find((x) => /nodate/.test(x.file));
ok(T1.added === 2 && T2.added === 0 && e.window.from === '2025-08-27' && e.window.to === '2025-08-28' && e.sha256.length === 64 && /not scorable/.test(n.status), 'S4 registered once with sha256 and window; a file without a date is not scorable', JSON.stringify(T1.registry.entries.map((x) => [x.id, x.window, x.status])));
rmSync(D, { recursive: true, force: true });
const M = json('data/flood-extent/fx-model.json'); ok(M && M.served === false, 'S5 the river flood extent model stays served:false');
const PR = await imp('scripts/pack-release.mjs'); ok(PR.STATE && PR.STATE.test('data/flood-truth/registry.json') && PR.STATE.test('data/agents/flood/shadow/2026-10-22.json'), 'S5 the shadow and the truth folder are state, never packaged');
const AG = src('server/api/agents.mjs'), PG = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
ok(/'agentFloodShadow'/.test(AG) && /FLOOD_AT_PKT_MIN = 7 \* 60/.test(AG) && /flood: floodReport\(\)/.test(AG), 'S6 scheduled daily from 07:00 PKT; its report on /api/ops/agents (operator scope)');
ok(/id="agnHsFlood"/.test(PG) && /Flood shadow \(operator only; never served\)/.test(PG), 'S6 the Health page card (in the operator-only section)');
done('C-FLOOD-SHADOW');
