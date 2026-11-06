/* ══ v91.17.283 · WS1 · THE PROVIDER CALL BUDGET (owner decision C, 20 Oct 2026; modes 21 Oct) ══════════════════════════════════════
   Weighted provider calls against the plan, with two priority classes:
     user        a request that serves a person now (the page, the AI answer, a point forecast);
     background  refreshes, keep-warm replays, learners, pairs, grids, the engine runner, the blend members.
   data/provider-budget.json "mode" (NIGRAAN_CALL_BUDGET_MODE overrides):
     monitor   (v283 default) count and report only; nothing is refused. /health shows the 30-day projection against the monthly plan,
               and an ops alert (store 'alerts', type provider_budget_projection) is raised when the projection exceeds the plan;
     shed      background calls are refused above shedBackgroundAtShare x dailyWeightedCap; a person's request is never refused;
     enforce   background shed as above, and every call refused at dailyWeightedCap.
   The cap, the share, the plan and the user-facing internal tags come from the file (re-read when it changes); nothing here is a number
   of its own. NIGRAAN_CALL_BUDGET=<n> overrides the cap, NIGRAAN_CALL_BUDGET=off turns the budget off (mock-provider test harnesses).
   USE is read, not estimated: the weighted calls already counted where each call is made (provider.mjs call() for backend jobs,
   provider.noteProxyCall() for every proxy fetch in server.mjs; same day window, same weight rule weightOf). This module adds, on that
   same window (saved with the store): budgetByClass, budgetByTag (the x-agn-internal tag, "page" for a person's page, "(backend job) <module>"
   for a call made outside any request, v283.26), budgetRefused (refused calls) and budgetWouldRefuse (what shed/enforce would have refused).
   The class and tag of the code that makes a call travel with AsyncLocalStorage: server.mjs runs each request in als.run({ cls, tag });
   code outside any request (timers, schedulers) is background.
   v91.17.283 · WS1 · PATCH3 (owner, 21 Oct): shed is the default mode; the day's cap may come from the plan (dailyFromPlan: plan / days of
   the UTC month), background calls carry a priority tier (tierRules) and are shed tier by tier as the day's background use passes each
   tier's level; a tier may turn to new 00/12 UTC runs only first (mainRunsOnlyAtBackgroundShare; modelruns.mjs mainUpdate does the run
   arithmetic for its callers); test mode (testMode / NIGRAAN_TEST_MODE) runs only the listed tiers, on main runs, and answers people cache
   first. Every number is a key of data/provider-budget.json. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const als = new AsyncLocalStorage();
export const CLASSES = ['user', 'background'];
export const MODES = ['monitor', 'shed', 'enforce'];
const TAG_MAX = 200;

export function createCallBudget({ dataDir, provider, store = null, env = process.env, alert = null }) {
  const file = join(dataDir, 'provider-budget.json');
  let cfg = null, mt = null, err = null;
  function load() {
    try {
      if (!existsSync(file)) { cfg = null; mt = null; err = 'data/provider-budget.json is not installed'; return cfg; }
      const m = statSync(file).mtimeMs; if (m === mt && (cfg || err)) return cfg;
      const j = JSON.parse(readFileSync(file, 'utf8'));
      const fromPlan = j.dailyFromPlan === true, cap = fromPlan ? null : Number(j.dailyWeightedCap), share = Number(j.shedBackgroundAtShare), plan = j.monthlyPlanWeighted == null ? null : Number(j.monthlyPlanWeighted);
      const mode = j.mode == null ? 'monitor' : String(j.mode);
      if (fromPlan && !(plan > 0)) throw new Error('dailyFromPlan needs monthlyPlanWeighted');
      if (!fromPlan && !(cap > 0)) throw new Error('dailyWeightedCap must be a positive number');
      if (!(share > 0 && share <= 1)) throw new Error('shedBackgroundAtShare must be in (0, 1]');
      if (!MODES.includes(mode)) throw new Error('mode must be one of ' + MODES.join(', '));
      if (plan != null && !(plan > 0)) throw new Error('monthlyPlanWeighted must be a positive number');
      /* v91.17.283 · WS1 · PATCH3 · background priority tiers (owner, 21 Oct): every threshold is a key of the file */
      let tiers = null, rules = null, hours = null, tm = null;
      if (j.tiers != null) {
        if (!Array.isArray(j.tiers) || !j.tiers.length) throw new Error('tiers must be a non-empty list');
        const shareOk = (v) => v == null || (Number(v) > 0 && Number(v) <= 10);
        tiers = new Map();
        for (const t of j.tiers) { if (!t || !t.id) throw new Error('every tier needs an id');
          if (!shareOk(t.shedAtBackgroundShare) || !shareOk(t.mainRunsOnlyAtBackgroundShare)) throw new Error('tier ' + t.id + ': a share must be null or a positive number');
          tiers.set(String(t.id), { id: String(t.id), what: t.what || null, shedAt: t.shedAtBackgroundShare == null ? null : Number(t.shedAtBackgroundShare), mainOnlyAt: t.mainRunsOnlyAtBackgroundShare == null ? null : Number(t.mainRunsOnlyAtBackgroundShare) }); }
        if (!Array.isArray(j.tierRules) || !j.tierRules.length) throw new Error('tiers need tierRules');
        rules = j.tierRules.map((r) => { if (!r || !tiers.has(String(r.tier))) throw new Error('tierRules: unknown tier ' + (r && r.tier)); return { tier: String(r.tier), tags: Array.isArray(r.tags) ? r.tags.map(String) : null, modules: Array.isArray(r.modules) ? r.modules.map(String) : null, kinds: Array.isArray(r.kinds) ? r.kinds.map(String) : null, multiModel: r.multiModel == null ? null : !!r.multiModel, dflt: r.default === true }; });
        if (!rules.some((r) => r.dflt)) throw new Error('tierRules need one default rule');
        hours = Array.isArray(j.mainRunHoursUtc) ? j.mainRunHoursUtc.map(Number) : null;
        if (!hours || !hours.length || hours.some((h) => !(Number.isInteger(h) && h >= 0 && h <= 23))) throw new Error('mainRunHoursUtc must list UTC hours (0-23)');
        const T = j.testModeRules || {};
        tm = { on: j.testMode === true, backgroundTiers: Array.isArray(T.backgroundTiers) ? T.backgroundTiers.map(String) : [], mainRunsOnly: T.mainRunsOnly !== false, userCacheFirst: T.userCacheFirst !== false };
        for (const id of tm.backgroundTiers) if (!tiers.has(id)) throw new Error('testModeRules.backgroundTiers: unknown tier ' + id);
      }
      cfg = { cap, fromPlan, share, mode, plan, tiers, rules, hours, tm, userTags: new Set((Array.isArray(j.userTags) ? j.userTags : []).map(String)), decided: j.decided || null };
      mt = m; err = null;
    } catch (e) { cfg = null; mt = null; err = 'data/provider-budget.json: ' + String(e.message || e); }
    return cfg;
  }
  const override = () => { const v = String(env.NIGRAAN_CALL_BUDGET || '').trim(); if (!v) return null; if (/^(off|0|none)$/i.test(v)) return 'off'; const n = Number(v); return n > 0 ? n : null; };
  /* v91.17.283.31 · owner 29 Oct 2026: the provider bills overage, so going over the plan is allowed. Calls are counted and reported only:
     a file or environment asking for shed or enforce is read as monitor (the request is kept in status().requestedMode). The provider's
     own per-minute / per-hour rate limits stay (provider.mjs: its 429 answer). */
  const requestedMode = () => { const o = String(env.NIGRAAN_CALL_BUDGET_MODE || '').trim(); if (MODES.includes(o)) return o; const c = load(); return c ? c.mode : 'monitor'; };
  const modeOf = () => 'monitor';
  const daysInMonth = (ms) => { const d = new Date(ms); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); };
  function limits(nowMs = Date.now()) {
    const o = override(), c = load();
    if (o === 'off') return null;
    const cap = typeof o === 'number' ? o : c ? (c.fromPlan ? c.plan / daysInMonth(nowMs) : c.cap) : null;
    if (!cap) return null;
    return { cap, shedAt: (c ? c.share : 1) * cap, share: c ? c.share : 1, mode: modeOf(), tiers: !!(c && c.tiers), capBasis: typeof o === 'number' ? 'NIGRAAN_CALL_BUDGET' : c.fromPlan ? 'monthlyPlanWeighted / ' + daysInMonth(nowMs) + ' days in the UTC month' : 'dailyWeightedCap' };
  }
  /* ── v91.17.283 · WS1 · PATCH3 · the background tiers ──
     A background call's tier comes from the file's tierRules, first match: its x-agn-internal tag (or the tag the server gave the call), the
     module that asked (provider.mjs callerOf, from the stack), the API kind, and whether it is a multi-model request (2+ models, no best_match).
     Background allowance = shedBackgroundAtShare x the day's cap; a tier is shed once the day's BACKGROUND use passes its
     shedAtBackgroundShare x that allowance (null: never shed in shed mode); a person's request is never refused in shed mode. */
  const testMode = () => { const e = String(env.NIGRAAN_TEST_MODE || '').trim(); if (e === '1') return true; if (e === '0') return false; const c = load(); return !!(c && c.tm && c.tm.on); };
  const multiOf = (models) => { const ms = (Array.isArray(models) ? models : String(models || '').split(',')).map((x) => String(x).trim()).filter(Boolean); return ms.length >= 2 && !ms.includes('best_match'); };
  const tagHit = (list, tag) => list.some((p) => (p.endsWith('*') ? String(tag || '').startsWith(p.slice(0, -1)) : p === String(tag || '')));
  function tierOf(info = {}) {
    const c = load(); if (!c || !c.tiers) return null;
    if (info.tier && c.tiers.has(String(info.tier))) return c.tiers.get(String(info.tier));
    for (const r of c.rules) { if (r.dflt) continue;
      if (r.tags && !tagHit(r.tags, info.tag)) continue; if (r.modules && !r.modules.includes(String(info.module || ''))) continue;
      if (r.kinds && !r.kinds.includes(String(info.kind || ''))) continue; if (r.multiModel != null && r.multiModel !== multiOf(info.models)) continue;
      return c.tiers.get(r.tier); }
    return c.tiers.get(c.rules.find((r) => r.dflt).tier);
  }
  const bgUsed = (w = win()) => (w && w.budgetByClass && w.budgetByClass.background) || 0;
  /* refresh this tier only for a new run at the file's main hours (00/12 UTC)? test mode (its tiers), or a tier with
     mainRunsOnlyAtBackgroundShare once the background use passes it (shed and enforce modes; monitor only reports) */
  function mainRunsOnly(tierId) {
    const c = load(), L = limits(); if (!c || !c.tiers || !L) return false; const t = c.tiers.get(String(tierId)); if (!t) return false;
    if (testMode()) return c.tm.mainRunsOnly && c.tm.backgroundTiers.includes(t.id);
    return L.mode !== 'monitor' && t.mainOnlyAt != null && bgUsed() >= t.mainOnlyAt * L.shedAt;
  }
  const mainHours = () => { const c = load(); return c && c.hours ? c.hours : [0, 12]; };
  const userCacheFirst = () => { const c = load(); return testMode() && !!(c && c.tm && c.tm.userCacheFirst); };
  const classOfTag = (tag) => { const t = String(tag || ''); if (!t) return 'user'; const c = load(); return c && c.userTags.has(t) ? 'user' : 'background'; };
  const current = () => { const s = als.getStore(); return s && CLASSES.includes(s.cls) ? s.cls : 'background'; };
  const currentTag = () => { const s = als.getStore(); return s ? (s.tag || (s.cls === 'user' ? 'page' : 'background')) : '(backend job)'; };
  const runAs = (cls, fn, tag) => als.run({ cls: CLASSES.includes(cls) ? cls : 'background', tag: tag || (als.getStore() || {}).tag || null }, fn);
  const win = () => { try { return provider.windowFor(); } catch (_) { return null; } };
  const used = (w = win()) => (w ? Math.max(0, (w.backendWeighted || 0) + (w.browserWeighted || 0) - (w.failedWeighted || 0)) : 0);   /* v91.17.283.3 · cut 5: billed only */
  const bump = (w, k, cls) => { const r = w[k] || (w[k] = {}); r[cls] = (r[cls] || 0) + 1; try { if (store && store.saveSoon) store.saveSoon(); } catch (_) {} };
  /* may a call of this class and weight go out now? monitor: always (what shed/enforce would refuse is counted); shed: a person's call
     always, background up to the shed level (with tiers: its tier's level of the background allowance); enforce: as shed, and every call
     up to the cap. Test mode refuses the background tiers it does not list, in every mode. */
  function allow(cls, weight = 0, info = null) {
    const L = limits(); if (!L) return true;
    const w = win(), u = used(w), wt = Math.max(0, Number(weight) || 0);
    let refuse, tier = null, hard = false;
    if (cls === 'user') refuse = u + wt > L.cap;
    else if (L.tiers) {
      tier = tierOf(info || { tag: currentTag(), tier: (als.getStore() || {}).tier });
      const c = load();
      if (testMode() && !c.tm.backgroundTiers.includes(tier.id)) { refuse = true; hard = true; }
      else refuse = (tier.shedAt != null && bgUsed(w) + wt > tier.shedAt * L.shedAt) || (L.mode === 'enforce' && u + wt > L.cap);
    } else refuse = u + wt > L.shedAt;
    if (!refuse) return true;
    const tierBump = (k) => { if (!w || !tier) return; const T = w[k] || (w[k] = {}); T[tier.id] = (T[tier.id] || 0) + 1; };
    if (!hard && (L.mode === 'monitor' || (L.mode === 'shed' && cls === 'user'))) { if (w) { bump(w, 'budgetWouldRefuse', cls); tierBump('budgetWouldShedByTier'); } return true; }
    if (w) { bump(w, 'budgetRefused', cls); tierBump('budgetShedByTier'); }
    return false;
  }
  function note(cls, weight, tag = currentTag(), info = null) {
    const w = win(); if (!w) return; const x = Number(weight) || 0;
    { const t = cls === 'user' ? null : tierOf(info || { tag, tier: (als.getStore() || {}).tier }); const k = cls === 'user' ? 'user' : t ? t.id : null;
      if (k) { const B = w.budgetByTier || (w.budgetByTier = {}); const e = B[k] || (B[k] = { calls: 0, weighted: 0 }); e.calls++; e.weighted = Math.round((e.weighted + x) * 100) / 100; } }
    const b = w.budgetByClass || (w.budgetByClass = {}); b[cls] = Math.round(((b[cls] || 0) + x) * 100) / 100;
    const T = w.budgetByTag || (w.budgetByTag = {}); let k = String(tag || '?').slice(0, 60); if (!(k in T) && Object.keys(T).length >= TAG_MAX) k = '(other tags)';
    const e = T[k] || (T[k] = { cls, calls: 0, weighted: 0 }); e.calls++; e.weighted = Math.round((e.weighted + x) * 100) / 100;
  }
  const refusal = (cls) => (cls !== 'user' && testMode()) ? 'Test mode (NIGRAAN_TEST_MODE / data/provider-budget.json testMode): background refresh runs only the tiers testModeRules.backgroundTiers lists.'
    : cls === 'user'
    ? 'The daily provider call budget is spent (data/provider-budget.json, weighted calls, backend and browser traffic together).'
    : 'Background refresh paused: the day\'s provider calls have reached the share of the daily budget kept for people\'s requests (data/provider-budget.json).';
  /* the 30-day projection: the mean daily weighted use over the completed UTC days of the last 30 (from the first day the store holds;
     a day inside that span with no window had no calls through this server and counts 0), times 30. No completed day yet: today's
     pace (use so far / share of the day elapsed) times 30. */
  function projection(nowMs = Date.now()) {
    const c = load(), plan = c && c.plan ? c.plan : null;
    let W = []; try { W = (store && store.all ? store.all('quotaWindows') : []).filter((w) => w && (w.providerId == null || w.providerId === (provider.id || 'mach'))); } catch (_) { W = []; }
    const today = new Date(nowMs).toISOString().slice(0, 10), from = new Date(nowMs - 30 * 864e5).toISOString().slice(0, 10);
    const past = W.filter((w) => w.day >= from && w.day < today), byDay = new Map(past.map((w) => [w.day, (w.backendWeighted || 0) + (w.browserWeighted || 0)]));
    let basis, mean, days = 0;
    if (past.length) {
      const first = past.map((w) => w.day).sort()[0]; let sum = 0;
      for (let t = Date.parse(first + 'T00:00:00Z'); t < Date.parse(today + 'T00:00:00Z'); t += 864e5) { days++; sum += byDay.get(new Date(t).toISOString().slice(0, 10)) || 0; }
      mean = sum / days; basis = 'mean of the ' + days + ' completed UTC day(s) since ' + first + ' (a day with no window counts 0) x 30';
    } else {
      const frac = Math.max(1 / 24, ((nowMs % 864e5) / 864e5)); mean = used() / frac; days = 0; basis = 'no completed day in the store: today\'s pace x 30';
    }
    const projected = Math.round(mean * 30);
    return { basis, completedDays: days, meanDailyWeighted: Math.round(mean), projected30DayWeighted: projected, monthlyPlanWeighted: plan,
      projectedShareOfPlan: plan ? Math.round(1e4 * projected / plan) / 1e4 : null, exceedsPlan: plan ? projected > plan : null };
  }
  /* the ops alert: raised (store 'alerts', deduplicated per month by app.raiseAlert) when the projection exceeds the plan */
  let lastAlert = null;
  async function checkPlan(nowMs = Date.now()) { return projection(nowMs); }   /* v91.17.283.31 · overage is billed and allowed (owner, 29 Oct 2026): the projection is information only, no alert */
  /* v91.17.283.31 · month to date (UTC month, the plan's month) against the monthly plan, information only */
  function month(nowMs = Date.now()) {
    const c = load(), plan = c && c.plan ? c.plan : null, m = new Date(nowMs).toISOString().slice(0, 7);
    let W = []; try { W = (store && store.all ? store.all('quotaWindows') : []).filter((x) => x && (x.providerId == null || x.providerId === (provider.id || 'mach')) && String(x.day || '').startsWith(m)); } catch (_) { W = []; }
    const usedM = Math.round(W.reduce((a, x) => a + (x.backendWeighted || 0) + (x.browserWeighted || 0), 0));
    const dm = daysInMonth(nowMs), elapsed = (Date.parse(new Date(nowMs).toISOString().slice(0, 10) + 'T00:00:00Z') - Date.parse(m + '-01T00:00:00Z')) / 864e5 + Math.max(1 / 24, (nowMs % 864e5) / 864e5);
    const projected = Math.round(usedM / elapsed * dm);
    return { month: m, usedWeighted: usedM, monthlyPlanWeighted: plan, overByWeighted: plan ? Math.max(0, usedM - plan) : null, usedShareOfPlan: plan ? Math.round(1e4 * usedM / plan) / 1e4 : null,
      projectedMonthWeighted: projected, projectedOverByWeighted: plan ? Math.max(0, projected - plan) : null, basis: 'weighted calls counted on this computer in the UTC month so far; projection = pace so far x days in the month',
      overage: 'allowed: the provider bills calls above the plan (owner, 29 Oct 2026); information only, nothing is refused and no alert is raised' };
  }
  function status() {
    const L = limits(), w = win(), u = used(w), mode = L ? L.mode : null;
    const tags = Object.entries((w && w.budgetByTag) || {}).sort((a, b) => b[1].weighted - a[1].weighted).slice(0, 10).map(([tag, e]) => ({ tag, ...e }));
    return { configured: !!L, mode, source: override() != null ? 'NIGRAAN_CALL_BUDGET' : (cfg ? 'data/provider-budget.json' : null), why: L ? null : (override() === 'off' ? 'turned off (NIGRAAN_CALL_BUDGET=off)' : err),
      refuses: !L ? 'nothing' : mode === 'monitor' ? 'nothing (overage allowed: counted and reported only; the provider\'s own rate limits still apply)' : mode === 'shed' ? 'background calls above the shed level; never a person\'s request' : 'background above the shed level, every call at the cap',
      day: w ? w.day : null, dayBasis: 'UTC day, the provider quota window', usedWeighted: Math.round(u),
      dailyWeightedCap: L ? L.cap : null, shedBackgroundAtWeighted: L ? Math.round(L.shedAt) : null, shedBackgroundAtShare: L ? L.share : null,
      usedShare: L ? Math.round(1e4 * u / L.cap) / 1e4 : null,
      state: !L ? 'no cap' : u >= L.cap ? (mode === 'enforce' ? 'cap reached: every provider call refused' : 'over the day\'s share of the plan (overage allowed: not refused)') : u >= L.shedAt ? (mode === 'monitor' ? 'over the shed level (overage allowed: not refused)' : 'background shed: user-facing calls only') : 'normal',
      projection: projection(), planAlert: lastAlert, requestedMode: requestedMode(), monthToDate: month(),
      byClass: Object.assign({ user: 0, background: 0 }, (w && w.budgetByClass) || {}), topTagsToday: tags,
      refused: Object.assign({ user: 0, background: 0 }, (w && w.budgetRefused) || {}), wouldRefuse: Object.assign({ user: 0, background: 0 }, (w && w.budgetWouldRefuse) || {}),
      ...tierStatus(L, w) };
  }
  /* v91.17.283 · WS1 · PATCH3 · what /health and the ops page show: the daily allowance and where it comes from, test mode, and per tier today's
     use, what was shed, the level it is shed at and its state now */
  function tierStatus(L, w) {
    const c = load(); if (!L || !c || !c.tiers) return { tiers: null, testMode: testMode() };
    const B = (w && w.budgetByTier) || {}, S = (w && w.budgetShedByTier) || {}, WS = (w && w.budgetWouldShedByTier) || {}, bg = bgUsed(w), tm = testMode();
    const rows = [...c.tiers.values()].map((t) => ({ tier: t.id, what: t.what, todayCalls: (B[t.id] || {}).calls || 0, todayWeighted: Math.round((B[t.id] || {}).weighted || 0),
      shedAtWeighted: t.shedAt == null ? null : Math.round(t.shedAt * L.shedAt), mainRunsOnlyAtWeighted: t.mainOnlyAt == null ? null : Math.round(t.mainOnlyAt * L.shedAt),
      shedToday: S[t.id] || 0, wouldShedToday: WS[t.id] || 0,
      state: (tm && !c.tm.backgroundTiers.includes(t.id)) ? 'off (test mode)' : (L.mode !== 'monitor' && t.shedAt != null && bg >= t.shedAt * L.shedAt) ? 'shed (background over its level)' : mainRunsOnly(t.id) ? 'new 00/12 UTC runs only' : 'running' }));
    return { testMode: tm, testModeSource: String(env.NIGRAAN_TEST_MODE || '').trim() ? 'NIGRAAN_TEST_MODE' : 'data/provider-budget.json testMode',
      testModeRules: tm ? { backgroundTiers: c.tm.backgroundTiers, mainRunsOnly: c.tm.mainRunsOnly, userRequests: c.tm.userCacheFirst ? 'cache first (an answer already held is served, labelled with its own model run)' : 'as normal' } : null,
      dailyAllowance: { weighted: Math.round(L.cap), basis: L.capBasis, background: Math.round(L.shedAt), userReserve: Math.round(L.cap - L.shedAt), backgroundUsed: Math.round(bg), userUsed: Math.round(((w && w.budgetByClass) || {}).user || 0), users: 'never refused in shed mode, also past the reserve' },
      mainRunHoursUtc: mainHours(), tiers: rows, userToday: B.user || { calls: 0, weighted: 0 },
      shedToday: Object.values(S).reduce((a, b) => a + b, 0) };
  }
  /* ── v91.17.283.53 · C · N1 (c) · PACING: THE BACKGROUND YIELDS TO PEOPLE ───────────────────────────────────────────────────────────────
     Live 3 Nov: the day's use passed the plan's daily share at about 11:00 PKT (288,500 weighted by 21:25 PKT; the share is 166,667); mode
     monitor refuses nothing (overage allowed, owner 29 Oct), but the background (blend members, superset, zone and pool members, the area
     pass, the nearby lists: 70 % of the day) ran beside the people's calls with no order. Now a person's provider call (class user) never
     waits here; a background call (class background, or a low-priority request: the nearby lists) runs at most NIGRAAN_PROVIDER_BG_PAR
     (default 8) at once, at most NIGRAAN_PROVIDER_BG_WITH_USERS (default 2) while people's calls are running or ran in the last 2 s, and at
     most NIGRAAN_PROVIDER_BG_NEAR_CAP (default 1) once the day's use passes the shed level (shedBackgroundAtShare x the day's cap). Nothing
     is refused (the owner's overage decision stands): the background is paced, it yields. */
  const PZ = { bgMax: Math.max(1, Number(env.NIGRAAN_PROVIDER_BG_PAR) || 8), withUsers: Math.max(1, Number(env.NIGRAAN_PROVIDER_BG_WITH_USERS) || 2), nearCap: Math.max(1, Number(env.NIGRAAN_PROVIDER_BG_NEAR_CAP) || 1),
    nUser: 0, nBg: 0, userAt: 0, qb: [], st: { user: 0, background: 0, bgWaited: 0, bgWaitMsMax: 0, bgPacedNearCap: 0, bgPacedForUsers: 0, userPeak: 0 } };
  const bgLimit = () => { let near = false; try { const L = limits(); near = !!(L && used() >= L.shedAt); } catch (_) { near = false; }
    const users = PZ.nUser > 0 || Date.now() - PZ.userAt < 2000; return { lim: near ? PZ.nearCap : users ? Math.min(PZ.withUsers, PZ.bgMax) : PZ.bgMax, near, users }; };
  const canBg = () => { const b = bgLimit(); if (PZ.nBg < b.lim) return true; if (b.near) PZ.st.bgPacedNearCap++; else if (b.users) PZ.st.bgPacedForUsers++; return false; };
  function pump() { while (PZ.qb.length && canBg()) { const e = PZ.qb.shift(); PZ.nBg++; PZ.st.bgWaitMsMax = Math.max(PZ.st.bgWaitMsMax, Date.now() - e.at); e.ok(); } }
  let pzTimer = null; const pzTick = () => { if (pzTimer || !PZ.qb.length) return; pzTimer = setTimeout(() => { pzTimer = null; pump(); pzTick(); }, 500); if (pzTimer.unref) pzTimer.unref(); };
  async function paced(cls, fn) {
    if (cls === 'user') { PZ.nUser++; PZ.userAt = Date.now(); PZ.st.user++; PZ.st.userPeak = Math.max(PZ.st.userPeak, PZ.nUser);
      try { return await fn(); } finally { PZ.nUser--; PZ.userAt = Date.now(); pump(); } }
    if (!PZ.qb.length && canBg()) PZ.nBg++; else { PZ.st.bgWaited++; await new Promise((ok) => { PZ.qb.push({ ok, at: Date.now() }); pzTick(); }); }
    PZ.st.background++;
    try { return await fn(); } finally { PZ.nBg--; pump(); }
  }
  const pacing = () => { const b = bgLimit(); return { backgroundLimitNow: b.lim, nearCap: b.near, peopleActive: b.users, runningUser: PZ.nUser, runningBackground: PZ.nBg, waitingBackground: PZ.qb.length, ...PZ.st,
    rule: 'a person\'s provider call never waits; the background runs at most ' + PZ.bgMax + ' at once, ' + PZ.withUsers + ' while people are being served, ' + PZ.nearCap + ' past the shed level; nothing is refused' }; };
  const status0 = status;
  return { allow, note, current, currentTag, runAs, classOfTag, status: () => ({ ...status0(), pacing: pacing() }), refusal, limits, projection, month, checkPlan, mode: modeOf, requestedMode, tierOf, mainRunsOnly, mainHours, testMode, userCacheFirst, paced, pacing };
}

