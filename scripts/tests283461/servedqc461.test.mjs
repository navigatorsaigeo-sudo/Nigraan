/* v91.17.283.46 (NIGRAAN 1.0.8.1) · the Skardu 47 C defect of 2 Nov 2026.
   (1) the served-value plausibility screen (server/api/servedqc.mjs) withholds the Skardu hours and keeps plausible ones, on the tree's own
   data/fleet-range-screen.json; (2) the national tehsil run is anchor-free (national.mjs optsOf ewsLive:false, verification.mjs live stage);
   (3) the EWS live anchor never moves an hour by more than the residual range; (4) replay of the laptop's 2 Nov 03 UTC national records
   (if staged): every hour the screen flags is listed. usage: node scripts/tests283461/servedqc461.test.mjs [laptop records json] */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const D = join(ROOT, 'data');
const Q = await import(pathToFileURL(join(ROOT, 'server', 'api', 'servedqc.mjs')).href);
let fails = 0; const ok = (c, m, i) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && i != null ? ' :: ' + String(i).slice(0, 300) : '')); if (!c) fails++; };
const b = Q.servedBound(D, 11); ok(b && b.hi === 39.5 && b.lo === -18.4, 'November bound from data/fleet-range-screen.json: hi 39.5 C (GSOD), lo -18.4 C', JSON.stringify(b));
ok(!!Q.servedImplausible(D, 47, '2026-11-02T07:00') && !!Q.servedImplausible(D, 46.8, '2026-11-02T08:00'), 'Skardu 47 C / 46.8 C on 2 Nov: withheld');
ok(Q.servedImplausible(D, 20.1, '2026-11-02T12:00') === null && Q.servedImplausible(D, -12, '2026-11-02T05:00') === null, 'plausible November hours (20.1 C, -12 C) pass');
ok(Q.servedImplausible(D, 47, '2026-06-02T14:00') === null, 'June 47 C passes (the June record is 50.5 C)');
process.env.NIGRAAN_SERVED_QC = '0'; ok(Q.servedImplausible(D, 47, '2026-11-02T07:00') === null, 'NIGRAAN_SERVED_QC=0 switches the screen off'); delete process.env.NIGRAAN_SERVED_QC;
const nat = readFileSync(join(ROOT, 'server', 'api', 'national.mjs'), 'utf8'), ver = readFileSync(join(ROOT, 'server', 'api', 'verification.mjs'), 'utf8'), ews = readFileSync(join(ROOT, 'server', 'api', 'ewsshadow.mjs'), 'utf8'), ps = readFileSync(join(ROOT, 'server', 'api', 'pointstate.mjs'), 'utf8');
ok(/const optsOf = \(k\) => \(\{[^)]*ewsLive: false/.test(nat), 'the national tehsil run asks the chain without the EWS live anchor (its own basis)');
ok(/o\.live !== false && o\.ewsLive !== false && !!\(app\.ewsAnchor/.test(ver), 'the live stage skips the EWS anchor when ewsLive is false (MACH live layer unchanged)');
ok(/if \(!inResidualRange\(a\.raw\)\) return false;/.test(ews), 'the anchor is not applied when its residual is beyond the residual range (v283.47: whole anchor, not per hour)');
ok(/const QC = curveCheck\(dataDir,/.test(ps) && /qc: \{ withheld: qcHeld/.test(ps), 'every served point record passes the curve check and lists withheld hours (v283.47)');
const F = process.argv[2];
if (F && existsSync(F)) { const R = JSON.parse(readFileSync(F, 'utf8')); let n = 0; const hit = [];
  for (const x of R) { const H = x.hourly || {}; (H.time || []).forEach((t, i) => { const T = (H.temperature_2m || [])[i]; n++; const pkt = new Date(Date.parse(String(t).replace(/Z?$/, 'Z')) + 5 * 3600e3).toISOString().slice(0, 16); if (Q.servedImplausible(D, T, pkt)) hit.push(x.unitKey + ' ' + pkt + ' ' + T); }); }
  console.log('replay ' + F.split('/').pop() + ': ' + n + ' tehsil hours, withheld ' + hit.length + (hit.length ? ': ' + hit.slice(0, 8).join('; ') : ''));
  ok(hit.some((h) => /Mulkhow 2026-11-02T08:00 -32\.4/.test(h)), 'replay: the cold runaway of the same loop in the national run (Mulkhow -32.4 C at 08:00 PKT) is withheld', hit.join('; ')); }
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
