// v91.17.278 · FIX278 · static and server checks. usage: node scripts/tests278/fix278.test.mjs [http://127.0.0.1:PORT]
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const BASE = process.argv[2] || process.env.BASE || null;
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
/* v91.17.278.1 · FIX2781: a v278 patch release (91.17.278.N) carries these checks too */
const pkg = JSON.parse(src('package.json')); ok(/^91\.17\.(278(\.\d+)?|279(\.\d+)?|280(\.\d+)?|281(\.\d+)?|282(\.\d+)?|283(\.\d+)?)$/.test(pkg.version), 'V package.json is 91.17.278 or a later release (279-283: version bumps)', pkg.version);
const mf = JSON.parse(src('artefact/MANIFEST.json')); const html = readFileSync(join(ROOT, 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'));
ok(mf['AI_GEO_NIGRAAN_v91_17_MACH.html'].sha256 === createHash('sha256').update(html).digest('hex') && mf['AI_GEO_NIGRAAN_v91_17_MACH.html'].bytes === html.length, 'V the page matches its MANIFEST entry');
const H = html.toString('utf8');
ok(!/\(X\.evl\|\|\{\}\)\[k\]\|\|k|esc\(L\[k\]\|\|k\)/.test(H) && /function evName\(X,k\)/.test(H) && /rainUnion:'Heavy or extreme rain/.test(H) && /windAny:'Strong gusts/.test(H), '1 the report kit names events through evName (no key fallback), with plain names for the combined counts');
ok(!/\['Station','Distance','Status','Highest','Lowest','Rain','Days with readings'\]/.test(H) && /\['Station','Distance','Status','Highest','Lowest','Days with readings'\]/.test(H), '2c the station table has no Rain column');
ok(/_rcAny/.test(H) && /is withheld: it needs the forecast rain of the day after/.test(H), '3 a calibrated rain chance withheld at every threshold gives no level, with the reason');
ok(/D0\.get=function\(\)\{ return day; \}/.test(H), '3 the site report scores each day with that day\'s rain chance');
const AI = src('server/api/ai.mjs'); ok(/filter\(\(\[k, v\]\) => v >= 10 && CHN\[k\]\)/.test(AI) && !/gu60: 'gusts ≥60 km\/h' \}\[k\] \|\| k\)/.test(AI), '1 AI answers: a chance with no plain name is left out, not printed by its key');
const REG = JSON.parse(src('data/mach-fleet-stations.json')); const kh = REG.stations.find((s) => s.key === 'khaplu');
ok(kh && !kh.exclude && kh.excludeWithdrawn && /outdoor-array screen/.test(kh.excludeWithdrawn.withdrawn) && kh.excludeWithdrawn.evidence, '5 Khaplu: the exclusion is withdrawn and kept on record with its evidence');
{ const tmp = mkdtempSync(join(tmpdir(), 'fix278-')); const dd = join(tmp, 'data'); mkdirSync(dd); writeFileSync(join(dd, 'mach-fleet-stations.json'), JSON.stringify(REG));
  writeFileSync(join(dd, 'mach-siting.json'), JSON.stringify({ rule: JSON.parse(src('data/mach-siting.json')).rule, stations: {} })); writeFileSync(join(dd, 'mach-running-bias.json'), JSON.stringify({ version: 't', stations: {} }));
  const { createFleet } = await import(pathToFileURL(join(ROOT, 'server/api/fleet.mjs')).href);
  /* v91.17.283 (owner decision D, WS2): Khaplu is HELD through data/station-holds.json until its outdoor data is verified (the registry
     exclusion stays withdrawn); clearing the hold (the "cleared" field) brings it back with no code change */
  /* v91.17.283.14 · owner decision 24 Oct 2026: no hold and no registry exclusion drops a station; Khaplu's and Al-Jazari's values are
     judged one by one (obsqc.mjs: their silent outdoor array and their off readings fail, the rest passes) */
  const F = createFleet({}, tmp, dd);
  ok(F.excluded === undefined && (!F.screen('khaplu') || F.screen('khaplu').verdict !== 'excluded') && (!F.screen('al_jazari') || F.screen('al_jazari').verdict !== 'excluded'), '5 fleet: no station is held or excluded (values are judged by obsqc.mjs)'); }
const SS = src('server/api/stuckscreen.mjs'); ok(/ELEV_DEG: 10, RUN_MIN: 0/.test(SS) && /arraySilent/.test(src('server/api/fleet.mjs')) && /S: v\(iSo\)/.test(src('server/api/past30parse.mjs')) && /S: r\.S, W: r\.W, G: r\.G/.test(src('server/api/accmon.mjs')),
  '5 the outdoor-array screen is applied on every path: live poll, fleet history, past-30 record, accuracy backfill (v283.28: the LAMHA MACH copy path is retired)');
if (BASE) {
  const j = await fetch(BASE + '/api/report/past30?lat=31.5204&lon=74.3587', { headers: { 'X-Agn-View': 'customer' } }).then((r) => r.json()).catch(() => null);
  const S = (j && j.stations) || [];
  /* v91.17.278.1 · FIX2781: a station the server has not polled yet (fleet check: pending) carries no status, never "no reading received" */
  const FC = await fetch(BASE + '/api/fleet/check').then((r) => r.json()).catch(() => null); const pend = new Set(((FC && FC.stations) || []).filter((x) => x.pending).map((x) => x.name));
  ok(j && j.ok && S.length && S.every((s) => s.name && s.name !== 'MACH station' && (s.status || pend.has(s.name)) && !/No reading received/.test(s.statusNote || '') && s.rainMm == null) && S.every((s) => s.current !== false || (s.tmaxC == null && s.tminC == null)), '2 server: Lahore stations within 25 km are named, carry their status (none while pending a first poll), no rain, and a station whose readings stop early has no highs and lows', JSON.stringify(S.map((s) => [s.name, s.status, s.current, s.tmaxC])));
} else console.log('SKIP server checks (no address)');
console.log(`\n${fail ? 'FAIL' : 'PASS'} fix278: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
