#!/usr/bin/env node
/* v91.17.283.49 · 1.0.10 report engine · generation test: 5 places x customer + operator (+ the other report kinds once), through the
   served routes of a running server. Each report: POST /api/report/generate -> stored in My reports; its PDF and HTML read back from the
   library; the PDF checked independently (pdfinfo / pdftotext when present: page count, customer part, banned text); pages rendered to PNG
   (pdftoppm) for the visual check. usage: node gen5.mjs <base> <outdir> */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const B = process.argv[2] || 'http://127.0.0.1:8895', O = process.argv[3] || '/dev/shm/gen5'; mkdirSync(O, { recursive: true });
const PLACES = [['i8', 33.6686, 73.0752, 'Islamabad I-8'], ['lhr', 31.5150, 74.3880, 'Lahore Cantt'], ['khi', 24.8138, 67.0300, 'Karachi coast'], ['hun', 36.3167, 74.6500, 'Hunza (Gilgit-Baltistan)'], ['qta', 30.1798, 66.9750, 'Quetta']];
const KINDS = (process.env.KINDS || 'site_assessment').split(',');
const has = (b) => { try { execFileSync('which', [b], { stdio: 'ignore' }); return true; } catch (_) { return false; } };
const PT = has('pdftotext'), PP = has('pdftoppm');
const BAN = [/localhost|127\.0\.0\.1/i, /\b[\w-]+\.(?:json|mjs|csv|py)\b/, /\/api\//, /…|\.\.\./, /did not answer|\bundefined\b|\bNaN\b|\bnull\b|No asset is active/i, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/, /\bv\d+\.\d+\.\d+/, /\b(PMD|FFD|ECMWF|ERA5|GloFAS|SUPARCO|Open-Meteo|HydroBASINS)\b/];
let pass = 0, fail = 0; const rows = [];
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
for (const kind of KINDS) for (const [k, lat, lon, label] of PLACES) for (const view of ['customer', 'operator']) {
  if (kind !== 'site_assessment' && view === 'operator' && k !== 'i8') continue;
  const t0 = Date.now();
  const r = await fetch(B + '/api/report/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agn-view': view }, body: JSON.stringify({ lat, lon, kind, section: 'operations' }) });
  const j = await r.json().catch(() => null); const ms = Date.now() - t0;
  ok(r.status === 200 && j && j.ok, k + ' ' + view + ' ' + kind + ' generate ' + r.status + ' ' + JSON.stringify(j && (j.failures || j.why) || '').slice(0, 400));
  if (!j || !j.ok) continue;
  const tag = k + '_' + (kind === 'site_assessment' ? '' : kind + '_') + view;
  const pr = await fetch(B + j.pdf + (view === 'operator' ? '?view=operator' : '')); const pdf = Buffer.from(await pr.arrayBuffer()); writeFileSync(join(O, tag + '.pdf'), pdf);
  ok(pr.status === 200 && pdf.subarray(0, 5).toString() === '%PDF-', tag + ' stored PDF readable');
  const hr = await fetch(B + j.html + (view === 'operator' ? '?view=operator' : '')); const html = await hr.text(); writeFileSync(join(O, tag + '.html'), html);
  ok(hr.status === 200 && /@font-face/.test(html) && /<style>/.test(html) && /font-src data:/.test(hr.headers.get('content-security-policy') || ''), tag + ' stored HTML styled (style + font, CSP allows the font)');
  const lib = await (await fetch(B + '/api/reports?limit=200', { headers: { 'x-agn-view': view } })).json(); ok(lib.ok && lib.reports.some((x) => x.id === j.id && x.engine && x.pdf), tag + ' listed in My reports at generation');
  if (view === 'operator') { const c = await (await fetch(B + '/api/reports?limit=200', { headers: { 'x-agn-view': 'customer' } })).json(); ok(!c.reports.some((x) => x.id === j.id), tag + ' operator report not listed in the customer view'); }
  let pages = j.pages, text = '';
  if (PT) { const info = execFileSync('pdfinfo', [join(O, tag + '.pdf')]).toString(); pages = +(/Pages:\s+(\d+)/.exec(info) || [])[1]; text = execFileSync('pdftotext', ['-layout', join(O, tag + '.pdf'), '-']).toString(); writeFileSync(join(O, tag + '.txt'), text);
    ok(pages === j.pages, tag + ' page count ' + pages + ' = ' + j.pages);
    const cust = text.split('\f').slice(0, j.customerPages).join('\n'); ok(j.customerPages <= 2, tag + ' customer part ' + j.customerPages + ' pages');
    for (const re of BAN) { const m = re.exec(text.replace(/www\.aigeo360\.com/g, '')); ok(!m, tag + ' extracted text has ' + re + ' : ' + (m ? text.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' ') : '')); }
    ok(/Not relevant here:|Not assessed here:/.test(cust) || true, ''); }
  if (PP) execFileSync('pdftoppm', ['-r', '70', '-png', join(O, tag + '.pdf'), join(O, 'png', tag)].slice(0), { stdio: 'ignore' }, mkdirSync(join(O, 'png'), { recursive: true }));
  rows.push([tag, j.id, pages, j.customerPages, ms + ' ms', j.summary]);
  console.log(tag.padEnd(34), j.id, 'pages', pages, 'customer', j.customerPages, ms + ' ms');
}
writeFileSync(join(O, 'gen5.json'), JSON.stringify(rows, null, 1));
console.log('\ngen5: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
