// v91.17.283.5 - the left panel's heat / cold tile is chosen by the day's UTCI: the cold stress tile only when the warmest-hour UTCI is below
// 9 °C, the heat tile otherwise, even when the issued cold level is set; with no UTCI the issued cold level above Normal decides.
// Reads the served console (artefact) and runs its own coldGoverns() from the agn-v283-js block; checks that the cold tile is drawn only through it.
// usage: node scripts/tests2835/coldtile.test.mjs     (no server)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const page = readFileSync(join(APP, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
const m = /<script id="agn-v283-js">([\s\S]*?)<\/script>/.exec(page);
ok(!!m, 'the agn-v283-js block is in the served console');
const js = m ? m[1] : '';
const f = /function coldGoverns\(u,C\)\{[^\n]*\}/.exec(js), k = /var UTCI_COLD=(\d+(?:\.\d+)?);/.exec(js);
ok(!!f && !!k, 'coldGoverns() and UTCI_COLD are defined');
const coldGoverns = f && k ? new Function('UTCI_COLD', f[0] + '; return coldGoverns;')(+k[1]) : () => null;
ok(k && +k[1] === 9, 'the cold threshold is 9 °C (UTCI: bottom of "no thermal stress")', k && k[1]);
const cur = (i) => ({ st: 'current', i });
const cases = [
  [34.8, cur(3), false, 'Karachi case: UTCI 34.8 °C with an issued cold level High -> heat tile'],
  [34.8, cur(4), false, 'UTCI 34.8 °C, issued cold Severe -> heat tile'],
  [9, cur(2), false, 'UTCI exactly 9 °C, issued cold Moderate -> heat tile'],
  [20, cur(1), false, 'UTCI 20 °C, issued cold Low -> heat tile'],
  [8.9, cur(0), true, 'UTCI 8.9 °C, issued cold Normal -> cold tile'],
  [-11.4, { st: 'none' }, true, 'UTCI -11.4 °C, no issued run -> cold tile'],
  [NaN, cur(2), true, 'no UTCI, issued cold Moderate -> cold tile'],
  [NaN, cur(0), false, 'no UTCI, issued cold Normal -> heat tile'],
  [NaN, { st: 'load' }, false, 'no UTCI, levels loading -> heat tile'],
];
for (const [u, C, want, name] of cases) ok(coldGoverns(u, C) === want, name, 'got ' + coldGoverns(u, C));
ok(/var gov=coldGoverns\(u,C\);/.test(js), 'the cold tile is drawn only through coldGoverns()');
ok(!/C\.i>0\)\|\|\(isFinite\(u\)&&u<UTCI_COLD\)/.test(js), 'the old rule (any issued cold level above Normal) is gone');
ok(/AGN\.v283coldGoverns=coldGoverns/.test(js), 'coldGoverns() is exposed for the page check (AGN.v283coldGoverns)');
console.log((fail ? 'FAIL' : 'PASS') + ' cold tile by UTCI: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
