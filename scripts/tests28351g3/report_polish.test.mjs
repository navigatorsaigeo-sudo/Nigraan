/* v283.51g3 · ITEM 3 · report polish (unit level; the 10-place report run is t10.py against a test server):
   A  fog action: only fog hours still ahead (Clifton "Ready by Tue 3 Nov" for a fog hour already past); the action time is the first fog hour ahead
   B  dueText: an action time is never printed in the past ("now" instead)
   C  a not-assessed hazard prints the applicability rule's own reason on page 1 (Mithi landslide), not "no level issued for these days"
   D  a table header (and a section heading drawn just before it) never stays alone at the foot of a page: it moves with at least 2 rows */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 400) : '')); };
const R = await import(pathToFileURL(join(ROOT, 'server/api/report.mjs')));
const E = await import(pathToFileURL(join(ROOT, 'server/api/repengine.mjs')));
const now = Date.parse('2026-11-03T11:00:00Z');   /* 16:00 PKT */
{ const days = [{ date: '2026-11-03', fogHours: 2, fogAt: [5, 6] }, { date: '2026-11-04', fogHours: 3, fogAt: [4, 5, 6] }];
  const f = R.fogHoursAhead(days, now);
  ok(f.length === 1 && f[0].date === '2026-11-04' && f[0].when === '2026-11-04T04:00' && f[0].n === 3, 'A today\'s morning fog (05-06 h) is past at 16:00: no fog row for today; tomorrow from 04:00', JSON.stringify(f));
  const g = R.fogHoursAhead([{ date: '2026-11-03', fogHours: 4, fogAt: [5, 6, 20, 21] }], now);
  ok(g.length === 1 && g[0].n === 2 && g[0].when === '2026-11-03T20:00', 'A fog later today: only the hours ahead are counted', JSON.stringify(g));
  ok(R.fogHoursAhead([{ date: '2026-11-03', fogHours: 3 }], now).length === 0, 'A today without the fog hours\' times (a run stored before fogAt): no action (cannot tell what is past)');
  ok(R.fogHoursAhead([{ date: '2026-11-02', fogHours: 3, fogAt: [5] }], now).length === 0, 'A a past day never raises fog');
  const w = E.dueText(f[0].when, now); ok(w === 'by Wed 4 Nov, 04:00', 'A the fog action reads "Ready by Wed 4 Nov, 04:00"', w); }
{ ok(E.dueText('2026-11-03T05:00', now) === 'now' && E.dueText('2026-11-02', now) === 'now', 'B a past hour or day is due "now", never printed as a time', E.dueText('2026-11-03T05:00', now));
  ok(E.dueText('2026-11-03', now) === 'by Tue 3 Nov' && E.dueText('2026-11-05', now) === 'by Thu 5 Nov' && E.dueText(null, now) === '', 'B today / later days keep "by <day>"'); }
{ const r = { key: 'landslide', name: 'Landslide', state: 'missing', why: 'No local steep ground; debris from nearby slopes possible' };
  ok(E.SHORT_WHY(r) === 'no local steep ground; debris from nearby slopes possible', 'C page 1 prints the applicability reason', E.SHORT_WHY(r));
  ok(E.SHORT_WHY({ key: 'x', state: 'missing', why: null }) === 'no level issued for these days', 'C a row without a reason keeps the generic words'); }
{ const D = new E.Doc({}); D.newPage('appendix', 'Appendix');
  const rows = Array.from({ length: 6 }, (_, i) => ['Hazard ' + i, 'Not assessed', 'A reason long enough to wrap onto a second line in the narrow column of this table '.repeat(2)]);
  const cols = [{ t: 'Hazard', w: 0.22, b: true }, { t: 'State', w: 0.2 }, { t: 'Why', w: 0.58 }];
  D.y = D.H - 50 - 23 - 15 - 20;   /* room for the heading, the header and less than one row */
  D.section('Not assessed or not relevant here', 'appendix').items = rows.length; E.table(D, cols, rows, { title: 'Not assessed', part: 'appendix' });
  const pageOf = (s) => D.cv.pages.findIndex((p) => p.ops.some((o) => o.k === 'text' && o.s === s));
  const heads = D.cv.pages.map((p) => p.ops.filter((o) => o.k === 'text' && o.s === 'Hazard').length);
  ok(D.cv.pages.length === 2 && pageOf('Not assessed or not relevant here') === 1 && heads[0] === 0 && heads[1] === 1 && pageOf('Hazard 0') === 1 && pageOf('Hazard 1') === 1,
    'D heading + header moved to the next page with their rows (none left at the foot of page 1)', JSON.stringify({ pages: D.cv.pages.length, heads, heading: pageOf('Not assessed or not relevant here') }));
  ok(D.sections.filter((s) => s.title === 'Not assessed or not relevant here').length === 1 && D.sections.find((s) => s.title === 'Not assessed or not relevant here').page === 2 && D.sections.find((s) => s.title === 'Not assessed or not relevant here').items === 6, 'D the section list carries the heading once, on its new page, with its items');
  const D2 = new E.Doc({}); D2.newPage('appendix', 'Appendix'); D2.y = 200; D2.section('Short', 'appendix').items = 2; E.table(D2, cols, rows.slice(0, 2), { part: 'appendix' });
  ok(D2.cv.pages.length === 1, 'D a table that fits stays where it is'); }
console.log(`\n${fail ? 'FAIL' : 'PASS'} report_polish: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
