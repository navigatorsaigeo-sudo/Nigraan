#!/usr/bin/env node
/* v91.17.283.48 · "WHAT TO DO HERE" GUIDANCE LIBRARY BUILDER (release 1.0.8/1.0.9, behind GUIDANCE_PANEL=1)
   Builds data/guidance/*.json from the owner's handover pack and the 31 Oct 2026 verification, with the owner decisions of 2 Nov 2026:

     inputs   data/guidance/_inputs/starter/*.json            the handover pack's starter content (NIGRAAN_WhatToDoHere_Handover)
              data/guidance/_inputs/verified_20261031/*.json  the online check of 31 Oct 2026 (corrected texts, statuses, contacts)
     outputs  data/guidance/manifest.json  sources.json  action_items.json  regulatory_items.json  duties_rights.json  contacts.json
              (validated by server/api/guidance.mjs validateLibrary before they are written; a failing library is never written)

   Rules (spec docs/what-to-do-here-spec.md + owner decisions, nothing invented):
     - every text is the verified (corrected) official wording where the check proposed one (proposedText_en), else the starter text;
     - status = the check's statusProposal; kind / sourceId / jurisdictions = the check's proposals where it made one;
     - "Do now" actions: the 130 matched to official NDMA/PDMA guidance (97 confirmed + 33 reworded) may be shown to customers
       (status machine-verified-official-text, view policy below); the 12 without official backing stay to-verify, operator view only;
     - laws / rules / rights lines: customer view only for status checked-text (today: pbfp-right, pbidr-rule);
     - audience duties and rights lines: not checked line by line -> to-verify (operator view only), with the wording fixes the check listed;
     - contacts: only officially published numbers are customer-visible (owner list); ICT and the irrigation flood cells were not found ->
       hidden from customers; the Ghizer control-room number in the GBDMA plan looks misprinted -> operator only;
     - the named legal reviewer stays EMPTY (customers use their own reviewer); nothing blocks on it.
   Usage: node scripts/gen/build_guidance_library.mjs [--check]   (--check: build in memory, validate, compare with the files on disk) */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLibrary, LIBRARY_FILES } from '../../server/api/guidance.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const G = join(ROOT, 'data', 'guidance'), IN = join(G, '_inputs');
const rd = (p) => JSON.parse(readFileSync(join(IN, p), 'utf8'));
const VERSION = '1.0.0';
const BUILT = '2026-11-02';
const VERIFIED_ON = '2026-10-31';
const VERIFIED_BY = 'online check of the official text (31 Oct 2026); not a named legal review';
/* the next review (spec governance): flood and GLOF before each monsoon (by 1 June), heat before the heat season (by 1 April);
   landslide follows the monsoon; smog (phase 2) before the winter smog season, read here as by 1 October */
const NEXT_REVIEW = { flood: '2027-06-01', glof: '2027-06-01', landslide: '2027-06-01', heat: '2027-04-01', smog: '2027-10-01' };
const nextReviewOf = (hz) => (Array.isArray(hz) ? hz : [hz]).map((h) => NEXT_REVIEW[h]).filter(Boolean).sort()[0] || '2027-04-01';
const review = (hz) => ({ reviewer: '', reviewedOn: null, verifiedOn: VERIFIED_ON, verifiedBy: VERIFIED_BY, nextReviewBy: nextReviewOf(hz) });

const S0 = rd('verified_20261031/sources_verified.json');
const A0 = rd('verified_20261031/action_items_verified.json');
const R0 = rd('verified_20261031/regulatory_items_verified.json');
const C0 = rd('verified_20261031/contacts_verified.json');
const D0 = rd('starter/audience_duties_rights.json');

/* ── sources: one record per law, rule or plan ── */
const sources = S0.map((s) => ({
  id: s.id, title: s.title, short: s.short, type: s.type, jurisdiction: s.jurisdiction, hazards: s.hazards,
  status: s.statusProposal || s.status, summary: s.summary, keyProvisions: s.keyProvisions || [], nigraanUse: s.nigraanUse || null,
  source: { name: (s.source && s.source.name) || s.short, url: s.verifiedUrl || (s.source && s.source.url) || null, secondaryUrl: s.verifiedUrl && s.source && s.source.url && s.source.url !== s.verifiedUrl ? s.source.url : null },
  verifiedSection: s.verifiedSection || null, verdict: s.verdict || null, correction: s.correction || null, ...review(s.hazards) }));
const srcById = Object.fromEntries(sources.map((s) => [s.id, s]));

