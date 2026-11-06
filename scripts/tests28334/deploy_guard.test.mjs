/* v91.17.283.34 · the deploy's LEARN_ALL guard (scripts/deploy/templates/DEPLOY.ps1.tpl, Test-LearnBusy): the forecast archive harvester
   (fc_archive_harvest.py, run for hours by the server as the pyjob fcArchive) does not block a deploy; every other station-lake job and the
   LEARN_ALL window still do. No PowerShell here: the test reads the function from the template, checks its shape and that the guard calls
   it, and applies its two patterns (PowerShell -match / -replace: case-insensitive regex, the same syntax) to real command lines.
   usage: node scripts/tests28334/deploy_guard.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const T = readFileSync(join(ROOT, 'scripts', 'deploy', 'templates', 'DEPLOY.ps1.tpl'), 'latin1');
const busyRe = (T.match(/^\$LEARN_BUSY_RE = '([^']+)'$/m) || [])[1], exRe = (T.match(/^\$LEARN_EXEMPT_RE = '([^']+)'$/m) || [])[1];
ok(busyRe === 'station-lake[\\\\/]scripts[\\\\/]' && exRe === 'station-lake[\\\\/]scripts[\\\\/]fc_archive_harvest\\.py', 'G1 the two patterns are declared', busyRe + ' | ' + exRe);
const fn = (T.match(/function Test-LearnBusy\(\[string\]\$nm, \[string\]\$cl\) \{\r?\n([\s\S]*?)\r?\n\}/) || [])[1] || '';
ok(/if \(\$nm -eq 'cmd\.exe' -and \$cl -match 'LEARN_ALL'\) \{ return \$true \}/.test(fn) && /\$rest = \$cl -replace \$LEARN_EXEMPT_RE, ''/.test(fn) && /return \(\$rest -match \$LEARN_BUSY_RE\)/.test(fn), 'G1 Test-LearnBusy: LEARN_ALL window busy; the harvester removed from the command line; any other station-lake script busy', fn);
ok(/Get-CimInstance Win32_Process -ErrorAction Stop \| Where-Object \{ Test-LearnBusy \(\[string\]\$_\.Name\) \(\[string\]\$_\.CommandLine\) \}/.test(T), 'G1 the guard filters the process list with Test-LearnBusy');
ok(T.indexOf('function Test-LearnBusy') < T.indexOf('Where-Object { Test-LearnBusy'), 'G1 the function is defined before the guard uses it');
ok(![...T].some((c) => c.charCodeAt(0) > 127), 'G1 the template is ASCII (Windows PowerShell 5.1)');
const B = new RegExp(busyRe, 'i'), X = new RegExp(exRe, 'gi');
const busy = (nm, cl) => (nm.toLowerCase() === 'cmd.exe' && /LEARN_ALL/i.test(cl)) || B.test(cl.replace(X, ''));
const C = [
  ['python.exe', '"D:\\NIGRAAN\\runtime\\python313\\python.exe" D:\\NIGRAAN\\nig\\station-lake\\scripts\\fc_archive_harvest.py --app D:\\NIGRAAN\\nig\\nigraan-local --daily', false, 'the pyjob fcArchive (the server\'s harvester)'],
  ['python.exe', '"D:\\NIGRAAN\\runtime\\python313\\python.exe" "D:\\NIGRAAN\\nig\\station-lake\\scripts\\fc_archive_harvest.py" --app "D:\\NIGRAAN\\nig\\nigraan-local" --lake "D:\\NIGRAAN\\nig\\station-lake"', false, 'HARVEST.bat\'s harvester'],
  ['python.exe', 'python D:/NIGRAAN/nig/station-lake/scripts/FC_ARCHIVE_HARVEST.py', false, 'the harvester, forward slashes, other case'],
  ['python.exe', 'python D:\\NIGRAAN\\nig\\station-lake\\scripts\\ews_sync.py', true, 'the pyjob ewsSync'],
  ['python.exe', 'python D:\\NIGRAAN\\nig\\station-lake\\scripts\\retrain_produce.py --app D:\\NIGRAAN\\nig\\nigraan-local', true, 'the pyjob retrainInputs'],
  ['python.exe', 'python D:\\NIGRAAN\\nig\\station-lake\\scripts\\auto_retrain.py check', true, 'the monthly retrain'],
  ['python.exe', 'python D:\\NIGRAAN\\nig\\station-lake\\scripts\\fc_archive_harvest_old.py', true, 'a different script whose name starts like the harvester'],
  ['python.exe', 'python D:\\NIGRAAN\\nig\\station-lake\\scripts\\fc_archive_harvest.py && python D:\\NIGRAAN\\nig\\station-lake\\scripts\\sponge250.py', true, 'a command line naming the harvester and another station-lake script'],
  ['cmd.exe', 'C:\\Windows\\system32\\cmd.exe /c ""D:\\NIGRAAN\\nig\\nigraan-local\\LEARN_ALL.bat" "', true, 'the LEARN_ALL window'],
  ['cmd.exe', 'C:\\Windows\\system32\\cmd.exe /c ""D:\\NIGRAAN\\_admin\\harvest\\HARVEST.bat" "', false, 'the HARVEST.bat window (its Python process is the harvester)'],
  ['node.exe', '"C:\\Program Files\\nodejs\\node.exe" D:\\NIGRAAN\\nig\\nigraan-local\\server\\server.mjs', false, 'the NIGRAAN server'],
  ['notepad.exe', 'notepad D:\\NIGRAAN\\nig\\station-lake\\scripts\\verify_issued.py', true, 'any process naming another station-lake script (as before)']];
for (const [nm, cl, want, what] of C) ok(busy(nm, cl) === want, 'G2 ' + what + ': ' + (want ? 'blocks' : 'does not block') + ' the deploy', cl);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
