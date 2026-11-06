/* v91.17.283.47 (NIGRAAN 1.0.8, hazard-layer change set) · server tests: pure functions on the laptop record and the tree data, then the
   served answers of a running server (argv[2] / NIGRAAN_BASE; skipped when none answers).
   2   combined flood: never Normal where a pathway that can happen is not tested or missing; the highest tested level otherwise
   1   GLOF site context: no level word anywhere (glof.mjs wordOf, AI facts), no client alert, the served answer says context
   3   the rain history refreshes at the PKT day turn (the root cause of the nightly run-off outage); the feed-health agent raises
       a provider model whose runs stopped and a layer whose inputs are not current
   4   /api/levels?layer=aqi: the served values with the US EPA classes, kind value, never in the all-layer answer
   5   availability: a layer with no current tehsil is "temporarily_unavailable" with the last good run / complete result
   R   owner rule: landslide cannot happen only from the GIRI table (0 inventory events inside), cyclone beyond the record's inland reach,
       the unit answer's "Not relevant here" line
   usage: node scripts/tests28347/server47.test.mjs [base] [engine-latest.json of the laptop] */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || null; const REC = process.argv[3] || process.env.NIGRAAN_LAPTOP_RECORD || null;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(typeof i === 'string' ? i : JSON.stringify(i)).slice(0, 700) : '')); } };
const D = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
const H = await import(join(ROOT, 'server/api/hazsci.mjs'));

/* ---------------- 2 · combined flood ---------------- */
{ const c = H.combineFloodCell; const R = 'river flooding', P = 'flooding from local rain';
  ok(c([[R, -4], [P, 0]]).L === 0, '2.1 river cannot happen + local rain Normal -> Normal (the only pathway is tested)');
  ok(c([[R, -5, 'level not tested here: ungauged'], [P, 0]]).L === -5, '2.2 ungauged river + local rain Normal -> not tested (never Normal)');
  ok(c([[R, 0], [P, -1, 'not assessed: the rain this level reads is not assessed (not tested: too few events)']]).L === -5, '2.3 local rain not assessed because its rain is not tested -> not tested');
  ok(c([[R, 0], [P, -1, 'no data']]).L === -1, '2.4 a pathway with missing data -> missing, never Normal');
  const x = c([[R, 3], [P, -5]]); ok(x.L === 3 && x.facts.atLeast === true && x.facts.notTested[0] === P, '2.5 a tested pathway above Normal is kept (at least that level), the untested one named', x);
  ok(c([[R, 1], [P, 2]]).L === 2, '2.6 both tested -> the highest (gate rule: max of pathways)');
  ok(c([[R, 0], [P, 0]]).L === 0, '2.7 both tested and Normal -> Normal');
  ok(c([[R, -4], [P, -4]]).L === -4, '2.8 both cannot happen -> cannot happen');
  ok(c([[R, -6], [P, 0]]).L === -6, '2.9 an input not current -> input not current');
  if (REC) { const rec = JSON.parse(readFileSync(REC, 'utf8')); H.applyFloodCombined(rec); let bad = 0, n0 = 0;
    for (const d of rec.days) { const F = d.layers.flood, Rv = d.layers.flood_riverine, Pl = d.layers.flood_pluvial; if (!F) continue;
      for (const [u, L] of Object.entries(F.L)) { const r = Rv ? Rv.L[u] : undefined, p = Pl ? Pl.L[u] : undefined; if (L === 0) { n0++; if ((r !== -4 && r !== 0) || p !== 0) bad++; } } }
    ok(!bad && n0 > 0, '2.10 laptop record: every combined Normal has every possible pathway tested and Normal (' + n0 + ' cell-days Normal, ' + bad + ' wrong)');
    const d0 = rec.days[0].layers.flood; const cnt = {}; for (const v of Object.values(d0.L)) cnt[v] = (cnt[v] || 0) + 1;
    ok(cnt[0] < 576 && (cnt[-5] || 0) > 0, '2.11 laptop record day 0: no longer 576 Normal ' + JSON.stringify(cnt)); }
}
/* ---------------- R · landslide GIRI rule ---------------- */
{ const P = D('landslide-possible.json');
  ok(P.eventCheck && P.eventCheck.passed === true && P.eventCheck.inCannotHappen.length === 0 && P.eventCheck.events > 200, 'R.1 GIRI table: 0 of ' + P.eventCheck.events + ' inventory landslides in a cannot-happen tehsil');
  ok(P.counts.cannotHappen > 100 && P.counts.possible > 300, 'R.2 GIRI table counts ' + JSON.stringify(P.counts));
  const L = {}, S = {}; for (const u of Object.keys(P.units)) L[u] = -1;
  const rec = { days: [{ day: 0, date: '2026-11-02', layers: { landslide: { L: { ...L }, S: {} } } }] };
  const app_ = D('hazard-applicability.json'); const mask = app_.layers.landslide.units; const units = {}; for (const u of Object.keys(P.units)) units[u] = { days: [{ date: '2026-11-02', ratio: 1 }] };
  H.applyLandslide(rec, { mask, groups: D('landslide-groups.json'), possible: P, odds: { ready: true, units } }); const SL = rec.days[0].layers.landslide;
  const wrong = Object.entries(P.units).filter(([u, x]) => (x.possible === false) !== (SL.L[u] === -4)).map(([u]) => u);
  ok(!wrong.length, 'R.3 landslide -4 exactly where GIRI says it cannot happen', wrong.slice(0, 5));
  ok(Object.entries(SL.L).filter(([u, v]) => v === -5).every(([u]) => mask[u] && mask[u].applies === false), 'R.4 the other flat tehsils are "no local steep ground; debris possible" (not tested), never cannot happen');
  ok(Object.values(SL.why || {}).filter((w) => /cannot happen/.test(w)).every((w) => /GIRI/.test(w)), 'R.5 every landslide "cannot happen" names its source (GIRI)'); }
