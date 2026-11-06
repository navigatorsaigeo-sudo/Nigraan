/* v91.17.269 · F2 · registry exclusions (data/mach-fleet-stations.json 'exclude', with evidence) honoured by the live screen
   (server/api/fleet.mjs) and the history screen (scripts/mach_db_screen.py): an excluded key is a site problem, never a checked
   station, a neighbour, a live-layer reading or a siting-offset reference; the kept twin of each pair stays in use.
   usage: node scripts/tests269/registry.test.mjs   (temporary data folder; starts no server) */
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { createFleet } = await import(join(ROOT, 'server/api/fleet.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const REG = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), 'utf8')); const S = Object.fromEntries(REG.stations.map((s) => [s.key, s]));

/* 1 · the registry itself */
const EX = REG.stations.filter((s) => s.exclude);
{ const WD = REG.stations.filter((s) => !s.exclude && s.excludeWithdrawn).map((s) => s.key);   /* v91.17.278: Khaplu's exclusion withdrawn (outdoor-array screen), kept on record */
  ok(EX.map((s) => s.key).concat(WD).sort().join(',') === 'AKZSFWS,Faizan,PW,PakWeather,RahimyarKhan_avenue,Shah,al_jazari,dha_avenue,expo_avenue,gw1100c_wifi547f,i_9_2,khaplu,mach2,palosa_avenue,sharifabad_avenue,yarhussain_weath' && WD.join(',') === 'khaplu', '1 · the excluded keys (16: v269 F2 + AKZSFWS, v272 OPS 3 + khaplu, v277 MTN; khaplu withdrawn v91.17.278, on record)', EX.map((s) => s.key).sort().join(',')); }
ok(EX.every((s) => ['duplicate', 'mixup', 'indoor', 'site'].includes(s.exclude.kind) && /8-15 Oct 2026|29 Sep - 14 Oct 2026|6-16 Oct 2026/.test(s.exclude.evidence)), '1 · each exclusion names its kind and its measured window');
ok(EX.every((s) => s.exclude.why && s.exclude.evidence && s.exclude.kind && /2026-10-1[67]/.test(s.exclude.decided) && (!s.exclude.of || S[s.exclude.of])), '1 · each exclusion has kind, reason, evidence, date and an existing twin');
ok(['pw_kwu', 'easyweather_wifi_51128', 'nova', 'mach8', 'Tahir', 'easyweatherpro_3', 'danyore', 'wakeel_abad_avenue', 'easyweatherpro_5', 'faizan_sav', 'e_7_4', 'easyweather_wifi_40979', 'sargodha_avenue', 'E11', 'Bad'].every((k) => S[k] && !S[k].exclude), '1 · kept in the registry: the direct console feed of each pair, MACH 8, MACH 55, Tahir and easyweatherpro_3 (two sensors), MACH 108, wakeel_abad_avenue (the history screen still holds E11 / Bad out: one feed id)');
ok(/0\.01 km/.test(S.danyore.check || '') && /Gilgit synoptic station/.test(S.danyore.check), '1 · MACH 108 check recorded', S.danyore.check);
ok(S.danyore.lat === 35.908035 && S.danyore.lon === 74.341667, '1 · MACH 108 stays at the 14 Oct corrected position (Jutial)');
ok(!/\bPMD\b|\bFFD\b|\bMAE\b|Brier|skill/i.test(JSON.stringify(REG.stations)), '1 · registry text is client-safe (no supplier of the national networks, no skill numbers)');
ok(/nightly|every night/.test(S.nova.note || ''), '1 · the nightly silence of nova / expo_avenue is noted', S.nova.note);

/* 2 · the live screen on a synthetic record: a Karachi cluster with PW (excluded) beside pw_kwu, and a station whose only second
   neighbour is excluded */
const tmp = mkdtempSync(join(tmpdir(), 'v269-reg-')); const dataDir = join(tmp, 'data'); mkdirSync(dataDir);
copyFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), join(dataDir, 'mach-fleet-stations.json'));
const RULE = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-siting.json'), 'utf8')).rule;
writeFileSync(join(dataDir, 'mach-siting.json'), JSON.stringify({ rule: RULE, stations: {} }));
const keys = ['PW', 'pw_kwu', 'PakWeather', 'easyweather_wifi_51128', 'nova', 'expo_avenue', 'defence_avenue', 'mach2', 'mach8', 'gw1100c_wifi547f'];
const h0 = Math.floor(Date.now() / 3600e3) * 3600e3 - 14 * 864e5; const RB = { version: 'test', stations: {} };
for (const k of keys) { const s = RB.stations[k] = { lat: S[k].lat, lon: S[k].lon, elevM: 50, basis: { zone: 'plains', model: 'test' }, hours: {} };
  for (let t = h0; t < h0 + 14 * 864e5; t += 3600e3) { const T = 25 + 6 * Math.sin(((new Date(t).getUTCHours() + 5) % 24 - 9) / 24 * 2 * Math.PI) + (k === 'expo_avenue' ? 5 : 0); s.hours[new Date(t).toISOString().slice(0, 13)] = [Math.round(T * 10) / 10, 0.3, null, null]; } }
