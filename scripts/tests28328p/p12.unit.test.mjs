/* v91.17.283.28 · P12 · the console's station table prints a missing reading as "—", never 0 (every reading cell goes through n0/n1, which
   map null to "—"; no "||0" default on a reading). The fleet bias numbers are made by the server (fleet.mjs scoreNow): the page prints them
   as served (their station selection is a server item). usage: node scripts/tests28328p/p12.unit.test.mjs */
import { T, src, MACH, script } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH), O = script(S, 'agn-obs-js');
ok(O && /function n1\(v\)\{ return v==null\|\|!isFinite\(v\)\?'—'/.test(O) && /function n0\(v\)\{ return v==null\|\|!isFinite\(v\)\?'—'/.test(O), 'P12 n0 / n1 print a missing value as "—"');
ok(/rd\(r,n1\(r\.tempC\)\)\+'<\/td><td>'\+rd\(r,n0\(r\.rhPct\)\)\+'<\/td><td>'\+rd\(r,n1\(r\.dewC\)\)\+'<\/td><td>'\+rd\(r,n0\(r\.windKmh\)\)/.test(O), 'P12 temperature, humidity, dew point and wind cells all go through n0 / n1');
ok(!/windKmh\s*\|\|\s*0|rhPct\s*\|\|\s*0/.test(O), 'P12 no reading defaults to 0');
done();
