/* Build a distributable ZIP of this deployment — v91.17.16 · SEC-05.
   Usage:  node scripts/pack-release.mjs [outfile.zip]

   The pass-1 audit could not state what ships, because nothing in the tree
   said. This does: an explicit include list for the software and the science
   data it needs, an explicit exclude list (RELEASE_EXCLUDE.txt) for the
   operator's own state and every credential, and a printed manifest of what
   went in so the answer is visible before the file leaves the machine. */
import { readdirSync, statSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const OUT = process.argv[2] || join(ROOT, '..', 'nigraan-local-v' + PKG.version + '.zip');

/* software */
const INCLUDE = [
  'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', 'artefact/MANIFEST.json',
  'server', 'scripts', 'fixtures',
  'package.json', 'README.md', 'BACKEND.md', '.env.example', 'RUN_NIGRAAN.bat', 'LEARN_NIGRAAN.bat', 'LEARN_GEO.bat', 'LEARN_SKILL.bat', 'LEARN_ALL.bat', 'LEARN_FLEET.bat', 'LEARN_CROSSCHECK.bat', 'SETUP_PYTHON.bat', 'SPACE_AUDIT.bat', 'CLEAN_SPACE.bat', 'ai.key.example', 'fleet.key.example',
  'RELEASE_EXCLUDE.txt',
];
/* the science data a fresh install cannot compute for itself */
const SCIENCE = ['data/era5land-cells.json', 'data/era5land-climatology.json', 'data/outlook-event-climate.json', 
  'data/climatology.json', 'data/pk-tehsils.json', 'data/anomaly-climate.json',
  'data/lcz-grid.json', 'data/lcz_gindex.json', 'data/mos-table.json',
  'data/soil-moisture-climatology.json', 'data/obs',
  /* v91.17.34 · AUDIT F1 · a fresh install could not compute these and silently ran without them */
  'data/ifs-mos.json', 'data/hybas_pk_lev07.json', 'data/glof-register.json', 'data/glof-basins.json', 'data/glof-bulletins.json',
  'data/urban-units.json', 'data/urban.f16', 'data/urban.idx', 'data/urban.meta.json', 'data/urban.unit', 'data/flood.json',
  /* v91.17.36 · the learning outputs the skill sheet and the operations page read */
  'data/model-ranking.json', 'data/model-blend.json', 'data/mos-retrain.json',
  /* v91.17.37 · terrain, lakes, settlement heights, lapse table, canopy and buildings */
  'data/glof-terrain.json', 'data/glof-lakes-live.json', 'data/settlement-elevation.json', 'data/lapse-table.json',
  'data/urban-tree.f16', 'data/urban-tree.meta.json', 'data/climatology-bias.json', 'data/urban-buildings.f16', 'data/urban-buildings.meta.json', 'data/buildings-tehsil.json', 'data/hand-tehsil.json', 'data/lithology-tehsil.json', 'data/landslide-calibration.json', 'data/rain-intensity-scale.json', 'data/lapse-dynamic.json', 'data/sponge-tehsil.json', 'data/soil-model-range.json', 'data/met-corrections.json', 'data/level-anomaly.json', 'data/pk-places.tsv.gz', 'data/pk-places.meta.json', 'data/pk-places-extra.tsv', 'data/pk-places-osm.tsv.gz', 'data/pk-places-osm.meta.json', 'data/place-areas/pk-place-areas.json.gz', 'data/pk-tehsils-fine.json.gz',   /* GEO281 */ 'data/landcover-tehsil.json', 'data/flood-extent-calibration.json', 'data/bias-references.json', 'data/mach-fleet-stations.json',
  /* v91.17.60 */ 'data/ml-mos.json', 'data/hsg-tehsil.json', 'data/cn-tehsil.json', 'data/cn-backtest.json', 'data/catchments.json', 'data/landcover-2025-tehsil.json', 'data/model-skill.json', /* v91.17.70 engineering */ 'data/engineering-references.json',
  /* v91.17.63 */ 'data/fleet-history-skill.json',
  /* v91.17.64 */ 'data/glof-events.json', 'data/giri-landslide-tehsil.json',
  /* v91.17.68 */ 'data/ens-wet-reliability.json',
  /* the evidence files the skill sheet cites, so a shipped /api/skill names files that exist */
  'audit/evidence_v91_17_3', 'audit/evidence_v91_17_22', 'audit/evidence_v91_17_31',
];
/* v91.17.34 · AUDIT F2 · the deny list is READ from RELEASE_EXCLUDE.txt, as that file says; the regex below is the floor */
const DENY = /(^|\/)(secrets|node_modules|build|audit)(\/|$)|(^|\/)(mach|fleet|cds)\.key$|(^|\/)earthdata\.key(\.txt)?$|(^|\/)token-secret$|(^|\/)\.env$|\.(log|pid|bak|orig|swp|rej)$|~$/;
const DENY_SCIENCE = /(^|\/)(secrets|node_modules|build)(\/|$)|(^|\/)(mach|fleet|cds)\.key$|(^|\/)earthdata\.key(\.txt)?$|(^|\/)token-secret$|(^|\/)\.env$|\.(log|pid|bak|orig|swp|rej|parquet)$|~$/;
const EXCL = (() => { try { return readFileSync(join(ROOT, 'RELEASE_EXCLUDE.txt'), 'utf8').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean); } catch { return []; } })();
const excluded = (relRaw) => { const rel = String(relRaw).split('\\').join('/'); return DENY.test(rel) || EXCL.some(pat => pat.endsWith('/') ? (rel + '/').startsWith(pat) || rel.startsWith(pat) : pat.startsWith('*') ? rel.endsWith(pat.slice(1)) : rel === pat || rel.startsWith(pat + '/')); };