/* the gate around the provider's own call() and noteProxyCall(), the two places where calls are made and counted (provider.mjs is not
   changed). The call() wrapper is compiled with the Function constructor ON PURPOSE: its stack frame then carries no file name, so the
   per-caller record (provider.mjs callerOf: the first frame outside provider.mjs) still names the module that asked for the call
   (national.mjs, outlook.mjs, ...) and not this wrapper. */
/* v91.17.283 · WS1 · PATCH3 · the module that asked (for its tier): the first frame outside the provider, the budget and the run cache
   (V8 keeps the awaiting callers in the stack, as provider.mjs callerOf relies on) */
const SKIP = new Set(['provider.mjs', 'callbudget.mjs', 'modelruns.mjs']);
export function callerModule(stack) { for (const ln of String(stack).split('\n').slice(1)) { const m = /([\w.-]+\.m?js):\d+:\d+\)?\s*$/.exec(ln); if (m && !SKIP.has(m[1])) return m[1]; } return null; }

/* v91.17.283.3 · budget cut 5 · ONLY BILLED CALLS COUNT TOWARD SHED. A call the provider did not answer (a 4xx or 5xx reply, a transport
   failure or a timeout) is not billed, but it was counted in the class / tier / tag use that decides shedding, so a failing caller pushed
   background work into shed. The class use (note) is now made after the call, for an answered call only; the day's counters keep every
   attempt (the provider window, as before) and the failed attempts' weight is kept apart (failedWeighted) and left out of the use the
   budget compares with its levels. */