/* ── "Do now" actions ── */
const prio = (id) => { const m = /-(\d+)$/.exec(id); return m ? Number(m[1]) : 9; };
const actions = A0.map((a) => {
  const og = Array.isArray(a.officialGuidance) ? a.officialGuidance.filter((x) => x && x.url) : [];
  const supported = a.statusProposal === 'machine-verified-official-text';
  return { id: a.id, kind: a.kindProposal || a.kind, tab: 'do', hazards: [a.hazard], audiences: [a.audience], phase: a.phase, levels: a.levels,
    jurisdictions: ['national'], ...(a.jurisdictionNote ? { jurisdictionNote: a.jurisdictionNote } : {}),
    text_en: a.proposedText_en || a.text_en, text_ur: a.text_ur || null,
    sourceId: supported ? (a.sourceIdProposal || a.sourceId) : null,
    sourceRef: og.length ? { doc: og[0].doc, url: og[0].url, section: a.verifiedSection || null, more: og.slice(1) } : null,
    status: a.statusProposal, verdict: a.verdict, ...(supported ? {} : { unsupportedWhy: a.correction || 'no official Pakistani guidance line found (31 Oct 2026 check)' }),
    priority: prio(a.id), timeCritical: a.phase === 'during', ...review(a.hazard) };
});

/* ── laws / rules / rights lines, with their location triggers (spec "Location-based rules"; conditional wording kept) ── */
const CONDITIONS = {
  'pbfp-rule': ['lowLandNearRiver'],          /* Punjab Flood Plain Act: low land near a river (no gazette flood-plain layer: "may be") */
  'pbidr-rule': ['inRiverFloodExtent'],       /* Punjab Rivers Act s.76: the river or its active flood plain (mapped river flood extent) */
  'kprp-rule': ['within1500ftOfWater'],       /* KP River Protection: 200 ft / 1,500 ft of a notified river ("if this river is notified") */
};
const regs = R0.map((r) => {
  let jur = Array.isArray(r.jurisdictionProposal) ? r.jurisdictionProposal : r.jurisdictions;
  jur = jur.map((j) => String(j).split(' ')[0]);   /* "sindh (Act text not read)" -> sindh, the note is kept */
  const jn = (r.jurisdictionProposal || []).find((j) => / /.test(String(j)));
  let sourceId = r.sourceIdProposal ? String(r.sourceIdProposal).split(' ')[0] : r.sourceId;
  const kind = r.kindProposal || r.kind;
  /* an item recast as official guidance cites the NDMA plan family (the check's verified URL is an NDMA plan) */
  if (kind === 'official' && srcById[sourceId] && !['checked-text', 'machine-verified-official-text'].includes(srcById[sourceId].status) && /ndma\.gov\.pk/.test(r.verifiedUrl || '')) sourceId = 'ndrr';
  return { id: r.id, kind, tab: r.tab, hazards: r.hazards, audiences: ['*'], jurisdictions: jur, ...(jn ? { jurisdictionNote: jn } : {}),
    ...(CONDITIONS[r.id] ? { conditions: CONDITIONS[r.id] } : {}),
    text_en: r.proposedText_en || r.text_en, text_ur: r.text_ur || null, sourceId,
    sourceRef: { doc: (srcById[sourceId] || {}).title || null, url: r.verifiedUrl || ((srcById[sourceId] || {}).source || {}).url || null, section: r.verifiedSection || null },
    status: r.statusProposal || r.status, verdict: r.verdict, correction: r.correction || null, priority: 1, timeCritical: false, ...review(r.hazards) };
});

