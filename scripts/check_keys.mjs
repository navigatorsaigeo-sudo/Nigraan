/* v91.17.114 · KEY CHECK — runs on the NIGRAAN computer only. No key value is ever printed, logged, copied or sent anywhere
   except to the one service that key belongs to (the same call the system already makes).

   For each key: present · format · file permissions · live test against its own service · expiry where the key carries one.
   Then: stray copies of any key value inside other files under the NIGRAAN folders (paths only).
   --fix   tighten file permissions to the owner, SYSTEM and Administrators (icacls), strip a byte-order mark / trailing spaces.
           Nothing is deleted or moved.
   node scripts/check_keys.mjs [--fix] [--scan <dir> ...]
   Output: data/key-check.json and the console (both value-free). */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const A = process.argv.slice(2); const FIX = A.includes('--fix');
const SCAN = []; A.forEach((a, i) => { if (a === '--scan' && A[i + 1]) SCAN.push(A[i + 1]); });
if (!SCAN.length) SCAN.push(resolve(ROOT, '..', '..'));   /* the whole NIGRAAN install folder (deploy\.. ) */
const WIN = process.platform === 'win32';
const out = { at: new Date().toISOString(), host: os.hostname(), fix: FIX, keys: {}, strays: [], notes: [] };
/* v91.17.255 (B-6) · console lines are plain ASCII: the setup and check logs capture this output through PowerShell, which read
   the UTF-8 middle dot as '┬╖' (cp437). key-check.json keeps the original text. */
const say = (s) => console.log(String(s).replace(/\u00b7/g, '-').replace(/[\u2013\u2014]/g, '-').replace(/[^\x00-\x7e]/g, '?'));
const read = (f) => { let t = readFileSync(f, 'utf8'); return t; };
const mask = (s) => s ? '(' + s.length + ' characters)' : '(empty)';

/* file permissions: who besides the owner can read it */
function acl(f) {
  if (!WIN) { try { const m = statSync(f).mode & 0o777; return { mode: m.toString(8), open: (m & 0o077) !== 0 }; } catch (e) { return { error: e.message }; } }
  try { const t = execFileSync('icacls', [f], { encoding: 'utf8' });
    const wide = /(Everyone|BUILTIN\\Users|NT AUTHORITY\\Authenticated Users|\\Users:)/i.test(t);
    return { open: wide, entries: t.split(/\r?\n/).map(s => s.replace(f, '').trim()).filter(s => s && !/Successfully processed/i.test(s)).length }; }
  catch (e) { return { error: String(e.message).slice(0, 120) }; }
}
function tighten(f) {
  if (!WIN) { try { execFileSync('chmod', ['600', f]); return true; } catch (_) { return false; } }
  try { const u = (process.env.USERDOMAIN ? process.env.USERDOMAIN + '\\' : '') + process.env.USERNAME;
    execFileSync('icacls', [f, '/inheritance:r', '/grant:r', u + ':F', 'SYSTEM:F', 'Administrators:F'], { encoding: 'utf8' }); return true; }
  catch (_) { return false; }
}
function tidy(f) {   /* remove a BOM and trailing spaces on each line; the value itself is untouched */
  const t = readFileSync(f, 'utf8'); const n = t.replace(/^﻿/, '').split(/\r?\n/).map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '\n');
  if (n !== t) { writeFileSync(f, n); return true; } return false;
}
async function status(url, opt = {}) {
  try { const r = await fetch(url, { ...opt, redirect: 'manual', signal: AbortSignal.timeout(25000) }); return r.status; } catch (e) { return 'network: ' + String(e.message).slice(0, 80); }
}
const values = [];   /* key values, kept in memory only, for the stray-copy scan */

