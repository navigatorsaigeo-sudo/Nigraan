/* v91.17.283.28 · P1 · the Assets tab is "Client Risk": tab label, panel title, help entry; no "Assets tab" wording left.
   usage: node scripts/tests28328p/p1.test.mjs [http://127.0.0.1:8787] */
import { T, src, MACH, browser, open, consoleReady, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(/<b>04<\/b> Client Risk<\/span>/.test(S) && !/<b>04<\/b> Assets<\/span>/.test(S), 'P1 static: the nav label is "04 Client Risk"');
ok(/<h2>Client Risk<\/h2>/.test(S) && !/<h2>Assets &amp; Exposure<\/h2>/.test(S), 'P1 static: the panel title is "Client Risk"');
ok(/assessments:\{title:'Client Risk'/.test(S) && !/in the Assets tab|Assets \\u203a Add sites|Assets › Add sites|'Assets & Exposure'/.test(S), 'P1 static: the help entry and every pointer name "Client Risk"');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg); await tab(o.pg, 'assessments');
const r = await o.pg.evaluate(() => ({ nav: document.querySelector('#machNav [data-goto="assessments"]').textContent.trim(), h2: document.querySelector('.view[data-view="assessments"] .asmt-hero h2').textContent.trim() }));
ok(/Client Risk/.test(r.nav) && r.h2 === 'Client Risk', 'P1 page: the tab reads "' + r.nav + '", the panel "' + r.h2 + '"', JSON.stringify(r));
ok(o.errs.length === 0, 'P1 page: no page error', o.errs.join(' | '));
await br.close(); done();