export function gateProvider(provider, budget, weightOf, refuse) {
  const call0 = provider.call, note0 = provider.noteProxyCall;
  const pre = (kind, params, opts) => {
    const cls = budget.current(), w = weightOf((k) => (params || {})[k], (opts && opts.locations) || 1, { ensemble: kind === 'ensemble' });
    /* v91.17.283.26 · a call made outside any request is tagged with the module that made it ("(backend job) outlook.mjs"), so the day's
       per-tag record names the job (live 27 Oct: 56,237 weighted calls under the bare "(backend job)"); its tier is decided as before */
    const st = als.getStore(), module = callerModule(new Error().stack), tag = st ? budget.currentTag() : '(backend job) ' + (module || '?');
    const info = { tag, tier: (st && st.tier) || null, module, kind, models: (params || {}).models };
    if (!budget.allow(cls, w, info)) throw refuse(cls);
    let w0 = null; try { const W = provider.windowFor(); w0 = W ? (W.backendWeighted || 0) : null; } catch (_) { w0 = null; }
    return { cls, w, info, tag, w0 };
  };
  const done = (c, ok) => { if (!c) return;
    if (ok) { if (provider.configured()) budget.note(c.cls, c.w, c.tag, c.info); return; }
    try { const W = provider.windowFor(); if (W && c.w0 != null) { const d = (W.backendWeighted || 0) - c.w0; if (d > 0) W.failedWeighted = Math.round((W.failedWeighted || 0) + Math.min(d, Math.round(c.w))); } } catch (_) {} };
  /* v91.17.283.53 · C · the call itself waits for a pacing slot of its class (budget.paced: a person's call first, the background yields) */
  const call1 = budget.paced ? function (kind, path, params, opts) { const self = this; return budget.paced(budget.current(), () => call0.call(self, kind, path, params, opts)); } : call0;
  provider.call = new Function('pre', 'done', 'call0', 'self', 'return async function gatedCall(kind, path, params, opts = {}) { const c = pre(kind, params, opts); let r; try { r = await call0.call(self, kind, path, params, opts); } catch (e) { done(c, false); throw e; } done(c, true); return r; }')(pre, done, call1, provider);
  provider.noteProxyCall = function (weighted = 1, ok = true) { if (ok) budget.note(budget.current(), weighted);
    else { try { const W = provider.windowFor(); if (W) W.failedWeighted = Math.round((W.failedWeighted || 0) + (Number(weighted) || 0)); } catch (_) {} }
    return note0.call(this, weighted, ok); };
  return provider;
}