async function one(name, file, parse, test) {
  const f = join(ROOT, file); const k = { file: file, present: existsSync(f) };
  if (!k.present) { out.keys[name] = k; say(`${name.padEnd(12)} MISSING (${file})`); return; }
  if (FIX) { k.tidied = tidy(f); }
  let P = null; try { P = parse(read(f)); } catch (e) { P = { ok: false, why: e.message }; }
  k.format = P.ok ? 'ok' : 'BAD: ' + P.why; k.length = P.len;
  const a = acl(f); k.permissions = a.error ? 'unknown: ' + a.error : a.open ? 'OPEN to other users' : 'owner only';
  if (FIX && a.open) { k.permissionsFixed = tighten(f); const b = acl(f); k.permissions = b.open ? 'still OPEN' : 'owner only (fixed)'; }
  if (P.ok && test) { try { Object.assign(k, await test(P)); } catch (e) { k.live = 'error: ' + String(e.message).slice(0, 100); } }
  if (P.secret) values.push({ name, v: P.secret });
  out.keys[name] = k;
  say(`${name.padEnd(12)} format ${k.format} · ${k.permissions} · live ${k.live ?? '-'}${k.expires ? ' · expires ' + k.expires + (k.daysLeft != null ? ' (' + k.daysLeft + ' days)' : '') : ''}${k.note ? ' · ' + k.note : ''}`);
}

/* 1 · paid weather provider */
await one('mach.key', 'mach.key', (t) => { const v = t.trim(); return { ok: /^[A-Za-z0-9_-]{8,}$/.test(v), why: 'expected one token, no spaces', len: v.length, secret: v }; },
  async (P) => { const s = await status('https://customer-api.open-meteo.com/v1/forecast?latitude=33.7&longitude=73.0&hourly=temperature_2m&forecast_days=1&apikey=' + encodeURIComponent(P.secret));
    return { live: s === 200 ? 'OK (200)' : 'FAILED (' + s + ')', note: 'one 1-location call' }; });

