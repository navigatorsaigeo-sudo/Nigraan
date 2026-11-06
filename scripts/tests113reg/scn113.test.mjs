/* v91.17.283.49 (NIGRAAN 1.0.10) · regressions vs 1.0.7.1 · item 2 · (updated v91.17.283.51 / 1.0.10.2: the what-if score is shown to customers; the core drivers drive it) · "Advanced: climate and land drivers" in the Scenario tab, customer
   (?operator=0) and operator view, end to end through the served scenario run (GET /api/scenario).
   - the section is there for the customer (no agn-op-only), collapsed, plain labels with units; no agency names; the page engine's 0-100
     scores and the engine's explanations are operator only;
   - the ground-wetness control starts at the server's current wetness percentile of the place;
   - every control that the served run takes changes the served request AND the served answer: rain rate and storm length (day rain =
     rate x length), ground wetness (wetPct, flood chance), temperature change (dT: heat / cold levels); a storm preset sends its rain and
     wetness; every other driver (humidity, wind, gust, water balance, VPD, root zone, NDVI, NDMI, NDWI, surface temperature, air mass,
     pressure, ventilation, mixing height, built-up, population, crop season) changes the drivers table and is named "not used by the
     server run" (no tested link), never silently dropped;
   - Monte Carlo: the served answer's 2,000-draw flood chance and its 90 % range are shown as served; the sweep runs (advanced envelopes);
     its page-engine core percentiles are operator only.
   Fails on 1.0.9: the section is operator only (customer cannot see it), no served result in it.
   usage: node scripts/tests113reg/scn113.test.mjs <base url> [out dir] */