/* ---------------- R · cyclone inland reach ---------------- */
{ const { createRefLayers } = await import(join(ROOT, 'server/api/reflayers.mjs')); const T = D('pk-tehsils.json');
  const cen = (g) => { const R = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]; let x = 0, y = 0; for (const p of R) { x += p[0]; y += p[1]; } return [y / R.length, x / R.length]; };
  const app = { units: { tehsil: T.features.filter((f) => !/Occupied/.test(f.properties.province)).map((f) => { const [lat, lon] = cen(f.geometry); return { unitId: f.properties.uid, key: f.properties.key, lat, lon }; }) } };
  const C = createRefLayers(app, join(ROOT, 'data')).layer('cyclone'); const cnt = {}; for (const v of Object.values(C.levels)) cnt[v] = (cnt[v] || 0) + 1;
  const Y = D('cyclone-climatology.json'); const gale = new Set(Object.values(Y.units).filter((u) => u.galeStorms > 0).map((u) => u.uid));
  ok(C.inlandReach && C.inlandReach.km > 200 && C.inlandReach.km < 400, 'R.6 the inland reach is read from the record: ' + JSON.stringify(C.inlandReach));
  ok(![...gale].some((u) => C.levels[u] === -4), 'R.7 no tehsil that reached gale on the record is "cannot happen"');
  ok((cnt[-4] || 0) > 400 && (cnt[0] || 0) > 0 && (cnt[0] || 0) < 100, 'R.8 cyclone counts ' + JSON.stringify(cnt) + ' (was 517 "No gale on record")'); }
/* ---------------- 1 · GLOF words ---------------- */
{ ok(!Object.values(H.GLOF_EXPOSURE_WORD).some((w) => /^(Priority|Watch)\b/.test(w)) && Object.values(H.GLOF_EXPOSURE_WORD).every((w) => /site context/.test(w)), '1.1 the GLOF exposure words are site context, not Priority / Watch');
  const E = await import(join(ROOT, 'server/api/engine.mjs')); ok(E.GLOF_CONTEXT && E.GLOF_CONTEXT.notALevel === true && E.GLOF_CONTEXT.canAlert === false, '1.2 the served GLOF answer is context (not a level, no alert)');
  const S = await import(join(ROOT, 'server/api/served.mjs')); ok(/never an alert/.test(S.NO_CLIENT_ALERT.glof), '1.3 no GLOF client alert');
  const g = readFileSync(join(ROOT, 'server/api/glof.mjs'), 'utf8'); ok(/const wordOf = \(c\) => \{ if \(process\.env\.NIGRAAN_GLOF_LEVEL_WORDS !== '1'\) return null;/.test(g), '1.4 glof.mjs gives no level word (reports read g.word)');
  const ai = readFileSync(join(ROOT, 'server/api/ai.mjs'), 'utf8'); ok((ai.match(/glofCtx\(g\)/g) || []).length === 2 && /tehsilsWithLakesUpstream/.test(ai), '1.5 the AI facts carry GLOF context, no level'); }
/* ---------------- 3 · the day-turn refresh of the rain history ---------------- */
{ const { createLandslideOdds } = await import(join(ROOT, 'server/api/landslideodds.mjs'));
  const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10); const now = Date.now(); const midnight = Date.parse(pkt(now) + 'T00:00:00+05:00');
  const tryAt = async (atMs) => { const dir = mkdtempSync(join(tmpdir(), 'h47ls-')); writeFileSync(join(dir, 'landslide-odds-model.json'), readFileSync(join(ROOT, 'data', 'landslide-odds-model.json'))); writeFileSync(join(dir, 'landslide-rain.json'), JSON.stringify({ at: new Date(atMs).toISOString(), units: { a: { at: new Date(atMs).toISOString(), obs: {}, fc: {} } } }));
    let calls = 0; const app = { units: { tehsil: [{ unitId: 'a', key: 'a', lat: 30, lon: 70 }] }, provider: { configured: () => true, call: async () => { calls++; throw new Error('test: no network'); } } };
    const L = createLandslideOdds(app, dir); L.tick(); await new Promise((r) => setTimeout(r, 300)); rmSync(dir, { recursive: true, force: true }); return calls; };
  const before = midnight - 30 * 60e3, after = Math.min(now - 60e3, midnight + 30 * 60e3);
  if (now - before < 6 * 3600e3) ok(await tryAt(before) > 0, '3.1 history last refreshed before PKT midnight (under 6 h ago): the tick refreshes at the day turn');
  else ok(true, '3.1 skipped (more than 6 h after PKT midnight: the 6 h rule refreshes anyway)');
  if (after > midnight) ok(await tryAt(after) === 0, '3.2 history refreshed after PKT midnight and under 6 h old: no extra refresh');
  process.env.NIGRAAN_RAIN_DAYTURN = '0'; if (now - before < 6 * 3600e3) ok(await tryAt(before) === 0, '3.3 NIGRAAN_RAIN_DAYTURN=0 = 1.0.7 (no day-turn refresh)'); delete process.env.NIGRAAN_RAIN_DAYTURN; }