/* 2 · satellite rain token (bearer JWT) */
await one('earthdata', 'earthdata.key', (t) => { const m = t.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/); if (!m) return { ok: false, why: 'no token found (expected the user token, not a password)' };
    const pw = /password|passwd/i.test(t); return { ok: !pw, why: 'the file mentions a password: only the token belongs here', len: m[0].length, secret: m[0], tok: m[0] }; },
  async (P) => { let exp = null; try { exp = JSON.parse(Buffer.from(P.tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).exp; } catch (_) {}
    const r = { expires: exp ? new Date(exp * 1000).toISOString().slice(0, 10) : 'unknown', daysLeft: exp ? Math.floor((exp * 1000 - Date.now()) / 864e5) : null };
    /* practical test: the newest satellite day the server fetched with it */
    let last = null; try { last = readdirSync(join(ROOT, 'data', 'imerg')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop(); } catch (_) {}
    const age = last ? Math.floor((Date.now() - Date.parse(last.slice(0, 10))) / 864e5) : null;
    r.live = r.daysLeft != null && r.daysLeft < 0 ? 'EXPIRED' : last ? (age <= 4 ? 'OK (last satellite day ' + last.slice(0, 10) + ')' : 'STALE (last satellite day ' + last.slice(0, 10) + ', ' + age + ' days ago)') : 'no satellite day fetched yet';
    if (r.daysLeft != null && r.daysLeft < 14 && r.daysLeft >= 0) r.note = 'renew soon: generate a new token in your Earthdata profile and replace the file';
    return r; });

/* 3 · MACH fleet API */
await one('fleet.key', 'fleet.key', (t) => { const b = (t.match(/^\s*base\s*=\s*(\S+)/m) || [])[1], k = (t.match(/^\s*token\s*=\s*(\S+)/m) || [])[1];
    return { ok: !!b && /^https:\/\//.test(b) && !!k, why: !b ? 'no base= line' : !/^https:\/\//.test(b) ? 'base is not https' : 'no token= line', len: k ? k.length : 0, secret: k, base: b, tok: k }; },
  async (P) => { let key = null; try { key = (JSON.parse(readFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), 'utf8')).stations || [])[0].key; } catch (_) {}
    if (!key) return { live: 'no station list to test with' };
    const s = await status(P.base.replace(/\/$/, '') + '/api/weather/latest?location=' + encodeURIComponent(key) + '&timezone=Asia%2FKarachi', { headers: { accept: 'application/json', authorization: 'Bearer ' + P.tok } });
    return { live: s === 200 ? 'OK (200)' : 'FAILED (' + s + ')' }; });

/* 4 · reanalysis data store key (.cdsapirc format) */
await one('cds.key', 'cds.key', (t) => { const u = (t.match(/^\s*url\s*:\s*(\S+)/m) || [])[1], k = (t.match(/^\s*key\s*:\s*(\S+)/m) || [])[1];
    const oldStyle = k && /^\d+:/.test(k);
    return { ok: !!u && !!k && !oldStyle, why: !u ? 'no url: line' : !k ? 'no key: line' : 'old UID:KEY format: the new data store takes the personal access token alone', len: k ? k.length : 0, secret: k, url: u, tok: k }; },
  async (P) => { const s = await status(P.url.replace(/\/$/, '') + '/retrieve/v1/jobs?limit=1', { headers: { 'PRIVATE-TOKEN': P.tok, accept: 'application/json' } });
    return { live: s === 200 ? 'OK (200)' : s === 401 || s === 403 ? 'REJECTED (' + s + ')' : 'FAILED (' + s + ')' }; });

/* 5 · local AI settings (no external key unless cloud is opted in) */
await one('ai.key', 'ai.key', (t) => { const base = (t.match(/^\s*base\s*=\s*(\S+)/m) || [])[1]; const cloud = /^\s*cloud\s*=\s*(1|yes|true|on)\s*$/mi.test(t);
    const k = (t.match(/^\s*(?:key|token|apikey)\s*=\s*(\S+)/mi) || [])[1];
    const model = (t.match(/^\s*model\s*=\s*(\S+)/m) || [])[1];
    return { ok: !!base || !!k, why: 'neither base= nor key=', len: k ? k.length : 0, secret: k, base, cloud, model }; },
  async (P) => { if (!P.base) return { live: 'no local base set', note: P.cloud ? 'cloud opt-in ON' : 'cloud off' };
    /* v91.17.115 · the base is the OpenAI-style path (…/v1); the model list is /api/tags on the server root */
    const root = P.base.replace(/\/+$/, '').replace(/\/v1$/, '');
    try { const r = await fetch(root + '/api/tags', { signal: AbortSignal.timeout(15000) }); if (!r.ok) return { live: 'local model server answered ' + r.status, note: P.cloud ? 'cloud opt-in ON' : 'cloud off' };
      const j = await r.json(); const names = (j.models || []).map(m => m.name); const want = P.model;
      return { live: want ? (names.includes(want) ? 'OK, model ' + want + ' installed' : 'server OK but model ' + want + ' NOT installed (' + names.length + ' models present)') : 'local model server OK', note: P.cloud ? 'cloud opt-in ON' : 'cloud off' }; }
    catch (e) { return { live: 'local model server not running (' + String(e.message).slice(0, 60) + ')', note: P.cloud ? 'cloud opt-in ON' : 'cloud off' }; } });

/* 5b · v91.17.121 · candidate forecast sources (checked only when their files exist; not used by the server yet) */
if (existsSync(join(ROOT, 'vc.key'))) await one('vc.key', 'vc.key', (t) => { const v = t.trim(); return { ok: /^[A-Za-z0-9]{16,64}$/.test(v), why: 'expected one token, letters and digits', len: v.length, secret: v }; },
  async (P) => { const s = await status('https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/33.68,73.05/today?unitGroup=metric&include=current&elements=temp&key=' + encodeURIComponent(P.secret));
    return { live: s === 200 ? 'OK (200)' : s === 401 ? 'REJECTED (401)' : 'FAILED (' + s + ')', note: 'one 1-credit call' }; });
if (existsSync(join(ROOT, 'weatherkit.key'))) await one('weatherkit.key', 'weatherkit.key', (t) => { const g = (k) => (t.match(new RegExp('^\\s*' + k + '\\s*=\\s*(\\S+)', 'mi')) || [])[1];
    const pem = (t.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/) || [])[0]; const team = g('team'), kid = g('keyid'), sid = g('service');
    return { ok: !!(team && kid && sid && pem), why: !pem ? 'no private key block' : 'needs team=, keyid= and service= lines', len: pem ? pem.length : 0, secret: pem ? pem.replace(/-----[^-]+-----|\s/g, '').slice(0, 64) : null, team, kid, sid, pem }; },
  async (P) => { const { createSign, createPrivateKey } = await import('node:crypto'); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
    const h = b64({ alg: 'ES256', kid: P.kid, id: P.team + '.' + P.sid }), q = b64({ iss: P.team, iat: now, exp: now + 300, sub: P.sid });
    const sig = createSign('SHA256').update(h + '.' + q).sign({ key: createPrivateKey(P.pem), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const s = await status('https://weatherkit.apple.com/api/v1/availability/33.68/73.05?country=PK', { headers: { Authorization: 'Bearer ' + h + '.' + q + '.' + sig } });
    return { live: s === 200 ? 'OK (200)' : s === 401 || s === 403 ? 'REJECTED (' + s + ')' : 'FAILED (' + s + ')', note: 'availability call' }; });

/* 6 · local token-signing secret */
await one('token-secret', 'data/token-secret', (t) => { const v = t.trim(); return { ok: v.length >= 32, why: 'shorter than 32 characters', len: v.length, secret: v.length >= 16 ? v : null }; }, null);

/* 7 · stray copies: any key value inside another file (paths only) */
const SKIP_DIR = /^(node_modules|\.git|\.ollama|blobs|engine-profile|imerg|cache.*|archive)$/i;
const TEXT = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.json', '.txt', '.md', '.bat', '.cmd', '.ps1', '.env', '.py', '.log', '.csv', '.ini', '.cfg', '.yml', '.yaml', '.key', '.vbs', '.sh', '']);
const own = new Set(['mach.key', 'earthdata.key', 'fleet.key', 'cds.key', 'ai.key', 'vc.key', 'weatherkit.key', 'token-secret'].map(f => resolve(ROOT, f === 'token-secret' ? 'data/token-secret' : f).toLowerCase()));
let scanned = 0; const t0 = Date.now();
function walk(d, depth) {
  if (depth > 8 || Date.now() - t0 > 240e3) return;
  let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
  for (const e of es) { const p = join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(p, depth + 1); continue; }
    if (!e.isFile() || !TEXT.has(extname(e.name).toLowerCase())) continue; if (own.has(resolve(p).toLowerCase())) continue;
    let st; try { st = statSync(p); } catch (_) { continue; } if (st.size > 40e6) continue;
    let t; try { t = readFileSync(p, 'latin1'); } catch (_) { continue; } scanned++;
    for (const k of values) if (k.v && k.v.length >= 12 && t.includes(k.v)) out.strays.push({ key: k.name, file: p }); }
}
for (const d of SCAN) if (existsSync(d)) walk(d, 0);
out.scannedFiles = scanned; out.scanDirs = SCAN; out.scanSeconds = Math.round((Date.now() - t0) / 1000);
say(`\nstray copies: ${out.strays.length} in ${scanned} files scanned (${out.scanSeconds}s)`);
out.strays.forEach(s => say(`  ${s.key} also inside ${s.file}`));

const bad = Object.entries(out.keys).filter(([, k]) => !k.present || /BAD/.test(k.format || '') || /FAIL|REJECT|EXPIRED|OPEN/.test((k.live || '') + ' ' + (k.permissions || '')));
out.summary = bad.length || out.strays.length ? 'ATTENTION: ' + [...bad.map(([n]) => n), ...(out.strays.length ? ['stray copies'] : [])].join(', ') : 'all keys present, well-formed, owner-only and working';
say('\n' + out.summary);
try { writeFileSync(join(ROOT, 'data', 'key-check.json'), JSON.stringify(out, null, 1)); } catch (_) {}
