/* v91.17.283.31 · page lane · 1.5 readiness badge, 4.4 loading versus unavailable, 4.6 coverage line, 4.8 service line, 4.9 top chip and
   place names. Routed or injected states (the test server cannot make a provider fail on demand). */
import { T, browser, open, consoleReady } from '../tests28328p/lib.mjs';
const t = T(); const br = await browser();
/* v283.36 items 8/14: the console has no default place, so the place-bound states are tested with a place handed over */
const o = await open(br, '/analyst#agnplace=33.68440,73.04790,Islamabad', { route: async (pg) => { await pg.route('**/api/readiness', (r) => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ ready: false, stale: [{ product: 'Heavy rain', inputAge: '52 h', why: 'the newest forecast run held is 27 Oct 00 UTC' }] }) })); } });
const pg = o.pg; await consoleReady(pg); await pg.waitForTimeout(6000);
const wake = async (ms) => { const n = Math.ceil(ms / 1000); for (let k = 0; k < n; k++) { await pg.mouse.move(5 + (k % 7), 5 + (k % 5)); await pg.waitForTimeout(1000); } };
/* 1.5 */
const pill = await pg.evaluate(() => { const e = document.getElementById('agnBackendPill'); return e ? { amber: e.classList.contains('agn31-amber'), title: e.title } : null; });
t.ok(pill && pill.amber && /Heavy rain/.test(pill.title) && /52 h/.test(pill.title), '1.5 badge amber with the stale product and its age', JSON.stringify(pill));
/* 4.4: a value that is loading shows a spinner; after 45 s without a value it says why */
/* v91.17.283.33 · deterministic: the tile is judged by AGN.v28331.tiles() directly (the left panel re-renders on its own and would drop an injected tile) */
const mk = `(function(seenAgo){ var L=document.getElementById('mpLeftIn'); var o=document.getElementById('agn31TestTile'); if(o) o.remove(); var c=document.createElement('div'); c.className='mp-c'; c.id='agn31TestTile'; c.innerHTML='<div class="k">Test value</div><div class="v">… mm</div>'; L.appendChild(c); c.__agn31seen=Date.now()-seenAgo; AGN.v28331.tiles(); return c.innerHTML; })`;
const t1 = await pg.evaluate(mk + '(2000)');
t.ok(/agn31-load/.test(t1) && !/Not available/.test(t1), '4.4 a loading value shows a spinner', t1);
const t2 = await pg.evaluate(mk + '(46000)');
t.ok(/Not available/.test(t2) && /agn31-why/.test(t2) && !/…/.test(t2.replace(/<[^>]+>/g, '')), '4.4 after 45 s: "Not available" with its reason, never "…" forever', t2);
const t3 = await pg.evaluate('(function(){ AGN.__psf0 = AGN.pointState.failed; AGN.pointState.failed = function(){ return true; }; var r = (' + mk + ')(13000); AGN.pointState.failed = AGN.__psf0; return r; })()');
t.ok(/Not available/.test(t3) && /without this value/.test(t3), '4.4 once the place read has settled (here: failed), a value still "…" after 12 s says so at once (no wall clock)', t3);
const t4 = await pg.evaluate('(function(){ AGN.__psf0 = AGN.pointState.failed; AGN.pointState.failed = function(){ return true; }; var r = (' + mk + ')(3000); AGN.pointState.failed = AGN.__psf0; var o=document.getElementById("agn31TestTile"); if(o) o.remove(); return r; })()');
t.ok(/agn31-load/.test(t4), '4.4 settled but within the 12 s grace: still a spinner (a later read may fill it)', t4);
const rh = await pg.evaluate(() => { const L = document.getElementById('mpLeftIn'); const c = [...L.querySelectorAll('.mp-c')].find((x) => /rain hours/i.test(x.textContent)); return c ? { txt: c.textContent.replace(/\s+/g, ' ').trim() } : null; });
if (rh && /—/.test(rh.txt)) t.ok(/Not held for this tehsil today/.test(rh.txt), '4.4 rain hours "—" names its reason', rh.txt); else console.log('SKIP 4.4 rain hours carries a value on this server: ' + JSON.stringify(rh));
/* 4.8 */
await pg.evaluate(() => { AGN.__psf = AGN.pointState.failed; AGN.pointState.failed = () => true; }); await wake(3500);
const sv = await pg.evaluate(() => { const n = document.getElementById('agn31Svc'); return { txt: n ? n.textContent : null, left: !!document.getElementById('mpLeftIn'), right: !!document.getElementById('mpRightIn') }; });
t.ok(sv.txt && /not available right now/.test(sv.txt) && sv.left && sv.right, '4.8 core forecast down: one service line, the rest stays', JSON.stringify(sv));
await pg.evaluate(() => { AGN.pointState.failed = AGN.__psf; }); await wake(3500);
t.ok(await pg.evaluate(() => !document.getElementById('agn31Svc')), '4.8 the service line goes when the forecast is back');
/* 4.6: coverage line from the area summary rows */
await pg.evaluate(() => { const b = document.querySelector('#agn31Tabs button[data-t="area"]'); if (b) b.click(); const R = document.getElementById('mpRightIn');
  const box = document.createElement('div'); box.id = 'agn31TestMps'; box.innerHTML = '<div class="mp-r agn-mps-r">a</div><div class="mp-r agn-mps-r">b</div><div class="agn-mps-na"><b>No data:</b> Heavy rain, glof</div>'; R.appendChild(box); });
await wake(2500);
const cv = await pg.evaluate(() => { const c = document.getElementById('agn31Cov'); return c ? { txt: c.textContent, vis: getComputedStyle(c).display } : null; });
const ex = await pg.evaluate(() => { const R = document.getElementById('mpRightIn'); const ok = R.querySelectorAll('.agn-mps-r').length; let n = 0; R.querySelectorAll('.agn-mps-na').forEach((e) => { n += (e.textContent || '').replace(/^[^:]*:\s*/, '').split(/,\s*/).filter(Boolean).length; }); return { ok, all: ok + n }; });
t.ok(cv && cv.txt.indexOf(ex.ok + ' of ' + ex.all + ' hazards assessed here') === 0 && /Heavy rain/.test(cv.txt) && cv.vis !== 'none', '4.6 coverage line "N of M hazards assessed here" with what is missing and why', JSON.stringify({ cv, ex }));
await pg.evaluate(() => { const b = document.getElementById('agn31TestMps'); if (b) b.remove(); });
/* 4.9 */
/* v283.36: the page hides an empty chip 20 s after it starts; with a place handed over the earlier steps can finish sooner, so wait until 22 s */
{ const el = await pg.evaluate(() => performance.now()); if (el < 22000) await wake(22000 - el); }
const top = await pg.evaluate(() => { const b = document.querySelector('#agnLive84 .hz.sk'); return b ? { gone: b.classList.contains('agn31-gone') || getComputedStyle(b).display === 'none', txt: b.textContent.trim() } : { gone: true }; });
t.ok(top.gone, '4.9 no empty chip in the top bar', JSON.stringify(top));
const nm = await pg.evaluate(() => [...document.querySelectorAll('.agn-hl88-side .rows .n')].slice(0, 12).map((e) => ({ t: e.textContent.trim(), cut: e.scrollWidth > e.clientWidth + 1, ov: getComputedStyle(e).textOverflow })));
t.ok(nm.length && nm.every((x) => !x.cut && x.ov !== 'ellipsis'), '4.9 nearby place names are not cut', JSON.stringify(nm.slice(0, 4)));
t.ok(o.errs.length === 0, 'no page errors', o.errs.join(' | '));
await br.close(); t.done();
