/* v91.17.116 · join the street-map parts into data/basemap/pk-streets.pmtiles and check the whole file's sha256 before it is used.
   node scripts/install_streets.mjs <partsDir> <sha256>   · writes to a .tmp file first; the archive is replaced only when the hash matches.
   The parts are left where they are. */
import { readdirSync, openSync, writeSync, closeSync, readFileSync, renameSync, mkdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [dir, want] = process.argv.slice(2);
if (!dir || !want) { console.log('usage: node scripts/install_streets.mjs <partsDir> <sha256>'); process.exit(2); }
const out = join(ROOT, 'data', 'basemap', 'pk-streets.pmtiles'); mkdirSync(dirname(out), { recursive: true });
if (existsSync(out)) { const h0 = createHash('sha256'); h0.update(readFileSync(out)); if (h0.digest('hex') === want) { console.log('street map already installed and verified'); process.exit(0); } }
const parts = readdirSync(dir).filter(f => /^part_\d+$/.test(f)).sort();
if (!parts.length) { console.log('no parts in ' + dir); process.exit(1); }
const tmp = out + '.tmp'; const fd = openSync(tmp, 'w'); const h = createHash('sha256'); let n = 0;
for (const p of parts) { const b = readFileSync(join(dir, p)); writeSync(fd, b); h.update(b); n += b.length; }
closeSync(fd);
const got = h.digest('hex');
if (got !== want) { try { unlinkSync(tmp); } catch (_) {} console.log('STREET MAP NOT INSTALLED: sha256 mismatch (' + parts.length + ' parts, ' + n + ' bytes)'); process.exit(1); }
renameSync(tmp, out);
console.log('street map installed: ' + parts.length + ' parts, ' + n + ' bytes, sha256 verified -> ' + out + ' (' + statSync(out).size + ' bytes)');