writeFileSync(join(dataDir, 'mach-running-bias.json'), JSON.stringify(RB));
const F = createFleet({}, tmp, dataDir);
const st = Object.fromEntries(F.statusAll().map((x) => [x.key, x]));
ok(EX.every((s) => st[s.key].verdict === 'excluded'), '2 · every registry exclusion is verdict excluded', JSON.stringify(EX.filter((s) => st[s.key].verdict !== 'excluded').map((s) => s.key)));
ok(/repeats another station/.test(F.stationStatus({ key: 'i_9_2', qc: [], ageMin: 3 }, F.screen('i_9_2')).statusNote) && F.stationStatus({ key: 'yarhussain_weath', qc: [], ageMin: 3 }, F.screen('yarhussain_weath')).statusNote === 'This station is not used.', '2 · client notes follow the exclusion kind (mix-up: repeats another station; site: not used)');
ok(/repeats another station/.test(F.stationStatus({ key: 'PW', qc: [], ageMin: 3 }, F.screen('PW')).statusNote) && /indoor or enclosed/.test(F.stationStatus({ key: 'al_jazari', qc: [], ageMin: 3 }, F.screen('al_jazari')).statusNote), '2 · client notes: "repeats another station\'s sensor", "indoor or enclosed sensor"');
ok(F.screen('pw_kwu').verdict !== 'excluded' && F.screen('easyweather_wifi_51128').verdict !== 'excluded' && F.screen('nova').verdict !== 'excluded', '2 · the kept twins are screened as usual', JSON.stringify(['pw_kwu', 'nova'].map((k) => F.screen(k).verdict)));
/* nova's neighbours within 15 km / 150 m in this record: expo_avenue (excluded, reads 5 C warm) and defence_avenue: one valid neighbour,
   below min_neighbours, so expo_avenue's warm record does not judge nova */
const nv = F.screen('nova'); ok(nv.neighbours === 1, '2 · an excluded key is no neighbour (nova has 1 neighbour, not 2)', JSON.stringify(nv));
ok(F.screen('defence_avenue').neighbours === 1, '2 · ... and defence_avenue the same', JSON.stringify(F.screen('defence_avenue')));

/* 3 · the history screen applies the same exclusion */
const py = process.platform === 'win32' ? 'python' : 'python3';
try { const out = execFileSync(py, ['-I', '-c', 'import json,importlib.util,sys; spec=importlib.util.spec_from_file_location("m", sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); reg={s["key"]:s for s in json.load(open(sys.argv[2],encoding="utf-8"))["stations"]}; print(json.dumps([m.registry_exclusion(reg,"PW"), m.registry_exclusion(reg,"pw_kwu"), m.registry_exclusion(reg,"al_jazari")]))', join(ROOT, 'scripts', 'mach_db_screen.py'), join(ROOT, 'data', 'mach-fleet-stations.json')], { encoding: 'utf8' });
  const r = JSON.parse(out.trim().split('\n').pop()); ok(/one device under two keys/.test(r[0]) && r[1] === null && /indoor/.test(r[2]), '3 · scripts/mach_db_screen.py registry_exclusion: same keys, same reasons', out.trim()); }
catch (e) { ok(/No module named '(numpy|pandas)'/.test(String(e.stderr || e.message)), '3 · history screen check skipped (numpy/pandas not installed here)', String(e.stderr || e.message).slice(0, 200)); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
