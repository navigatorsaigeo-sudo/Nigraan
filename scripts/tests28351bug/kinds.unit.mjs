/* v91.17.283.51 · every report kind on the engine, offline: place answers saved from a real-data server (one JSON per place in a folder),
   each single-site kind built, drawn, written to PDF and HTML and LINTED; portfolio and network from the same answers; every kind must have
   its own content (its page-2 sections and appendix sections differ from the site report's).
   usage: node scripts/tests28351bug/kinds.unit.mjs <answers dir> [<out dir>]   (exit 1 on any failure) */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const T = new URL('../../server/api/', import.meta.url);
const { buildReport } = await import(new URL('repengine.mjs', T));
const { EXTRA, buildMulti } = await import(new URL('repkinds.mjs', T));
const { pdf: toPdf, html: toHtml } = await import(new URL('repdraw.mjs', T));
const { lint } = await import(new URL('replint.mjs', T));
const dir = process.argv[2], out = process.argv[3] || null; if (out) mkdirSync(out, { recursive: true });
const dataDir = process.env.NIGRAAN_DATA_DIR || new URL('../../data', import.meta.url).pathname;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('scen_'));
const answers = files.map((f) => ({ id: f.replace(/\.json$/, ''), A: JSON.parse(readFileSync(join(dir, f), 'utf8')) })).filter((x) => x.A && x.A.ok);
const KINDS = ['site_assessment', 'situation_report', 'readiness_72h', 'executive_brief', 'assurance_pack', 'weather_impact', 'data_gap', 'engineering_note'];
const sig = (m, part) => m.sections.filter((s) => s.part === part).map((s) => s.title).join('|');
const one = (A, kind, view, id) => { const R = buildReport(A, { kind, view, id, dataDir, extra: EXTRA[kind] || null }); const pdf = toPdf(R.cv, { title: R.title }), html = toHtml(R.cv, { title: R.title, id });
  return { R, pdf, html, L: lint({ cv: R.cv, manifest: R.manifest, pdf, html, answer: A }) }; };
for (const { id, A } of answers) {
  const base = one(A, 'site_assessment', 'customer', 'NGR-20261103-0000-00000000');
  for (const kind of KINDS) for (const view of ['customer', 'operator']) {
    let r; try { r = kind === 'site_assessment' && view === 'customer' ? base : one(A, kind, view, 'NGR-20261103-0000-' + (kind.length * 1e6 + id.length).toString(16).padStart(8, '0')); } catch (e) { ok(false, id + ' ' + kind + ' ' + view + ' threw ' + e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
    ok(r.L.ok, id + ' ' + kind + ' ' + view + ' lint: ' + (r.L.failures || []).slice(0, 4).map((f) => f.code + ' p' + f.page + ' ' + f.what).join(' | '));
    ok(r.R.manifest.customerPages <= 2 && r.R.manifest.pages >= 3, id + ' ' + kind + ' ' + view + ' pages ' + r.R.manifest.pages + ' customer ' + r.R.manifest.customerPages);
    if (kind !== 'site_assessment' && view === 'customer') ok(sig(r.R.manifest, 'customer') !== sig(base.R.manifest, 'customer') || sig(r.R.manifest, 'appendix') !== sig(base.R.manifest, 'appendix'), id + ' ' + kind + ': own content (sections differ from the site report)');
    if (out && view === 'customer' && ['Q0', 'S0', 'S3', 'R10', 'R18'].includes(id)) { writeFileSync(join(out, id + '_' + kind + '.pdf'), r.pdf); }
  }
}
/* portfolio and network: all places, and a list of 5 */
for (const kind of ['portfolio', 'network']) for (const n of [answers.length, 5]) for (const view of ['customer', 'operator']) {
  const items = answers.slice(0, n).map((x, i) => ({ site: { lat: x.A.place.lat, lon: x.A.place.lon, name: i % 3 ? null : 'Site ' + x.id, sector: i % 2 ? 'Retail' : null }, A: x.A }));
  if (n === 5) items.push({ site: { lat: 34.5, lon: 76.5, name: 'Outside point' }, A: { ok: false, why: 'the place forecast could not be read' } });
  let R; try { R = buildMulti(items, { kind, view, id: 'NGR-20261103-0000-0000000' + n % 10, dataDir, title: n === 5 ? 'Five sites' : null }); } catch (e) { ok(false, kind + ' ' + n + ' threw ' + e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
  const pdf = toPdf(R.cv, { title: R.title }), html = toHtml(R.cv, { title: R.title, id: 'x' }); const L = lint({ cv: R.cv, manifest: R.manifest, pdf, html, answer: { cannotHappen: [] } });
  ok(L.ok, kind + ' ' + n + ' sites ' + view + ' lint: ' + (L.failures || []).slice(0, 4).map((f) => f.code + ' p' + f.page + ' ' + f.what).join(' | '));
  ok(R.manifest.customerPages <= 2 && R.manifest.parts.includes('sites') && R.manifest.parts.includes('appendix'), kind + ' ' + n + ': summary + site blocks + appendix (' + R.manifest.parts.join(',') + ')');
  const ranks = R.manifest.sites.map((s) => s.worst); const ord = (w) => (w == null ? -1 : ['Normal', 'Low', 'Moderate', 'High', 'Severe'].indexOf(w)); ok(ranks.every((w, i) => !i || ord(ranks[i - 1]) >= ord(w)), kind + ' ' + n + ': ranked by the highest level');
  if (out && view === 'customer') writeFileSync(join(out, kind + '_' + n + '.pdf'), pdf);
}
/* scenario: the saved results in the folder (scen_<id>.json = {answer, scenario}) */
for (const f of readdirSync(dir).filter((f) => f.startsWith('scen_'))) { const S = JSON.parse(readFileSync(join(dir, f), 'utf8')); const A = { ...S.answer, scenario: S.scenario };
  for (const view of ['customer', 'operator']) { let r; try { r = one(A, 'scenario', view, 'NGR-20261103-0000-5ce0a000'); } catch (e) { ok(false, f + ' scenario threw ' + e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
    ok(r.L.ok, f + ' scenario ' + view + ' lint: ' + (r.L.failures || []).slice(0, 4).map((x) => x.code + ' p' + x.page + ' ' + x.what).join(' | '));
    ok(r.R.manifest.sections.some((s) => s.title === 'scenCompare' || s.title === 'mcPanel'), f + ' scenario: what-if or Monte Carlo panel drawn');
    if (out && view === 'customer') writeFileSync(join(out, f.replace('.json', '.pdf')), r.pdf); } }
console.log('kinds.unit: ' + pass + ' pass, ' + fail + ' fail (' + answers.length + ' places)'); process.exit(fail ? 1 : 0);
