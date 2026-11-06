/* v91.17.283.40 item 31a: the earthquake reference layer shows the building-code zone CODE and its PGA band beside the word, from
   data/seismic-units.json (BCP SP-2007 Table 2.2 zones, Table 2.1 PGA bands), for the words and every tehsil fact. The PGA bands are
   checked against BCP SP-2007 Table 2.1 (Zone 1 0.05-0.08 g, 2A 0.08-0.16 g, 2B 0.16-0.24 g, 3 0.24-0.32 g, 4 > 0.32 g).
   node seismic40.test.mjs [tree] */
import { readFileSync } from 'node:fs'; import { join } from 'node:path'; import { pathToFileURL } from 'node:url';
const tree = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : new URL('../..', import.meta.url).pathname.replace(/\/$/, ''));
const S = JSON.parse(readFileSync(join(tree, 'data/seismic-units.json'), 'utf8'));
const { createRefLayers } = await import(pathToFileURL(join(tree, 'server/api/reflayers.mjs')).href);
const units = Object.keys(S.tehsils).map((k) => ({ unitId: k, key: k }));
const R = createRefLayers({ units: { tehsil: units } }, join(tree, 'data'));
let p = 0, f = 0; const ok = (c, m) => { if (c) p++; else { f++; console.log('FAIL', m); } };
const BCP = { '1': '0.05-0.08 g', '2A': '0.08-0.16 g', '2B': '0.16-0.24 g', '3': '0.24-0.32 g', '4': '> 0.32 g' };
for (const [z, b] of Object.entries(BCP)) ok(S.pga[z] === b, 'PGA band zone ' + z + ' = ' + S.pga[z]);
const L = R.layer('seismic');
ok(L && L.ready && L.words.length === 5, 'layer ready, 5 words');
for (const [i, z] of ['1', '2A', '2B', '3', '4'].entries()) ok(L.words[i].startsWith('Zone ' + z + ', PGA ' + BCP[z]), 'word ' + L.words[i]);
const F = Object.values(L.facts || {}); ok(F.length === units.length && F.every((x) => /^Building Code of Pakistan zone (1|2A|2B|3|4), PGA /.test(x.text) && x.pga === BCP[x.zone]), 'every tehsil fact carries zone code + PGA (' + F.length + ')');
console.log(`seismic40: ${p} pass, ${f} fail`); process.exit(f ? 1 : 0);
