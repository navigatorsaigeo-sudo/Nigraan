// budget cut 5 · only billed (answered) calls count toward shed: a failed backend call or proxy fetch adds nothing to the class/tier use,
// and the day's use the budget compares with its levels leaves the failed attempts out (failedWeighted).
import { imp, ok, done } from './lib.mjs';
const CB = await imp('server/api/callbudget.mjs');
const W = { day: '2026-10-21', backendWeighted: 0, browserWeighted: 0 };
let fail = false;
const provider = { configured: () => true, windowFor: () => W,
  call: async (kind, path, params, opts) => { W.backendWeighted += 10; if (fail) throw Object.assign(new Error('Provider rejected the request'), { code: 'CONTRACT_INVALID' }); return { ok: 1 }; },
  noteProxyCall(w, ok) { W.browserWeighted += w; return W; } };
const notes = [];
const budget = { current: () => 'background', currentTag: () => 'x', allow: () => true, note: (cls, w) => notes.push([cls, w]) };
CB.gateProvider(provider, budget, () => 10, () => new Error('refused'));
await provider.call('forecast', '/v1/forecast', {}, { locations: 1 });
ok(notes.length === 1 && notes[0][1] === 10, 'an answered backend call is counted toward the class use');
fail = true; try { await provider.call('forecast', '/v1/forecast', {}, { locations: 1 }); } catch (_) {}
ok(notes.length === 1, 'a failed backend call is not counted toward the class use (not billed)', notes.length);
ok(W.failedWeighted === 10, 'its weight is kept apart as failedWeighted', W.failedWeighted);
provider.noteProxyCall(7, false); ok(notes.length === 1 && W.failedWeighted === 17, 'a failed proxy fetch: not counted, kept apart');
provider.noteProxyCall(5, true); ok(notes.length === 2 && notes[1][1] === 5, 'an answered proxy fetch is counted');
/* the budget's own day use leaves the failed weight out */
const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
const D = mkdtempSync(join(tmpdir(), 'b5-')); writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ mode: 'monitor', dailyWeightedCap: 100, shedBackgroundAtShare: 0.8 }));
const B = CB.createCallBudget({ dataDir: D, provider: { windowFor: () => ({ day: 'x', backendWeighted: 90, browserWeighted: 0, failedWeighted: 50 }), id: 'mach' }, env: {} });
const st = B.status(); ok(st.usedWeighted === 40, 'the budget\'s day use = billed only (90 attempted - 50 failed = 40)', st.usedWeighted);
rmSync(D, { recursive: true, force: true });
done('B5-BILLED');