/* ── audience duties and rights: the starter lines with the wording fixes the 31 Oct check listed; not checked line by line ── */
const FIX = {
  'Follow district and disaster authority directions; refusing is an offence (NDM Act s.33).': 'Follow directions given under the disaster law by the government and disaster authorities; refusing them without good reason, or obstructing officials, is an offence (NDM Act s.33).',
  'In Punjab, see dam emergency plans and the river ledger (Rivers Act s.72, 75).': 'In Punjab, residents of an area a listed dam or embankment could flood can inspect the part of its emergency action plan for their area; river ledgers are at the Chief Engineer\u2019s office (Rivers Act s.72, 75).',
  'Do not burn crop residue during smog bans (Section 144, Smog Rules).': 'In Punjab, burning crop stubble is banned all year (Smog Rules r.7).',
  'Remission of land revenue and water charges after a calamity declaration.': 'Remission of government dues after a calamity declaration.',
  'Listed companies disclose climate risk (SECP order 2024).': 'Listed companies and SECP-licensed public interest companies disclose climate risk, in phases (SECP order 2024).',
  'Relief after a calamity declaration (Calamities Act s.3).': 'After a calamity declaration the government may remit government dues and must pay reasonable compensation for requisitioned property (Calamities Act s.3, 4).',
};
const SRC_OF = (t) => /NDM Act|s\.2[0-2]\b|s\.3[2-7]\b|s\.40\b/.test(t) ? 'ndm' : /Flood Plain/.test(t) ? 'pbfp' : /Rivers Act/.test(t) ? 'pbidr' : /Calamit/.test(t) ? 'calam' : /OSH/.test(t) ? 'osh' : /SECP/.test(t) ? 'secp' : /Smog/.test(t) ? 'smog' : /Climate Change/.test(t) ? 'cca' : /Land Acquisition/.test(t) ? 'landacq' : null;
const duties = [];
for (const a of D0) for (const [kind, arr] of [['duty', a.duties || []], ['right', a.rights || []]]) arr.forEach((t0, i) => {
  const t = FIX[t0] || t0, sid = SRC_OF(t);
  duties.push({ id: 'aud-' + a.audience + '-' + kind + '-' + (i + 1), kind: 'regulatory', tab: 'rights', line: kind, audiences: [a.audience], hazards: ['*'], jurisdictions: ['national'],
    text_en: t, text_ur: null, sourceId: sid, sourceRef: sid && srcById[sid] ? { doc: srcById[sid].title, url: srcById[sid].source.url, section: null } : null,
    status: 'to-verify', reworded: t !== t0, priority: i + 1, timeCritical: false, ...review(['flood', 'heat']) });
});

/* ── contacts: owner decision 2 Nov 2026 (only officially published numbers to customers) ── */
const PROV = { punjab: 'Punjab', sindh: 'Sindh', kp: 'Khyber Pakhtunkhwa', balochistan: 'Balochistan', gb: 'Gilgit-Baltistan', ajk: 'Azad Jammu and Kashmir', ict: 'Islamabad Capital Territory', national: 'National' };
const CUSTOMER_OK = { 'national|NDMA helpline': true, 'punjab|Rescue 1122': true, 'punjab|PDMA Punjab': true, 'sindh|Rescue 1122': true, 'sindh|PDMA Sindh': true,
  'kp|Rescue 1122': true, 'kp|PDMA Khyber Pakhtunkhwa': true, 'balochistan|PDMA Balochistan': true, 'gb|Rescue 1122': true, 'gb|District control room': true, 'ajk|SDMA Azad Kashmir': true };
