// v154 · Overview cleanup: one station/live sentence, key above the day strip, switch in the top bar, UTCI tile consistent
import fs from 'node:fs';
const R = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0; const t = (n, c) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
const v84 = R('build/v84_ui.html'), srv = R('server/server.mjs'), hl = R('server/api/hyperlocal.mjs'), lv = R('build/levels_ui.html');
const page = fs.readdirSync(new URL('../../artefact/', import.meta.url)).filter(f => f.endsWith('.html')).map(f => R('artefact/' + f)).join('\n');
t('bar: hard-coded 15 km / 40 km sentence removed', !v84.includes('stations up to 40 km away still feed the live correction') && !page.includes('stations up to 40 km away still feed the live correction'));
t('strip: "the live layer needs two" removed', !v84.includes("within 40 km; the live layer needs two"));
t('strip: uses the point engine reason', v84.includes("live MACH correction not used: '+(B.liveWhy"));
t('legend: one overview rule above the day strip', (v84.match(/#mpMapWrap\.agn-mb84 #v3legend\{/g) || []).length === 1 && v84.includes('bottom:calc(var(--agn85-bot,12px) + 48px)'));
t('switch: moved into the top bar', srv.includes("document.querySelector('header.topbar')") && srv.includes('#agn-switch.in-top{position:static'));
t('hyperlocal: empty feed is not "no station"', hl.includes('the MACH fleet feed returned no readings at the last poll'));
t('hyperlocal: names siting / QC exclusions', hl.includes('without a measured daytime siting correction') && hl.includes("why: 'siting'"));
t('UTCI tile: head and level follow the present value', lv.includes("present hour (corrected), shade") && lv.includes('the AGN ladder for the present hour'));
t('panel re-renders on sweep-done', page.includes('"agn:sweep-done",function(){ if(liveLocal.comparisonUnit) render('));
// PM2.5 ground check extended to Punjab districts (provincial monitoring reports), each adopted site better held-out than raw
const PC = JSON.parse(R('data/pm25-correction.json'));
const dist = Object.entries(PC.sites).filter(([k, v]) => v.basis);
t('pm25: seven district sites added', dist.length === 7 && PC.version === 'pm25c-91.17.154');
t('pm25: every district site improved held-out and keeps b1 > 0', dist.every(([k, v]) => v.heldOut.mae <= 0.9 * v.raw.mae && v.coef[1] > 0 && v.heldOut.cat >= v.raw.cat));
t('pm25: Lahore independent check recorded', PC.independentChecks && PC.independentChecks.lahoreProvincialMonitors.usMonitorModel.mae < PC.independentChecks.lahoreProvincialMonitors.raw.mae);
t('skill card: no supplier name, states the ground check', /GROUND-CHECKED NEAR 11 CITIES/.test(R('server/api/skill.mjs')) && !/No PMD station/.test(R('server/api/skill.mjs')));
// live: the point engine reason is consistent with its numbers
try {
  const j = await (await fetch('http://localhost:8787/api/point?lat=33.68&lon=73.05')).json();
  const b = j.build || (j.point && j.point.build); const why = b && b.liveWhy || '';
  const m = why.match(/; (\d+) usable for the live layer.*it needs (\d+)/);
  t('live reason: usable < needed when not applied', !b || b.liveApplied || !m || (+m[1] < +m[2]));
} catch (e) { t('live reason fetch', false); }
console.log(`v154: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
