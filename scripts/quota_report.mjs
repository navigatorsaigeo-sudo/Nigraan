/* v91.17.115 · paid weather provider usage, last 14 days, from the server's own accounting (data/nigraan-db.json quotaWindows).
   Read-only; prints counts only. node scripts/quota_report.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const f = join(ROOT, 'data', 'nigraan-db.json');
if (!existsSync(f)) { console.log('no store file'); process.exit(0); }
const db = JSON.parse(readFileSync(f, 'utf8'));
const W = ((db.collections && db.collections.quotaWindows) || db.quotaWindows || []).filter(w => w.providerId === 'mach').sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14);
console.log('day         calls  locations  weighted(backend)  weighted(browser)  failures  quotaErrors  lastStatus');
for (const w of W) console.log([w.day, String(w.calls || 0).padStart(6), String(w.locations || 0).padStart(10), String(w.backendWeighted || 0).padStart(18), String(w.browserWeighted || 0).padStart(18), String(w.failures || 0).padStart(9), String(w.quotaErrors || 0).padStart(12), ' ' + (w.lastStatus ?? '')].join(' '));
const lim = Number(process.env.MACH_DAILY_CALL_LIMIT || 0) || null;
console.log('local daily limit (MACH_DAILY_CALL_LIMIT): ' + (lim || 'not set'));
