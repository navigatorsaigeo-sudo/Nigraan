// aq40: the served national PM2.5 model (data/pm25-national.json) evaluated with the server's own tree walker (natmodel.mjs lgbEval)
// usage: node aq40_served.mjs <tree> <in.jsonl: {k, x:[features in model order]}> <out.jsonl: {k, v}>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [tree, inF, outF] = process.argv.slice(2);
const { lgbEval } = await import(pathToFileURL(join(tree, 'server', 'api', 'natmodel.mjs')).href);
const N = JSON.parse(readFileSync(join(tree, 'data', 'pm25-national.json'), 'utf8'));
const out = [];
for (const line of readFileSync(inF, 'utf8').split('\n')) { if (!line) continue; const o = JSON.parse(line);
  const xv = o.x.map((v) => (v == null || !Number.isFinite(v) ? null : v)); out.push(JSON.stringify({ k: o.k, v: Math.exp(lgbEval(N.model, xv)) * N.smear })); }
writeFileSync(outF, out.join('\n') + '\n');
console.log('served national values', out.length);
