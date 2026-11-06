/* v91.17.283 · WS7 · PERMANENT CHECK (e) · ASCII SCRIPTS, NO PMD / FFD NAMES TO CLIENTS.
   A2 no suite under scripts/tests* hard-codes a machine path (Playwright, Chromium, a scratchpad mock): scripts/lib/testenv.mjs resolves them
   A1 every .ps1 / .bat / .cmd file in this install is plain ASCII (no BOM, no curly quotes or dashes): Windows PowerShell 5.1 reads a
      BOM-less UTF-8 script as the ANSI code page and cmd.exe as the OEM code page, so one "–" can break a deploy or a watchdog line.
   N1 the client-facing files name neither PMD / the Pakistan Meteorological Department nor FFD / the Flood Forecasting Division
      (owner rule: those sources are never named to clients). Client-facing = what a browser shows or holds as data: the visible text and
      the title / aria-label / alt / placeholder / content attributes of every artefact/*.html page, and its embedded JSON data blocks
      (<script type="application/json">); page code (the scripts' own source) is not text a client reads and is not judged here.
   N2 the same rule on the served answers: every page route and every GET /api/... route found in the server source, customer view
      (x-agn-view: customer), on its own server (permanent/lib.mjs ownServer, mock provider). Strings inside JSON answers, and the visible
      text / data blocks of HTML answers.
   Expected to FAIL on base v91.17.282.1: NIGRAAN_START.html embeds validation-oos.json whose "truth" names the PMD bulletin.
   usage: node scripts/tests283/permanent/lint_names.test.mjs [--files-only]   (no server argument) */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, delimiter } from 'node:path';
import { ownServer, req, counter, T, apiGetRoutes, SAMPLE_QUERY, pool } from './lib.mjs';

const C = counter('ASCII + names lint');
const NAMES = /\bPMD\b|Pakistan Meteorological Department|\bFFD\b|Flood Forecasting Division/;

/* ── A1 ── */
const scripts = [];
const walk = (d) => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n === '.git') continue; const p = join(d, n); const st = statSync(p);
  if (st.isDirectory()) walk(p); else if (/^\.(ps1|bat|cmd|psm1|psd1)$/i.test(extname(n))) scripts.push(p); } };
walk(T.ROOT);
/* NIGRAAN_LINT_DIRS: more folders to check (the deploy package templates, e.g. pkgbuild/bin), separated by the OS path delimiter */
for (const d of String(process.env.NIGRAAN_LINT_DIRS || '').split(delimiter).filter(Boolean)) { try { walk(d); } catch (e) { C.note('A1 ' + d + ' could not be read (' + e.code + ')'); } }
const nonAscii = [];
for (const f of scripts) { const b = readFileSync(f); let line = 1;
  for (let i = 0; i < b.length; i++) { if (b[i] === 10) line++; if (b[i] > 127) { const s = b.toString('utf8', Math.max(0, i - 30), Math.min(b.length, i + 30)).replace(/\s+/g, ' ');
    nonAscii.push((f.startsWith(T.ROOT) ? relative(T.ROOT, f) : f) + ':' + line + ' byte 0x' + b[i].toString(16) + (i < 3 && b[0] === 0xef ? ' (UTF-8 BOM)' : '') + ' "' + s + '"'); break; } } }
C.ok(scripts.length > 0, 'A1 found the Windows scripts to check (' + scripts.length + ')');
C.ok(!nonAscii.length, 'A1 every .ps1/.bat/.cmd is plain ASCII (' + scripts.length + ' files)', nonAscii.join(' | '));

/* ── A2 · the suites carry no machine path (scripts/lib/testenv.mjs resolves them) ── */
{ const MACHINE = /\/home\/claude\/|\/opt\/pw-browsers\/|scratchpad\/perf\/|\/root\/\.cache\/ms-playwright/;
  const bad = []; const tw = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) { if (n !== 'node_modules') tw(p); }
    else if (/\.(mjs|js|py|sh)$/.test(n)) { const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*(\/\/|#).*$/, ''));
      src.forEach((l, i) => { const m = l.match(MACHINE); if (m) bad.push(relative(T.ROOT, p) + ':' + (i + 1) + ' "' + l.trim().slice(0, 120) + '"'); }); } } };
  for (const n of readdirSync(T.repoPath('scripts'))) if (/^tests/.test(n)) tw(T.repoPath('scripts', n));
  C.ok(!bad.length, 'A2 no suite under scripts/tests* hard-codes a machine path (the cloud home folder, the cloud browser folder, a scratchpad mock): they use scripts/lib/testenv.mjs', bad.slice(0, 10).join(' | ')); }

/* ── N1 ── */
function clientText(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']?application\/(?:ld\+)?json["']?[^>]*>([\s\S]*?)<\/script>/gi)) out.push(['data block', m[1]]);
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  for (const m of body.matchAll(/\b(?:title|aria-label|alt|placeholder|content)\s*=\s*"([^"]*)"/gi)) out.push(['attribute', m[1]]);
  out.push(['visible text', body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')]);
  return out;
}
const near = (s, re) => { const m = s.match(re); if (!m) return null; const i = s.indexOf(m[0]); return '"' + s.slice(Math.max(0, i - 70), i + 50).replace(/\s+/g, ' ') + '"'; };
const pages = readdirSync(T.repoPath('artefact')).filter((f) => /\.html?$/i.test(f));
for (const f of pages) { const html = readFileSync(T.repoPath('artefact', f), 'utf8'); const bad = [];
  for (const [where, t] of clientText(html)) { const x = near(t, NAMES); if (x) bad.push(where + ': ' + x); }
  C.ok(!bad.length, 'N1 artefact/' + f + ': no PMD / FFD name in its visible text, attributes or data blocks', bad.slice(0, 6).join(' | ')); }

/* ── N2 ── */
if (process.argv.includes('--files-only')) C.note('N2 served answers not checked (--files-only)');
else {
  const srv = await ownServer({ mode: 'ok' });
  try {
    if (C.ok(srv.up, 'own server up (data copy, mock provider, nothing scheduled)', srv.up ? srv.base : srv.log().slice(-600))) {
      const list = ['/', '/analyst', '/classic', '/n3', '/customize', ...pages.map((f) => '/' + encodeURIComponent(f)), ...apiGetRoutes().map((r) => r + '?' + SAMPLE_QUERY)];
      const bad = []; let n = 0;
      const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.push(k); strings(v, out); } return out; };
      await pool(list, 4, async (p) => { const r = await req(srv.base, p, { headers: { 'x-agn-view': 'customer' }, timeoutMs: 60000 }); n++;
        const texts = r.json ? strings(r.json).map((s) => ['json', s]) : /text\/html/.test(r.headers['content-type'] || '') ? clientText(r.text) : [['text', r.text || '']];
        for (const [w, t] of texts) { const x = near(t, NAMES); if (x) { bad.push(p.split('?')[0] + ' (' + w + '): ' + x); break; } } });
      C.ok(!bad.length, 'N2 no PMD / FFD name in ' + n + ' served answers (customer view)', bad.slice(0, 12).join(' | '));
    }
  } finally { await srv.stop(); }
}
C.done();
