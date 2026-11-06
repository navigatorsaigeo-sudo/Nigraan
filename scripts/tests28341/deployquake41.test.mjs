/* v91.17.283.41 (NIGRAAN 1.0.5) · item 38 · the deploy script's quake de-dup check judges the parsed answer correctly: an event time is an
   ISO string (Windows PowerShell 5.1 ConvertFrom-Json) or epoch ms, a source is an object with .source (or a string). The 1.0.4 template cast
   ISO strings to [double] and compared source objects as strings: 9 false "unmerged pairs" on the live laptop where there were none.
   Runs the template's own lines (between the "$one = " line and the "if ($dup)" line) in PowerShell on fixture answers.
   usage: node scripts/tests28341/deployquake41.test.mjs [tree]   (SKIP when no pwsh / powershell is on this machine) */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { spawnSync } from 'node:child_process';
const T = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : new URL('../..', import.meta.url).pathname.replace(/\/$/, ''));
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + String(i).slice(0, 600))); if (!c) f++; };
const PS = [process.env.PWSH, '/tmp/claude-0/x/pwsh/pwsh', 'pwsh', 'powershell'].filter(Boolean).find((p) => { try { return spawnSync(p, ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0; } catch (_) { return false; } });
if (!PS) { console.log('SKIP no PowerShell on this machine'); process.exit(77); }
const tpl = readFileSync(join(T, 'scripts/deploy/templates/DEPLOY.ps1.tpl'), 'utf8');
const a = tpl.indexOf('  $one = @($qe | Where-Object'), b = tpl.indexOf('  if ($dup) {', a); const block = tpl.slice(a, b);
ok(a > 0 && b > a && /\$qSrc = /.test(block) && /\$qMs = /.test(block) && !/\[double\]\$a\.time/.test(block) && !/\[string\]@\(\$a\.sources\)\[0\]/.test(block), 'Q1 the template parses times and reads .source (no [double] cast of a time, no string compare of a source object)', block.slice(0, 400));
const D = mkdtempSync(join(tmpdir(), 'dq41-'));
const run = (events, label) => { const j = join(D, 'ev.json'); writeFileSync(j, JSON.stringify({ events })); const ps1 = join(D, 't.ps1');
  writeFileSync(ps1, "$ql = @{ json = (Get-Content -Raw -LiteralPath '" + j + "' | ConvertFrom-Json) }; $qs = @{ json = @{ mergeRule = @{ seconds = 60; km = 100; wideKm = 300 } } }\n$qe = @($ql.json.events); $dup = 0\n" + block + "\nWrite-Output ('DUP=' + $dup)\n");
  const r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8' }); const m = /DUP=(\d+)/.exec(r.stdout || ''); return { dup: m ? +m[1] : null, out: (r.stdout || '') + (r.stderr || ''), label }; };
const ev = (id, src, iso, lat, lon) => ({ id, time: iso, lat, lon, source: src, sources: [{ source: src, id, mag: 4.1, lat, lon, time: iso }] });
/* the live shape: ISO times, source objects; 9 single-agency events far apart in time (no true pair) */
const far = Array.from({ length: 9 }, (_, i) => ev('e' + i, i % 2 ? 'EMSC' : 'USGS', new Date(Date.parse('2026-10-20T00:00:00Z') + i * 86400e3).toISOString(), 33 + i * 0.1, 72));
const r1 = run(far, 'far'); ok(r1.dup === 0, 'Q2 nine single-agency events days apart (ISO times, source objects): 0 pairs (1.0.4 counted 9)', r1.out);
/* a true pair: USGS-only and EMSC-only 20 s and 140 km apart (inside the wide 300 km pass): counted */
const pair = [ev('u1', 'USGS', '2026-10-26T10:00:00Z', 34.0, 73.0), ev('m1', 'EMSC', '2026-10-26T10:00:20Z', 35.2, 73.4)];
const r2 = run(pair, 'pair'); ok(r2.dup === 1, 'Q3 a true unmerged pair (20 s, ~140 km, different agencies) is still counted (the warning stays)', r2.out);
/* the same agency twice is never a pair; epoch-ms times still work */
const same = [ev('u1', 'USGS', '2026-10-26T10:00:00Z', 34.0, 73.0), ev('u2', 'USGS', '2026-10-26T10:00:10Z', 34.1, 73.0)];
ok(run(same, 'same').dup === 0, 'Q4 two events of the same agency are not a pair');
const ms = pair.map((e) => ({ ...e, time: Date.parse(e.time) })); ok(run(ms, 'ms').dup === 1, 'Q5 epoch-millisecond times parse the same');
rmSync(D, { recursive: true, force: true });
console.log('\n' + (n - f) + ' passed, ' + f + ' failed'); process.exit(f ? 1 : 0);