/* ---------------- 3 · feed health: model runs and layer inputs ---------------- */
{ const FH = await import(join(ROOT, 'scripts/agents/feed_health.mjs')); const dir = mkdtempSync(join(tmpdir(), 'h47fh-')); mkdirSync(join(dir, 'agents', 'feed'), { recursive: true });
  const now = Date.now(); const iso = (t) => new Date(t).toISOString();
  writeFileSync(join(dir, 'agents', 'feed', 'server-feeds.json'), JSON.stringify({ at: iso(now - 60e3), feeds: {
      run_forecast_dwd_icon_eps: { label: 'Provider model run dwd_icon_eps (forecast)', configured: true, lastPoll: '2026-10-06T03:30:47.000Z', lastError: null, everyMs: 12 * 3600e3, everyWhat: 'test', startedAt: iso(now - 3 * 864e5) },
      run_forecast_dwd_icon: { label: 'Provider model run dwd_icon (forecast)', configured: true, lastPoll: iso(now - 3 * 3600e3), lastError: null, everyMs: 6 * 3600e3, everyWhat: 'test', startedAt: iso(now - 3 * 864e5) } },
    layerInputs: { at: iso(now - 30 * 60e3), day: pkt0(now), layers: { nss_runoff: { total: 576, notCurrent: 575, current: 0, why: 'input not current: the model rain of the 5 days before ...' }, heat: { total: 576, notCurrent: 0, current: 576 }, rain_hz: { total: 576, notCurrent: 10, current: 566, why: 'x' } } } }));
  function pkt0(t) { return new Date(t + 5 * 3600e3).toISOString().slice(0, 10); }
  const r1 = FH.run({ app: ROOT, dataDir: dir, copiesDir: join(dir, 'copies'), adminDir: null, now }); const r2 = FH.run({ app: ROOT, dataDir: dir, copiesDir: join(dir, 'copies'), adminDir: null, now: now + 10 * 60e3 });
  const F = r2.state.feeds;
  ok(F.srv_run_forecast_dwd_icon_eps && F.srv_run_forecast_dwd_icon_eps.status === 'down', '3.4 a provider model with no new run for weeks is DOWN', F.srv_run_forecast_dwd_icon_eps);
  ok(F.srv_run_forecast_dwd_icon && F.srv_run_forecast_dwd_icon.status !== 'down', '3.5 a model on its cadence is not down', F.srv_run_forecast_dwd_icon && F.srv_run_forecast_dwd_icon.status);
  ok(F.inputs_nss_runoff && F.inputs_nss_runoff.status === 'down' && /575 of 576/.test(F.inputs_nss_runoff.detail), '3.6 the run-off layer with no current tehsil is DOWN with the count and reason', F.inputs_nss_runoff);
  ok(F.inputs_rain_hz && F.inputs_rain_hz.status === 'late' && F.inputs_heat && F.inputs_heat.status === 'ok', '3.7 some tehsils not current = LATE; all current = ok');
  ok(r2.alerts.some((a) => a.feed === 'inputs_nss_runoff' && a.to === 'down') && r2.alerts.some((a) => a.feed === 'srv_run_forecast_dwd_icon_eps'), '3.8 the second agreeing check writes the operator alerts (alerts.jsonl / admin line)', r2.alerts.map((a) => a.text));
  const V = await import(join(ROOT, 'scripts/agents/verify.mjs')); const fs = V.feedDaySummary(dir, now + 10 * 60e3);
  ok(fs.assessed && fs.lateOrDownNow.some((x) => x.feed === 'inputs_nss_runoff') && fs.lateOrDownNow.some((x) => x.feed === 'srv_run_forecast_dwd_icon_eps') && /late or down now/.test(fs.line), '3.10 the daily operator summary lists the stale inputs: ' + fs.line);
  rmSync(dir, { recursive: true, force: true }); }

