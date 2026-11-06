// v91.17.283.48 · "What to do here" (GUIDANCE_PANEL=1) · the library, the validator and the matching, mapped to the spec's acceptance
// criteria (data/guidance/_inputs/what-to-do-here-spec.md) and the owner decisions of 2 Nov 2026. No server: the matching is a pure
// function (server/api/guidance.mjs selectGuidance) fed with fixture levels, applicability states and location facts.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const G = await import(pathToFileURL(join(ROOT, 'server', 'api', 'guidance.mjs')).href);
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 700) : '')); } };
const L = G.loadLibrary(join(ROOT, 'data'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = Date.parse('2026-11-02T03:00:00Z');
const lv = (word, extra = {}) => ({ word, i: G.LEVEL_WORDS.indexOf(word), peakDate: '2026-11-03', days: [], ...extra });
const app = (state, text = '', why = null) => ({ state, text, why });
const base = (o = {}) => ({ province: 'punjab', district: 'Lahore', audience: 'public', view: 'customer', now: NOW,
  hazards: { flood: { level: lv('Normal'), applicability: app('value', 'can happen here') }, heat: { level: lv('Normal'), applicability: app('value', 'can happen anywhere') },
    landslide: { level: lv('Normal'), applicability: app('value', 'can happen here') }, glof: { level: { word: null, state: 'missing', why: 'no outburst level' }, applicability: app('not_applicable', 'cannot happen here', 'no mapped glacial lake lies in this tehsil or anywhere upstream in its drainage') } },
  facts: { lowLandNearRiver: { met: false, why: 'high' }, inRiverFloodExtent: { met: false, why: 'outside' }, within1500ftOfWater: { met: false, why: 'far' } }, ...o });
const H = (out, hz) => out.hazards.find((h) => h.hazard === hz);
const allDo = (h) => h.tabs.do.phases.flatMap((p) => p.items.concat(p.more));

/* ── the library on disk ── */
ok(!L.error && L.valid.ok, 'the library in data/guidance loads and passes its validator', L.error || (L.valid.errors || []).join('; '));
const b = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen', 'build_guidance_library.mjs'), '--check'], { encoding: 'utf8' });
ok(b.status === 0, 'the library on disk is exactly a fresh build from data/guidance/_inputs (scripts/gen/build_guidance_library.mjs --check)', b.stdout + b.stderr);
ok(/^\d+\.\d+\.\d+$/.test(L.manifest.version) && L.manifest.review.reviewer === '' && L.actions.every((a) => a.reviewer === '' && 'reviewedOn' in a && a.nextReviewBy),
  'library version set; the named legal reviewer field is EMPTY everywhere (owner); every item carries reviewer / review date / next review fields');

/* ── AC1: the validator ── */
{ const x = clone(L); const it = x.actions.find((a) => a.kind === 'official'); it.sourceId = 'bldg';   /* bldg: to-verify */
  const V = G.validateLibrary(x); ok(!V.ok && V.errors.some((e) => e.includes(it.id) && /official item without a checked source/.test(e)), 'AC1 the validator rejects an official item whose source is not checked', V.errors.join('; ')); }
{ const x = clone(L); delete x.regulatory[0].text_en; const V = G.validateLibrary(x); ok(!V.ok && V.errors.some((e) => /text_en missing/.test(e)), 'AC1 the validator rejects an item without text_en'); }
{ const x = clone(L); x.actions[0].sourceId = null; x.actions[0].status = 'machine-verified-official-text'; x.actions[0].kind = 'good-practice'; const V = G.validateLibrary(x); ok(!V.ok, 'the validator rejects a customer-status item with no source'); }
{ const x = clone(L); x.contacts.find((c) => c.customer).phone = []; ok(!G.validateLibrary(x).ok, 'the validator rejects a customer-visible contact without a number'); }

/* ── owner decisions on the content ── */
const custDo = L.actions.filter((a) => !G.customerBlock(L, a, NOW));
ok(custDo.length === 130 && L.actions.length === 142 && custDo.every((a) => a.kind === 'official' && a.sourceRef && a.sourceRef.url), '130 "Do now" actions matched to official guidance may be shown to customers (each with its official document link)', custDo.length);
const UNSUP = ['landslide-household-before-1', 'landslide-farmer-before-1', 'landslide-farmer-before-2', 'landslide-business-before-1', 'landslide-business-during-2', 'landslide-facility-before-1', 'landslide-facility-during-1', 'glof-farmer-before-1', 'glof-business-during-2', 'smog-farmer-before-2', 'smog-engineer-before-1', 'smog-engineer-during-1'];
ok(UNSUP.every((id) => { const a = L.actions.find((x) => x.id === id); return a && G.customerBlock(L, a, NOW) && a.status === 'to-verify'; }), 'the 12 actions without official backing are operator view only');
const custRules = [...L.regulatory, ...L.duties].filter((a) => !G.customerBlock(L, a, NOW)).map((a) => a.id).sort();
ok(JSON.stringify(custRules) === JSON.stringify(['pbfp-right', 'pbidr-rule']), 'laws / rules / rights lines: customer view only for checked-text (only Punjab flood plain appeal and Punjab river permit)', custRules.join(','));
const custC = L.contacts.filter((c) => c.customer).map((c) => c.province + ':' + c.phone.join('/')).sort();
const WANT = ['national:111-157-157', 'punjab:1129', 'punjab:1122', 'sindh:1736', 'sindh:1122', 'kp:1700', 'kp:1122', 'balochistan:081-9241133', 'ajk:05822-921537'];
ok(WANT.every((w) => custC.includes(w)) && !L.contacts.some((c) => c.customer && (c.province === 'ict' || c.role === 'irrigation')) && L.contacts.some((c) => c.province === 'gb' && c.district && c.customer),
  'contacts: only the officially published numbers are customer-visible (NDMA, PDMA Punjab/Sindh/KP, Balochistan control room, Rescue 1122 Punjab/Sindh/KP, GB per district, AJK SDMA); ICT and irrigation flood cells hidden', custC.join(' '));
ok(L.contacts.some((c) => c.district === 'Ghizer' && !c.customer && /misprinted/.test(c.operatorOnlyWhy || '')) && !L.contacts.some((c) => c.province === 'balochistan' && c.role === 'rescue' && c.customer), 'the Ghizer number of the GBDMA plan is operator only; Balochistan Rescue 1122 (no official coverage) operator only');

/* ── AC2: a fixture per province shows its authority and contacts ── */
const AUTH = { punjab: 'PDMA Punjab', sindh: 'PDMA Sindh', kp: 'PDMA Khyber Pakhtunkhwa', balochistan: 'PDMA Balochistan', ajk: 'SDMA Azad Kashmir' };
for (const [p, a] of Object.entries(AUTH)) { const o = G.selectGuidance(L, base({ province: p, district: 'X' })); const n = o.contacts.items.map((c) => c.name);
  ok(n[0] === 'NDMA helpline' && n.includes(a) && o.contacts.items.every((c) => c.phone.length), 'AC2 ' + p + ': NDMA first, then ' + a + ' (customer view, numbers only)', n.join(', ')); }
{ const o = G.selectGuidance(L, base({ province: 'gb', district: 'Gilgit' })); const n = o.contacts.items.map((c) => c.name).join(' | ');
  ok(/Rescue 1122 · Gilgit/.test(n) && /District police control room · Gilgit/.test(n) && !/Skardu/.test(n), 'AC2 gb (Gilgit district): the district’s own Rescue 1122 and police control room numbers', n);
  const z = G.selectGuidance(L, base({ province: 'gb', district: 'Ghizer' })); ok(!z.contacts.items.some((c) => /Ghizer/.test(c.name)) && G.selectGuidance(L, base({ province: 'gb', district: 'Ghizer', view: 'operator' })).contacts.items.some((c) => /Ghizer/.test(c.name) && c.customerHiddenWhy), 'AC2 gb (Ghizer): the misprinted number is not shown to customers, flagged for the operator'); }
{ const o = G.selectGuidance(L, base({ province: 'ict', district: 'Islamabad' })); ok(o.contacts.items.length === 1 && o.contacts.items[0].name === 'NDMA helpline' && G.selectGuidance(L, base({ province: 'ict', district: 'Islamabad', view: 'operator' })).contacts.hiddenFromCustomers === 4, 'AC2 ict: only the NDMA helpline (ICT numbers not found are hidden)'); }

/* ── AC3: Monitor, Watch, Act show the right phases; Normal / Low standing preparedness ── */
const ph = (w) => { const o = G.selectGuidance(L, base({ hazards: { ...base().hazards, flood: { level: lv(w), applicability: app('value') } } })); const h = H(o, 'flood'); return { h, t: h.tabs.do.phases.map((p) => p.phase + ':' + p.title).join(' / ') }; };
{ const m = ph('Moderate'), w = ph('High'), a = ph('Severe'), n = ph('Normal'), l = ph('Low');
  ok(m.h.guidanceLevel === 'monitor' && m.t === 'before:Prepare', 'AC3 Moderate -> Monitor: before actions', m.t);
  ok(w.h.guidanceLevel === 'watch' && w.t === 'before:Get ready now / during:If it gets worse', 'AC3 High -> Watch: before, then "if it gets worse"', w.t);
  ok(a.h.guidanceLevel === 'act' && a.t === 'during:Do this now / before:Then', 'AC3 Severe -> Act: during actions first, then before', a.t);
  ok(n.h.status === 'standing' && l.h.status === 'standing' && n.t === 'before:Standing preparedness', 'Normal / Low -> standing preparedness', n.t);
  ok(allDo(a.h).every((i) => /^flood-household-/.test(i.id)) && a.h.tabs.do.phases[0].items.every((i) => i.timeCritical), 'Act: the household flood items, the "during" ones time-critical');
  ok(a.h.tabs.do.phases.every((p) => p.items.length <= 6), 'at most 6 items per phase (the rest in "more")'); }

/* ── no level / withheld / cannot happen ── */
{ const o = G.selectGuidance(L, base({ hazards: { ...base().hazards, flood: { level: { word: null, state: 'not_tested', why: 'level not tested here: a river runs through this tehsil but has no gauge' }, applicability: app('not_tested', 'level not tested here') } } }));
  const h = H(o, 'flood'); ok(h.status === 'no_level' && /no level here/.test(h.line) && !/clear/i.test(h.line.replace('not an all-clear', '')) && !h.tabs && o.contacts.items.length > 0, 'not tested -> contacts and "no level here", never "clear"', h.line); }
{ const o = G.selectGuidance(L, base({ hazards: { ...base().hazards, heat: { level: { word: null, withheld: true, why: 'withheld from client screens' }, applicability: app('value') } } }));
  ok(H(o, 'heat').status === 'no_level' && !o.provenance.itemIds.some((i) => /^heat-/.test(i)), 'a withheld level never triggers guidance'); }
{ const o = G.selectGuidance(L, base({ hazards: { ...base().hazards, landslide: { level: lv('High'), applicability: app('not_applicable', 'cannot happen here', 'no steep ground in this tehsil or near it') } } }));
  const h = H(o, 'landslide'); ok(h.status === 'not_relevant' && /not relevant here/.test(h.line) && !h.tabs && !o.provenance.itemIds.some((i) => /^landslide-/.test(i)), 'CANNOT HAPPEN HERE (applicability endpoint, e.g. landslide in the plains) -> one line "not relevant here", no guidance', h.line); }

/* ── AC6: no glacial lake upstream -> GLOF not relevant; GLOF exposure -> before only ── */
{ const o = G.selectGuidance(L, base()); const h = H(o, 'glof'); ok(h.status === 'not_relevant' && /no mapped glacial lake/.test(h.line), 'AC6 a tehsil with no glacial lake upstream: GLOF "not relevant here" with the reason', h.line); }
{ const o = G.selectGuidance(L, base({ province: 'gb', hazards: { ...base().hazards, glof: { level: { word: null, state: 'missing', why: 'no outburst level is issued' }, applicability: app('value', 'can happen here: 110 mapped glacial lake(s) in the tehsil') } } }));
  const h = H(o, 'glof'); ok(h.status === 'exposure' && h.tabs.do.phases.length === 1 && h.tabs.do.phases[0].phase === 'before' && allDo(h).length > 0 && allDo(h).every((i) => /-before-/.test(i.id)), 'GLOF exposure -> "before" actions only', JSON.stringify(h.tabs && h.tabs.do.phases.map((p) => p.phase))); }

/* ── AC4 / AC5: location rules (conditional wording; no gazette data) ── */
{ const fl = (facts, view) => H(G.selectGuidance(L, base({ view, facts: { ...base().facts, ...facts }, hazards: { ...base().hazards, flood: { level: lv('Moderate'), applicability: app('value') } } })), 'flood').tabs.rules.items.map((i) => i.id);
  const low = fl({ lowLandNearRiver: { met: true, why: 'low' }, inRiverFloodExtent: { met: true, why: 'in' } }, 'operator'), high = fl({}, 'operator');
  ok(low.includes('pbfp-rule') && !high.includes('pbfp-rule'), 'AC4 a low riverside Punjab point shows the flood plain rule; a high point does not', low.join(',') + ' | ' + high.join(','));
  const t = L.regulatory.find((r) => r.id === 'pbfp-rule').text_en; ok(/may be a notified flood plain/.test(t), 'the flood plain rule stays conditional ("may be a notified flood plain")');
  const cl = fl({ lowLandNearRiver: { met: true, why: 'low' }, inRiverFloodExtent: { met: true, why: 'in' } }, 'customer'), ch = fl({}, 'customer');
  ok(cl.includes('pbidr-rule') && !cl.includes('pbfp-rule') && !ch.includes('pbidr-rule'), 'customer view: the checked river-permit rule shows in the mapped river flood extent only; the flood plain rule (not checked-text) stays operator only', cl.join(',')); }
{ const kp = (f, view = 'operator') => H(G.selectGuidance(L, base({ province: 'kp', view, facts: { ...base().facts, within1500ftOfWater: f }, hazards: { ...base().hazards, flood: { level: lv('Moderate'), applicability: app('value') } } })), 'flood').tabs.rules.items;
  const near = kp({ met: true, why: '230 m' }), far = kp({ met: false, why: '5 km' }), unk = kp({ met: null, why: 'no grid' }), unkC = kp({ met: null, why: 'no grid' }, 'customer');
  const r = near.find((i) => i.id === 'kprp-rule');
  ok(r && /If this river is notified/.test(r.text) && /200 feet/.test(r.text) && !far.some((i) => i.id === 'kprp-rule'), 'AC5 a KP point near a river shows the 200 ft rule, worded "if this river is notified"; a far point does not');
  ok(unk.some((i) => i.id === 'kprp-rule' && i.flagged) && !unkC.some((i) => i.id === 'kprp-rule'), 'a location fact that cannot be checked: operator sees the rule flagged, the customer does not see it'); }
{ const F = G.evalFacts({ heightAboveRiver: { value: 2.1 }, floodMap: { value: 'beside the mapped flood extent' }, nearestWater: { value: 0.3 } }, { handLowBreakM: 7.6, riverState: 'value' });
  const F2 = G.evalFacts({ heightAboveRiver: { value: 12 }, floodMap: { value: 'outside the mapped flood extent' }, nearestWater: { value: 0.6 } }, { handLowBreakM: 7.6, riverState: 'value' });
  const F3 = G.evalFacts({ nearestWater: { value: 0.3 } }, { handLowBreakM: 7.6, riverState: 'not_applicable' });
  ok(F.lowLandNearRiver.met === true && F.inRiverFloodExtent.met === false && F.within1500ftOfWater.met === true && F2.lowLandNearRiver.met === false && F2.within1500ftOfWater.met === false && F3.within1500ftOfWater.met === false && F3.lowLandNearRiver.met === null,
  'location facts: lowest tested HAND class + mapped flood extent; 1,500 ft (457 m) of water in a tehsil with a river; a missing grid is "could not check", never false');
  const H0 = JSON.parse(readFileSync(join(ROOT, 'data', 'hand-calibration.json'), 'utf8')).bands.t_hand.classes[0].toM; ok(H0 === 7.6, 'the low-land break is read from the tested HAND classes (data/hand-calibration.json), not typed', H0); }

/* ── AC7: changing audience changes items; the choice persists (the panel keeps it in this browser) ── */
{ const m = (a) => allDo(H(G.selectGuidance(L, base({ audience: a, hazards: { ...base().hazards, heat: { level: lv('High'), applicability: app('value') } } })), 'heat')).map((i) => i.id);
  const p = m('public'), bz = m('business'), of = m('official');
  ok(p.length && bz.length && of.length && p.every((i) => /-household-/.test(i)) && bz.every((i) => /-business-/.test(i)) && of.every((i) => /-official-/.test(i)), 'AC7 changing the audience changes the items (public / business / official)');
  const o = G.selectGuidance(L, base({ audience: 'engineer' })); ok(o.audience === 'public' && o.audiences.map((x) => x.id).join() === 'public,business,official', 'only the 3 v1 audiences (others hidden; an unknown one falls back to public)');
  const UI = readFileSync(join(ROOT, 'server', 'api', 'guidance_ui.js'), 'utf8'); ok(/localStorage\.setItem\(k,v\)/.test(UI) && /put\(KEY,S\.aud\)/.test(UI) && /get\(KEY,'public'\)/.test(UI), 'AC7 the panel remembers the audience choice (this browser) and reads it back'); }

/* ── AC8: no match -> the no-guidance message and the contacts; the AI does not generate advice ── */
{ const x = clone(L); x.actions = x.actions.filter((a) => a.hazards[0] !== 'flood'); x.srcById = L.srcById;
  const o = G.selectGuidance(x, base({ hazards: { ...base().hazards, flood: { level: lv('High'), applicability: app('value') } } }));
  ok(H(o, 'flood').tabs.do.message === G.NO_MATCH && o.contacts.items.length > 0, 'AC8 nothing matched: "No specific guidance in the library for this case" plus the contacts');
  const A = G.guidanceAnswer(G.selectGuidance(x, base({ hazards: { flood: { level: lv('High'), applicability: app('value') }, heat: { level: { word: null, why: 'x' } }, landslide: { level: { word: null, why: 'x' } }, glof: base().hazards.glof } })));
  ok(A.answer.startsWith(G.NO_MATCH) && A.items.length === 0 && /Contacts: /.test(A.answer), 'AC8 the AI answer with no match says so and gives the contacts (no generated advice)', A.answer.slice(0, 200)); }
{ const o = G.selectGuidance(L, base({ hazards: { ...base().hazards, flood: { level: lv('Severe'), applicability: app('value') } } })); const A = G.guidanceAnswer(o);
  const texts = new Set([...L.actions].map((a) => a.text_en)); const lines = A.answer.split('\n').filter((l) => l.startsWith('- '));
  ok(lines.length > 0 && lines.every((l) => { const m = /^- (.*) \[([a-z0-9-]+); source: .*\]$/.exec(l); return m && texts.has(m[1]) && A.items.includes(m[2]) && o.provenance.itemIds.includes(m[2]); }), 'the AI "what should I do" lines are library text with their item id, all from the endpoint’s selection', lines.slice(0, 2).join(' | '));
  ok(G.WHAT_TO_DO_Q.test('What should I do in Lahore?') && G.WHAT_TO_DO_Q.test('what to do now') && !G.WHAT_TO_DO_Q.test('What should I prepare for in Lahore in the next 3 days?'), 'the "what should I do" question is recognised; the existing Prepare chip is left to the forecast answer'); }

/* ── AC9: official warnings: no feed in v1 -> no banner (owner) ── */
{ const o = G.selectGuidance(L, base()); ok(o.officialWarning === null && !('officialWarningNote' in o) && /No official warning feed/.test(G.selectGuidance(L, base({ view: 'operator' })).officialWarningNote), 'AC9 (owner decision): no official warning feed in v1, so no banner (the operator answer says why)'); }

/* ── AC10: the site report section and its provenance ── */
{ const o = G.selectGuidance(L, base({ hazards: { ...base().hazards, flood: { level: lv('High'), applicability: app('value') } } })); o.place = { tehsil: 'Lahore City', district: 'Lahore', province: 'Punjab' };
  const html = G.guidanceHtml([o]); const bound = G.bindGuidance('<html><body><section class="agn-decision" data-agn-decision="server">x</section><p>rest</p></body></html>', [o]);
  ok(/<h2>What to do<\/h2>/.test(html) && o.provenance.itemIds.filter((i) => /^flood-/.test(i)).every((i) => html.includes(i)) && html.includes('library ' + L.manifest.version), 'AC10 the report "What to do" section lists each item with its id and source, and the library version');
  ok(bound.indexOf('data-agn-guidance') > bound.indexOf('data-agn-decision') && bound.indexOf('data-agn-guidance') < bound.indexOf('<p>rest'), 'the section is placed right after the server’s decision values');
  ok(o.provenance.libraryVersion === L.manifest.version && Array.isArray(o.provenance.itemIds) && o.provenance.itemIds.length > 0 && o.provenance.levels.flood.word === 'High', 'AC10 provenance carries the library version, every item id and the levels used'); }

/* ── AC11: non-checked-text hidden from customers and flagged for the operator ── */
{ const c = G.selectGuidance(L, base({ hazards: { ...base().hazards, flood: { level: lv('Severe'), applicability: app('value') } } })), o = G.selectGuidance(L, base({ view: 'operator', hazards: { ...base().hazards, flood: { level: lv('Severe'), applicability: app('value') } } }));
  const cr = H(c, 'flood').tabs.rules.items.map((i) => i.id), orr = H(o, 'flood').tabs.rules.items;
  ok(!cr.includes('ndm-rule') && orr.some((i) => i.id === 'ndm-rule' && i.flagged && i.customerHiddenWhy), 'AC11 a rule line not checked-text: hidden in the customer view, flagged with the reason in the operator view');
  ok(H(c, 'flood').tabs.rights.items.some((i) => i.id === 'pbfp-right') && !H(c, 'flood').tabs.rights.duties.length && H(o, 'flood').tabs.rights.duties.every((i) => i.flagged), 'rights: the checked appeal right shows to customers; the audience duties (not checked line by line) are operator only, flagged');
  const ld = G.selectGuidance(L, base({ audience: 'business', view: 'operator', hazards: { ...base().hazards, landslide: { level: lv('Severe'), applicability: app('value') } } }));
  ok(allDo(H(ld, 'landslide')).some((i) => i.id === 'landslide-business-during-2' && i.flagged && i.source.id === null), 'an unsupported action shows for the operator flagged, with "no official source"'); }

/* ── governance: 12 months unreviewed -> hidden from clients; Urdu: English with a note ── */
{ const o = G.selectGuidance(L, base({ now: Date.parse('2027-12-01T00:00:00Z'), hazards: { ...base().hazards, flood: { level: lv('High'), applicability: app('value') } } }));
  ok(allDo(H(o, 'flood')).length === 0 && H(o, 'flood').tabs.do.message === G.NO_MATCH, 'items older than 12 months unreviewed are hidden from clients'); }
{ const o = G.selectGuidance(L, base({ lang: 'ur', hazards: { ...base().hazards, flood: { level: lv('High'), applicability: app('value') } } }));
  ok(/not reviewed/.test(o.langNote) && allDo(H(o, 'flood')).every((i) => i.lang === 'en' && /Urdu text not reviewed/.test(i.langNote)), 'Urdu asked: English text with a note (no machine translation)'); }
/* ── every item carries a source link (or says it has none) ── */
{ const o = G.selectGuidance(L, base({ view: 'operator', hazards: { flood: { level: lv('Severe'), applicability: app('value') }, heat: { level: lv('Severe'), applicability: app('value') }, landslide: { level: lv('Severe'), applicability: app('value') }, glof: { level: lv('High'), applicability: app('value') } } }));
  const its = o.hazards.filter((h) => h.tabs).flatMap((h) => [...allDo(h), ...h.tabs.rules.items, ...h.tabs.rights.items, ...h.tabs.rights.duties]);
  ok(its.length > 50 && its.every((i) => (i.source && i.source.url) || i.flagged) && its.filter((i) => !(i.source && i.source.url)).every((i) => G.customerBlock(L, [...L.actions, ...L.regulatory, ...L.duties].find((x) => x.id === i.id), NOW)), 'every item has a source link; an item without one is flagged and never shown to customers', its.filter((i) => !(i.source && i.source.url)).map((i) => i.id).slice(0, 5).join(',')); }
/* ── the flag ── */
ok(G.GUIDANCE_ON() === (process.env.GUIDANCE_PANEL === '1'), 'GUIDANCE_ON() follows GUIDANCE_PANEL=1 only');
console.log(`\nGUIDANCE-LIB ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