const OPERATOR_ONLY_DISTRICT = { 'gb|District control room|Ghizer': 'the number printed in the GBDMA plan (05811-930115) carries the Gilgit area code; looks misprinted, confirm before showing to customers' };
const ROLE = (n) => /Rescue/.test(n) ? 'rescue' : /PDMA|SDMA|GB Disaster|NDMA/.test(n) ? 'authority' : /District control|control room/i.test(n) ? 'district' : /Irrigation/.test(n) ? 'irrigation' : 'other';
const DISTRICT_ALIAS = { Diamer: 'Diamir' };   /* the GB plan's spelling -> NIGRAAN's tehsil register */
const contacts = [];
for (const p of C0) for (const c of p.contacts) {
  const key = p.province + '|' + c.name, phone = c.phoneProposal || c.phone || null, found = c.verdict !== 'not-found';
  const base = { province: p.province, provinceName: PROV[p.province] || p.province, name: c.name, role: ROLE(c.name), note: c.note || null,
    status: c.statusProposal || c.status, verifiedUrl: c.verifiedUrl || null, verifiedOn: c.verifiedOn || VERIFIED_ON, verdict: c.verdict, correction: c.correction || null };
  if (Array.isArray(c.perDistrict)) {
    for (const d of c.perDistrict) { const dk = key + '|' + d.district, opOnly = OPERATOR_ONLY_DISTRICT[dk];
      contacts.push({ id: (p.province + '-' + base.role + '-' + d.district).toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...base, ...(p.province === 'gb' && base.role === 'district' ? { name: 'District police control room', note: 'as listed in the GBDMA Summer Flood Contingency Plan 2025' } : {}), district: DISTRICT_ALIAS[d.district] || d.district, districtAsPrinted: d.district,
        phone: d.phone, ...(d.note ? { districtNote: d.note } : {}), customer: !!CUSTOMER_OK[key] && !opOnly, ...(opOnly ? { operatorOnlyWhy: opOnly } : {}) }); }
    continue; }
  contacts.push({ id: (p.province + '-' + base.role + '-' + c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...base, district: null, perDistrict: c.perDistrict === true,
    phone: phone ? [phone] : [], customer: !!CUSTOMER_OK[key] && !!phone && found,
    ...(!CUSTOMER_OK[key] ? { operatorOnlyWhy: !found ? 'no officially published number found (31 Oct 2026 check)' : 'not on the owner\u2019s list of officially published numbers (2 Nov 2026)' } : {}) });
}

const manifest = {
  library: 'nigraan-guidance', schema: 'agn.guidance-library.v1', version: VERSION, built: BUILT, builder: 'scripts/gen/build_guidance_library.mjs',
  inputs: ['data/guidance/_inputs/starter (handover pack NIGRAAN_WhatToDoHere_Handover)', 'data/guidance/_inputs/verified_20261031 (online check 31 Oct 2026; laptop copy D:\\NIGRAAN\\inputs\\guidance_pack\\verified_20261031)'],
  files: LIBRARY_FILES,
  review: { reviewer: '', reviewerNote: 'No named legal reviewer: customers use their own reviewer (owner decision 2 Nov 2026). Texts were checked online against official text on 31 Oct 2026; that is not a legal review.', verifiedOn: VERIFIED_ON, nextReviewBy: NEXT_REVIEW, staleAfterMonths: 12 },
  hazardsV1: ['flood', 'heat', 'landslide', 'glof'], hazardsLater: ['smog'],
  audiencesV1: { public: { items: 'household', label: 'Public / household' }, business: { items: 'business', label: 'Business / site' }, official: { items: 'official', label: 'District official' } },
  audiencesHidden: ['farmer', 'engineer', 'facility', 'ngo'],
  levelMap: { Moderate: 'monitor', High: 'watch', Severe: 'act', Normal: 'standing', Low: 'standing' }, levelMapNote: 'no level (not tested, not assessed, withheld) -> contacts and "no level here", never "clear"; cannot happen here -> "not relevant here", no guidance; GLOF exposure (applicability "can happen here") -> before actions only',
  phases: { standing: [['before', 'Standing preparedness']], monitor: [['before', 'Prepare']], watch: [['before', 'Get ready now'], ['during', 'If it gets worse']], act: [['during', 'Do this now'], ['before', 'Then']], glofExposure: [['before', 'Prepare']] },
  perPhase: 6,
  viewPolicy: {
    customer: { do: ['checked-text', 'machine-verified-official-text'], rules: ['checked-text'], rights: ['checked-text'] },
    operator: 'every item, flagged when it is not customer-visible',
    why: 'owner decision 2 Nov 2026: the 130 "Do now" actions matched to official NDMA/PDMA guidance may be shown to customers; laws, rules and rights lines only when checked-text' },
  officialSourceStatuses: ['checked-text', 'machine-verified-official-text'],
  officialWarnings: { feed: null, note: 'No official warning feed in version 1: no warning banner is shown.' },
  footer: 'Official warnings are issued by the national and provincial authorities. Not legal advice.',
  changeLog: [{ version: VERSION, date: BUILT, change: 'First library: 24 sources, ' + actions.length + ' actions (' + actions.filter((a) => a.status === 'machine-verified-official-text').length + ' official), ' + regs.length + ' rule and right lines, ' + duties.length + ' audience lines, ' + contacts.length + ' contacts; texts and statuses from the 31 Oct 2026 check; owner decisions of 2 Nov 2026.' }],
};

const lib = { manifest, sources, actions, regulatory: regs, duties, contacts };
const V = validateLibrary(lib);
if (!V.ok) { console.error('LIBRARY INVALID:\n  ' + V.errors.join('\n  ')); process.exit(1); }
const files = { 'manifest.json': manifest, 'sources.json': sources, 'action_items.json': actions, 'regulatory_items.json': regs, 'duties_rights.json': duties, 'contacts.json': contacts };
if (process.argv.includes('--check')) { let diff = 0; for (const [f, v] of Object.entries(files)) { const p = join(G, f); const same = existsSync(p) && readFileSync(p, 'utf8') === JSON.stringify(v, null, 1) + '\n'; if (!same) { diff++; console.log('DIFFERS ' + f); } }
  console.log(diff ? diff + ' file(s) differ from a fresh build' : 'library on disk = a fresh build (' + VERSION + ')'); process.exit(diff ? 1 : 0); }
for (const [f, v] of Object.entries(files)) { const p = join(G, f); writeFileSync(p + '.tmp', JSON.stringify(v, null, 1) + '\n'); renameSync(p + '.tmp', p); }
console.log('guidance library ' + VERSION + ' written: ' + Object.keys(files).join(', ') + ' · ' + V.counts);
