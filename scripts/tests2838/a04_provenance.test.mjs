// audit 4 · the chain hash covers ALL executable hazard science: the served pages (artefact/*.html: the default engine runs in the page),
// server/science/** (.js modules, manifest and data) and the nested science tables (data/evidence/**, flood-depth / flood-extent /
// GloFAS-calibration indexes, the binary tables). A change to any of them changes the chain id.
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TREE, ok, done } from './lib.mjs';
import { pathToFileURL } from 'node:url';
const T = mkdtempSync(join(tmpdir(), 'prov-'));
for (const d of ['server', 'artefact']) cpSync(join(TREE, d), join(T, d), { recursive: true });
cpSync(join(TREE, 'package.json'), join(T, 'package.json'));
const D = join(T, 'data'); mkdirSync(join(D, 'evidence', 'x'), { recursive: true }); mkdirSync(join(D, 'flood-extent'), { recursive: true }); writeFileSync(join(D, 'a.json'), '{"version":1}'); writeFileSync(join(D, 'evidence', 'x', 'e.csv'), 'a,b\n1,2\n'); writeFileSync(join(D, 'flood-extent', 'fx-model.json'), '{}'); writeFileSync(join(D, 'chirps-tehsil.npz'), 'npz');
const { createProvenance } = await import(pathToFileURL(join(T, 'server', 'api', 'provenance.mjs')).href);
async function chainId() { const P = createProvenance({ dataDir: D }); for (let i = 0; i < 200; i++) { const c = P.chain(); if (c && c.id) return c; await new Promise((r) => setTimeout(r, 50)); } return null; }
const c0 = await chainId(); const ids = {};
for (const [name, f] of [['served page artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', join(T, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html')], ['science module server/science/modules/' + readdirSync(join(T, 'server', 'science', 'modules'))[0], join(T, 'server', 'science', 'modules', readdirSync(join(T, 'server', 'science', 'modules'))[0])],
  ['science data server/science/data/agn-geo.json', join(T, 'server', 'science', 'data', 'agn-geo.json')], ['nested evidence data/evidence/x/e.csv', join(D, 'evidence', 'x', 'e.csv')], ['flood-extent index', join(D, 'flood-extent', 'fx-model.json')], ['binary table chirps-tehsil.npz', join(D, 'chirps-tehsil.npz')]]) {
  appendFileSync(f, name.endsWith('.json') || /json$/.test(f) ? ' ' : '\n'); const c = await chainId(); ids[name] = c && c.id;
  ok(c && c0 && c.id !== c0.id, 'a change to the ' + name + ' changes the chain id', (c0 && c0.id) + ' -> ' + (c && c.id));
}
rmSync(T, { recursive: true, force: true });
done('A04-PROVENANCE');