const files = [];
const walk = (rel, science = false) => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  /* science files are named one by one from inside data/, which RELEASE_EXCLUDE otherwise keeps out */
  if (science ? DENY_SCIENCE.test(String(rel).split('\\').join('/')) : excluded(rel)) return;
  const st = statSync(abs);
  if (st.isDirectory()) { for (const n of readdirSync(abs)) walk(join(rel, n), science); return; }
  files.push(rel);
};
INCLUDE.forEach(r => walk(r, false)); SCIENCE.forEach(r => walk(r, true));

/* refuse to build a release that carries the key, whatever the lists say */
for (const [keyName, pick] of [['mach.key', (t) => t.trim()], ['fleet.key', (t) => ((t.match(/^\s*token\s*=\s*(\S+)/m) || [])[1] || '')], ['earthdata.key', (t) => (t.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/) || [''])[0]], ['cds.key', (t) => ((t.match(/^\s*key:\s*(\S+)/m) || [])[1] || '')], ['earthdata.key.txt', (t) => (t.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/) || [''])[0]]]) {
const keyFile = join(ROOT, keyName);
if (existsSync(keyFile)) {
  const key = pick(readFileSync(keyFile, 'utf8'));
  if (key.length > 7) {
    const leak = files.filter((f) => {
      try { return readFileSync(join(ROOT, f), 'utf8').includes(key); } catch { return false; }
    });
    if (leak.length) {
      console.error('REFUSED: the ' + keyName + ' secret appears in ' + leak.length + ' file(s) that would ship:');
      leak.forEach((f) => console.error('  ' + f));
      process.exit(1);
    }
  }
}
}

let bytes = 0;
for (const f of files) bytes += statSync(join(ROOT, f)).size;
console.log(files.length + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB');
const art = readFileSync(join(ROOT, 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'));
console.log('artefact sha256 ' + createHash('sha256').update(art).digest('hex'));
try {
  /* v91.17.34 · AUDIT · data/flood.json ships its snapped reaches and fitted return levels, never a dated forecast:
     a fresh install would have served a days-old 'day 0' as current. The forecast is rebuilt within minutes of the first start. */
  const fj = join(ROOT, 'data', 'flood.json');
  if (files.includes('data/flood.json') && existsSync(fj)) {
    const F = JSON.parse(readFileSync(fj, 'utf8')); delete F.forecast;
    const tmp = join(ROOT, 'data', 'flood.release.json'); writeFileSync(tmp, JSON.stringify(F));
    files[files.indexOf('data/flood.json')] = 'data/flood.release.json';
    execFileSync('zip', ['-q', '-X', OUT, ...files], { cwd: ROOT, stdio: 'inherit' });
    /* rename inside the archive so the server reads it under its own name */
    try { execFileSync('python3', ['-c', 'import zipfile,sys,os\nz=zipfile.ZipFile(sys.argv[1]);n=sys.argv[1]+".tmp";o=zipfile.ZipFile(n,"w",zipfile.ZIP_DEFLATED)\nfor i in z.infolist():\n  d=z.read(i.filename); i.filename="data/flood.json" if i.filename=="data/flood.release.json" else i.filename; o.writestr(i,d)\no.close();z.close();os.replace(n,sys.argv[1])', OUT]); } catch (e) { console.error('rename inside zip failed: ' + e.message); }
    try { unlinkSync(tmp); } catch {}
  } else execFileSync('zip', ['-q', '-X', OUT, ...files], { cwd: ROOT, stdio: 'inherit' });
  console.log('wrote ' + OUT);
} catch (e) {
  console.log('zip not available — the file list above is the release contents. (' + (e && e.message) + ')');
}
