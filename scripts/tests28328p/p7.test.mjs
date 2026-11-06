/* v91.17.283.28 · P7 (updated v91.17.283.29 · W1) · the Customize page runs no Monte Carlo of working days stopped (no random trials, no
   typed event ranges); its Scenario section prints the SERVER's scenario run (GET /api/scenario): one request for the place, one for the AJG
   sites (at most 40), the presets and bounds from the server.
   usage: node scripts/tests28328p/p7.test.mjs [base] */
import { T, src, N3, browser, open } from './lib.mjs';
const { ok, done } = T(); const S = src(N3);
ok(!/var EVDEF=|function simulate\(|function rng\(|function runLab\(|function runPf\(|Math\.random|RK_MC/.test(S), 'P7 static: EVDEF, the RNG, simulate, the network stress test and the method text are deleted');
ok(/id="l-server"/.test(S) && !/var LABSRV=/.test(S) && /\/api\/scenario\?/.test(S) && !/id="l-run"|id="l-pfrun"|id="l-asm"/.test(S), 'P7 static: the Scenario section reads /api/scenario (no page run buttons, no event table)');
const br = await browser(); const o = await open(br, '/customize'); await o.pg.waitForTimeout(8000);
const t0 = Date.now(); await o.pg.evaluate(() => NIGRAAN3.go('lab'));
await o.pg.waitForFunction(() => { const L = NIGRAAN3.lab.state; return !!(L.last && L.last.j); }, null, { timeout: 180000, polling: 1000 }).catch(() => {}); await o.pg.waitForTimeout(1500);
const r = await o.pg.evaluate(() => ({ t: document.getElementById('s-lab').innerText, j: !!(NIGRAAN3.lab.state.last && NIGRAAN3.lab.state.last.j && NIGRAAN3.lab.state.last.j.ok), presets: document.querySelectorAll('#l-presets button').length, run: typeof NIGRAAN3.runLab }));
const calls = o.log.filter((x) => x.t >= t0 && /^\/api\/scenario\?/.test(x.u));
ok(r.j && r.presets >= 2 && r.run === 'undefined' && /scenario run/i.test(r.t), 'P7 page: the Scenario tab prints the server run with the server presets', JSON.stringify({ j: r.j, presets: r.presets, t: r.t.slice(0, 200) }));
ok(calls.length >= 1 && calls.length <= 2, 'P7 page: opening Scenario asks the server once for the place (and once for the AJG sites)', calls.map((x) => x.u).join(', '));
ok(o.errs.length === 0, 'P7 no page error', o.errs.join(' | ')); await br.close(); done();