/* ---------------- the running server ---------------- */
async function J(path, op) { const r = await fetch(BASE + path, { headers: op ? { 'X-AGN-View': 'operator' } : {} }); return r.json(); }
let up = false; if (BASE) try { up = (await fetch(BASE + '/health')).ok; } catch (_) { up = false; }
if (!up) console.log('SKIP the served answers: no server at ' + BASE);
else {
  const g = await J('/api/levels?layer=glof&day=0'); ok(g.kind === 'context' && g.notALevel === true && g.contextWords && !Object.values(g.levels).some((v) => v >= 0), '1.6 served GLOF: context, no level in any tehsil');
  const al = await J('/api/alerts'); ok(!(al.rows || []).some((a) => a.hazard === 'glof'), '1.7 no GLOF row in the client alerts');
  const a = await J('/api/levels?layer=aqi&day=0'); const vals = Object.values(a.levels || {});
  ok(a.ready === true && a.kind === 'value' && a.canAlert === false && a.words && a.words[0] === 'Good' && vals.length >= 500, '4.1 /api/levels?layer=aqi: served values with the US EPA classes', { ready: a.ready, kind: a.kind, words: a.words, n: vals.length, why: a.why });
  ok(a.coverage && /tehsils have an air-quality value/.test(a.coverage.line), '4.2 the air-quality coverage line', a.coverage);
  const all = await J('/api/levels?day=0'); ok(all.layers && !('aqi' in all.layers), '4.3 air quality is not part of the all-layer (hazard) answer');
  const rf = await J('/api/levels?layer=flood&day=0'); const rc = {}; for (const v of Object.values(rf.levels || {})) rc[v] = (rc[v] || 0) + 1;
  ok(rf.from === 'flood_riverine' && (rc[-4] || 0) > 0, '2.12 client flood = river flooding with "cannot happen" where no channel ' + JSON.stringify(rc));
  const fo = await J('/api/levels?layer=flood&day=0', true); const fc = {}; for (const v of Object.values(fo.levels || {})) fc[v] = (fc[v] || 0) + 1;
  ok((fc[0] || 0) < 576, '2.13 operator combined flood: not 576 Normal ' + JSON.stringify(fc) + (fo.hazSciNote || ''));
  const cy = await J('/api/levels?layer=cyclone&day=0'); ok(cy.inlandReach && Object.values(cy.levels).filter((v) => v === -4).length === cy.inlandReach.cannotHappen, 'R.9 served cyclone: cannot happen beyond the inland reach ' + JSON.stringify(cy.inlandReach));
  const u = await J('/api/levels/unit?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City')); ok(u.notRelevant && /^Not relevant here: /.test(u.notRelevant.line) && u.notRelevant.names.includes('cyclone'), 'R.10 the unit answer: ' + (u.notRelevant && u.notRelevant.line));
  const ro = await J('/api/levels?layer=nss_runoff&day=0', true); const nc = Object.values(ro.levels || {}).filter((v) => v === -6).length, cur = Object.values(ro.levels || {}).filter((v) => v >= 0 || v === -5).length;
  ok(cur > 0 ? ro.availability && ro.availability.state === 'current' : ro.availability && ro.availability.state === 'temporarily_unavailable' && ro.availability.lastGoodText && ro.availability.reason, '5.1 run-off availability (' + nc + ' not current, ' + cur + ' current): ' + JSON.stringify(ro.availability));
  const rc2 = await J('/api/levels?layer=nss_runoff&day=0'); ok(rc2.hidden === true, '5.2 run-off stays hidden from clients (gate client_rules)');
  const mr = (await J('/api/levels?layer=heat&day=0')).modelRun; ok(!mr || !mr.runs || !mr.runs.dwd_icon_eps || (mr.staleDomains && mr.staleDomains.some((x) => x.domain === 'dwd_icon_eps')), '3.9 the run label names the stopped ICON-EPS run as stale', mr && mr.staleDomains);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