const [BASE, OUT = '/dev/shm/scn113'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=700'] });
const pc = (p) => p == null ? '—' : (p < 0.01 ? (Math.round(p * 1000) / 10).toFixed(1) : Math.round(p * 100)) + ' %';
for (const VIEW of (process.env.VIEWS || 'customer,operator').split(',')) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } else { localStorage.removeItem('agn.operator'); localStorage.removeItem('agn.operator.v2'); } } catch (_) {} window.open = () => null; }, VIEW === 'operator');
  const pg = await ctx.newPage(); if (process.env.FREEZE_MS) { await pg.clock.install({ time: new Date(Number(process.env.FREEZE_MS)) }); await pg.clock.resume(); }   /* the browser clock = the test server's frozen clock (env FREEZE_MS) */
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const RUNS = []; pg.on('response', async (r) => { if (/\/api\/scenario\?/.test(r.url())) { let j = null; try { j = await r.json(); } catch (_) {} RUNS.push({ q: new URL(r.url()).searchParams, j }); } });
  await pg.goto(BASE + '/analyst' + (VIEW === 'operator' ? '' : '?operator=0'), { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(22000);
  await pg.evaluate(() => { if (window.driveFromPoint) window.driveFromPoint(33.6686, 73.0752, 'Islamabad I-8/3', true); }); await pg.waitForTimeout(8000);   /* a place, as a person picks one */
  await pg.click('#agn-tab-hybridlab', { timeout: 15000 }).catch(() => pg.evaluate(() => AGN.journey && AGN.journey.go('hybridlab'))); await pg.waitForTimeout(6000);
  const S0 = await pg.evaluate(() => { const d = document.getElementById('agnScnMore'), c = document.getElementById('cfeSection'); return { more: !!d, op: d ? d.classList.contains('agn-op-only') || c.classList.contains('agn-op-only') : null, vis: d ? !!d.offsetParent : false, open: d ? d.open : null, sum: d ? (d.querySelector('summary') || {}).innerText || '' : '' }; });
  ok(S0.more && S0.op === false && S0.vis, VIEW + ': the advanced section is shown (not operator only)', JSON.stringify(S0));
  ok(/Advanced: climate and land drivers/.test(S0.sum) && S0.open === false, VIEW + ': titled "Advanced: climate and land drivers", collapsed', JSON.stringify(S0));
  if (!S0.more || !S0.vis) { await pg.screenshot({ path: OUT + '/' + VIEW + '_nosection.png' }).catch(() => null); ok(errs.length === 0, VIEW + ': no page error', errs.join(' | ')); await ctx.close(); continue; }
  await pg.evaluate(() => { const d = document.getElementById('agnScnMore'); d.open = true; d.dispatchEvent(new Event('toggle')); d.scrollIntoView(); });
  const served = () => pg.waitForFunction(() => { const h = document.getElementById('agnScn113Served'); return h && h.querySelector('table,p') && !h.getAttribute('aria-busy') && /Result from the NIGRAAN server/.test(h.innerText); }, null, { timeout: 120000 }).then(() => true, () => false);
  ok(await served(), VIEW + ': the served result appears in the section');
  await pg.waitForTimeout(4000); await served();
  const vis = await pg.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !!(e && e.offsetParent && e.getBoundingClientRect().height > 0); };
    const t = document.getElementById('agnScnMore').innerText; return { t, compare: v('#cfeCompareGrid'), integ: v('.scenario-integrity'), prov: v('.cfe-provenance'), lock: v('.scenario-lock'), smalls: [...document.querySelectorAll('#cfeSection .scenario-control small')].filter((e) => e.offsetParent).length }; });
  for (const w of ['Rain rate', 'Storm length', 'Ground wetness before the storm', 'mm/h']) ok(vis.t.includes(w), VIEW + ': plain label "' + w + '"');
  ok(!/\b(PMD|FFD|EWS|IRSA|EPD)\b/.test(vis.t), VIEW + ': no agency name in the section', (vis.t.match(/.{0,30}\b(PMD|FFD|EWS|IRSA|EPD)\b.{0,30}/) || [''])[0]);
  /* v91.17.283.51 (1.0.10.2, owner 3 Nov): the what-if score (#cfeCompareGrid) is shown to customers again, labelled once */
  if (VIEW === 'customer') ok(vis.compare && !vis.integ && !vis.prov && !vis.lock && vis.smalls === 0, 'customer: the what-if score is shown; badges, boundary notes and control notes are hidden', JSON.stringify({ c: vis.compare, i: vis.integ, p: vis.prov, l: vis.lock, s: vis.smalls }));
  else ok(vis.compare && vis.prov, 'operator: the page engine scores and the scientific boundary stay', JSON.stringify({ c: vis.compare, p: vis.prov }));
  /* the wetness control starts at the server's wetness percentile */
  const first = RUNS.find((x) => x.j && x.j.places && !x.q.has('wetPct')); const F0 = first && first.j.places[0] && first.j.places[0].floodOutcome;
  const wv = await pg.evaluate(() => { const e = document.getElementById('ctl-wetness'); return e ? +e.value : null; });
  if (F0 && F0.wetness) ok(Math.round(F0.wetness.pct) === wv, VIEW + ': ground wetness starts at the served percentile (' + F0.wetness.pct + ' -> ' + wv + ')', JSON.stringify(F0.wetness));
  else { const r0 = RUNS.filter((x) => x.j && x.j.places).pop(); ok(!!F0 && r0 && !r0.q.has('wetPct'), VIEW + ': the served wetness is not held here (' + (F0 && F0.why) + '): the control is not sent until the person sets it', r0 && r0.q.toString()); }
  /* each control: set, wait for the served run, compare */
  const setv = (id, v) => pg.evaluate(([id, v]) => { const e = document.getElementById(id); if (!e) return false; if (e.type === 'checkbox') { e.checked = !!v; e.dispatchEvent(new Event('change', { bubbles: true })); } else { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } return true; }, [id, v]);
  const tab = async (h) => { await pg.click('#cfeHazardTabs button[data-scenario-hazard="' + h + '"]'); await pg.waitForTimeout(2500); await served(); };
  const nextRun = async (n0) => { for (let i = 0; i < 90 && RUNS.length <= n0; i++) await pg.waitForTimeout(1000); await pg.waitForTimeout(1500); await served(); return RUNS[RUNS.length - 1]; };
  const panel = () => pg.evaluate(() => { const h = document.getElementById('agnScn113Served'); if (!h) return { q: '', ck: '', used: '', not: '', t: '' }; return { q: h.dataset.q, ck: h.dataset.checksum, used: (h.querySelector('.s113-used') || {}).textContent || '', not: (h.querySelector('.s113-not') || {}).textContent || '', t: h.innerText }; });
  const advRows = () => pg.evaluate(() => (document.getElementById('cfeAdvancedRows') || {}).textContent || '');
  const flood = (r) => { const F = r && r.j && r.j.places && r.j.places[0] && r.j.places[0].floodOutcome; return F && F.scenario ? F.scenario.p : null; };
  await tab('flood');
  let n0 = RUNS.length; await setv('ctl-wetness', 60); await nextRun(n0);   /* the person sets the ground wetness first, so the flood model runs where the served wetness is not held */
  n0 = RUNS.length; await setv('ctl-rainIntensity', 20); let r1 = await nextRun(n0); const dur = await pg.evaluate(() => +document.getElementById('ctl-duration').value);
  ok(r1 && +r1.q.get('rainMm') === Math.round(20 * dur * 10) / 10, VIEW + ' rain rate: served run asked with day rain = rate x length (' + (r1 && r1.q.get('rainMm')) + ' mm)', r1 && r1.q.toString());
  let P1 = await panel(); ok(/day rain/.test(P1.used), VIEW + ' rain rate: the panel names what was sent', P1.used);
  n0 = RUNS.length; await setv('ctl-duration', 3); let r2 = await nextRun(n0);
  ok(r2 && +r2.q.get('rainMm') === 60 && r2.j && r2.j.checksum !== (r1.j && r1.j.checksum), VIEW + ' storm length: day rain 20 x 3 = 60 mm and a different served answer', r2 && r2.q.toString());
  ok(flood(r2) != null && flood(r1) != null && flood(r2) > flood(r1), VIEW + ' storm length: more rain gives a higher served flood chance (' + flood(r1) + ' -> ' + flood(r2) + ')');
  n0 = RUNS.length; await setv('ctl-wetness', 95); let r3 = await nextRun(n0);
  ok(r3 && +r3.q.get('wetPct') === 95, VIEW + ' ground wetness: sent as the wetness percentile', r3 && r3.q.toString());
  ok(flood(r3) != null && flood(r3) > flood(r2), VIEW + ' ground wetness: the served flood chance moves (' + flood(r2) + ' -> ' + flood(r3) + ')');
  /* Monte Carlo as served */
  const O = r3 && r3.j && r3.j.places[0] && r3.j.places[0].outcomes; P1 = await panel();
  ok(O && O.flood && (O.flood.modelled ? P1.t.includes(pc(O.flood.p)) && P1.t.includes(pc(O.flood.range90[0])) && O.flood.draws === 2000 : P1.t.includes(O.flood.why || '')), VIEW + ' Monte Carlo: the served 2,000-draw flood chance and its 90 % range are shown as served', JSON.stringify(O && O.flood).slice(0, 300));
  /* a storm preset */
  n0 = RUNS.length; await pg.evaluate(() => { const b = [...document.querySelectorAll('#cfeScenarioButtons button')].find((x) => /Cloudburst/.test(x.textContent)); if (b) b.click(); }); let r4 = await nextRun(n0);
  ok(r4 && +r4.q.get('rainMm') === 130 && +r4.q.get('wetPct') === 78, VIEW + ' storm preset "Cloudburst test": 65 mm/h x 2 h = 130 mm, wetness 78', r4 && r4.q.toString());
  /* the drivers the served run has no tested link for: shown, named, and in the drivers table */
  const ADV = [['adv-ndviAnom', -0.2, 'Vegetation greenness change'], ['adv-ndmiAnom', -0.15, 'Plant moisture change'], ['adv-ndwiChange', 0.2, 'Open water change'], ['adv-lstAnom', 4, 'Ground surface temperature change'],
    ['adv-t850Delta', 3, 'Air-mass temperature change'], ['adv-mslpDelta', 5, 'Sea-level pressure change'], ['adv-ventPct', 20, 'Air ventilation'], ['adv-blhPct', 15, 'Mixing height'], ['adv-builtUpPct', 80, 'Built-up area'], ['adv-popDensity', 9000, 'Population density']];
  for (const [id, v, w] of ADV) { const a0 = await advRows(); const has = await setv(id, v); if (!has) { ok(false, VIEW + ' ' + id + ': control present'); continue; } await pg.waitForTimeout(2500); await served(); const a1 = await advRows(); const P = await panel();
    ok(a1 !== a0 && P.not.includes(w), VIEW + ' ' + w + ': the drivers table changes and the panel names it "not used by the server run"', JSON.stringify({ changed: a1 !== a0, not: P.not.slice(0, 200) })); }
  { const a0 = await advRows(); await setv('adv-phenology', false); await pg.waitForTimeout(2500); await served(); const a1 = await advRows(); const P = await panel(); ok(a1 !== a0 && P.not.includes('Crop growing season'), VIEW + ' Crop growing season: changes the drivers table, named as not used'); }
  await tab('heat');
  n0 = RUNS.length; await setv('ctl-tempDelta', 4); let r5 = await nextRun(n0);
  const pk = (r, k) => { const H = r && r.j && r.j.places[0] && r.j.places[0].scenario && r.j.places[0].scenario.hazards[k]; return H ? (H.days || []).map((d) => d.assessed ? d.score : null).join(',') : null; };
  ok(r5 && +r5.q.get('dT') === 4, VIEW + ' temperature change: sent as dT', r5 && r5.q.toString());
  const r5b = RUNS.filter((x) => x.j && x.j.places && !x.q.has('dT')).pop();
  ok(r5 && r5b && (pk(r5, 'heat') !== pk(r5b, 'heat') || pk(r5, 'cold') !== pk(r5b, 'cold')), VIEW + ' temperature change: the served heat / cold scores move', JSON.stringify([pk(r5b, 'heat'), pk(r5, 'heat')]));
  /* v91.17.283.51: the core drivers the served run does not take now drive the what-if score: the what-if block moves, they are not named "not used" */
  const wi = () => pg.evaluate(() => ['#cfeCompareGrid', '.agn-wi51-drivers'].map((s) => { const e = document.querySelector(s); return e && e.offsetParent ? e.innerText : ''; }).join('|'));
  for (const [id, v, w] of [['ctl-rhDelta', 15, 'Humidity change'], ['ctl-windPct', 60, 'Wind strength']]) { const w0 = await wi(); await setv(id, v); await pg.waitForTimeout(2500); await served(); const P = await panel(); const w1 = await wi(); ok(w1 !== w0 && !P.not.includes(w), VIEW + ' ' + w + ': moves the what-if block, not named as not used', JSON.stringify({ moved: w1 !== w0, not: P.not })); }
  await tab('wind'); for (const [id, v, w] of [['ctl-windAdd', 20, 'Wind speed change'], ['ctl-gustAdd', 50, 'Gust change']]) { const w0 = await wi(); const dis = await pg.evaluate((id) => { const e = document.getElementById(id); return !e || e.disabled; }, id); if (dis) { console.log('NOTE ' + id + ' off at this place (input missing)'); continue; } await setv(id, v); await pg.waitForTimeout(2500); await served(); const P = await panel(); const w1 = await wi(); ok(w1 !== w0 && !P.not.includes(w), VIEW + ' ' + w + ': moves the what-if block, not named as not used', JSON.stringify({ moved: w1 !== w0, not: P.not })); }
  await tab('drought'); for (const [id, v, w] of [['ctl-wbDelta', -20, 'Rain minus evaporation change'], ['ctl-vpdAdd', 1, 'Air dryness change'], ['ctl-rootDelta', -0.05, 'Root-zone moisture change']]) { const ex = await setv(id, v); if (!ex) { console.log('NOTE ' + id + ' not on this place (root-zone baseline missing)'); continue; } await pg.waitForTimeout(2500); await served(); const P = await panel(); const dis = await pg.evaluate((id) => document.getElementById(id).disabled, id); ok(dis || !P.not.includes(w), VIEW + ' ' + w + ': off here (input missing) or drives the what-if score (not named as not used)', P.not); }
  /* the sweep (Monte Carlo of the drivers) */
  await tab('heat');   /* a pathway with its core inputs held at the place */
  await pg.evaluate(() => document.querySelectorAll('#cfeSweepVariables input[type=checkbox]').forEach((c) => { if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }));   /* every driver in the sweep */
  await pg.selectOption('#cfeSweepN', '250').catch(() => null); n0 = RUNS.length; await pg.click('#cfeRunSweep'); await pg.waitForTimeout(4000);
  const sw = await pg.evaluate(() => { const r = document.getElementById('cfeSweepResult'); const v = (s) => { const e = r.querySelector(s); return !!(e && e.offsetParent); }; const core = [...r.children].filter((e) => !e.classList.contains('sweep-advanced-table') && e.tagName !== 'P'); return { adv: v('.sweep-advanced-table'), kpi: core.some((e) => !!e.offsetParent), coreTxt: core.map((e) => e.textContent.slice(0, 60)).join(' | '), n: (window.AGN_SCENARIO_LAST || {}).samples }; });   /* the page engine's core part: percentiles, or its own 'insufficient core inputs' line */
  ok(sw.adv && sw.n === 250, VIEW + ' sweep: 250 reproducible samples, the driver envelopes shown', JSON.stringify(sw));
  ok(VIEW === 'customer' ? !sw.kpi : sw.kpi, VIEW + ' sweep: page-engine core percentiles ' + (VIEW === 'customer' ? 'hidden' : 'shown'), JSON.stringify(sw));
  ok(RUNS.length > n0 || (await panel()).t.includes('Monte Carlo'), VIEW + ' sweep: the served Monte Carlo is refreshed with it');
  await pg.screenshot({ path: OUT + '/' + VIEW + '_section.png', fullPage: false }).catch(() => null);
  ok(errs.length === 0, VIEW + ': no page error', errs.join(' | ')); await ctx.close();
}
await br.close(); console.log('scn113: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
