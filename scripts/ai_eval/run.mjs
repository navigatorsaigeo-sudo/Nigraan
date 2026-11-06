/* v91.17.101 · audit #84 · the AI analyst's graded question set. node scripts/ai_eval/run.mjs [--base http://127.0.0.1:8787] [--customer]
   Grades every answer: expected words present, forbidden words absent (supplier names, held-out skill), refusals decline, the
   number firewall removed nothing, no empty answer. Writes data/ai-eval-last.json (operator). Pass mark 90 %. */
import { readFileSync, writeFileSync } from 'node:fs';
const A = process.argv.slice(2); const BASE = A.includes('--base') ? A[A.indexOf('--base') + 1] : 'http://127.0.0.1:8787';
const H = { 'content-type': 'application/json', ...(A.includes('--customer') ? { 'x-agn-view': 'customer' } : {}) };
const Q = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8'));
const res = []; let pass = 0;
for (const it of Q.items) {
  const t0 = Date.now(); let j = null, err = null;
  try { const r = await fetch(BASE + '/api/ai/chat', { method: 'POST', headers: H, body: JSON.stringify({ prompt: it.q, context: { location: 'Islamabad' } }), signal: AbortSignal.timeout(240000) }); j = await r.json(); } catch (e) { err = e.message; }
  const ans = String((j && (j.answer || j.why)) || ''), low = ans.toLowerCase(); const fails = [];
  if (!ans.trim()) fails.push('empty' + (err ? ' (' + err + ')' : ''));
  for (const g of it.expect || []) if (!g.some(w => low.includes(String(w).toLowerCase()))) fails.push('missing one of: ' + g.join('/'));
  for (const w of it.forbid || []) if (low.includes(String(w).toLowerCase())) fails.push('forbidden: ' + w);
  if (j && j.firewall && j.firewall.removed && !j.firewall.replacedByGrounded) fails.push('firewall removed ' + j.firewall.removed);
  const ok = !fails.length; if (ok) pass++;
  res.push({ id: it.id, q: it.q, ok, fails, ms: Date.now() - t0, model: j && j.model, grounded: !!(j && j.firewall && j.firewall.replacedByGrounded), answer: ans.slice(0, 600) });
  console.log((ok ? 'PASS ' : 'FAIL ') + it.id + ' ' + it.q + (ok ? '' : ' :: ' + fails.join('; ')));
}
const score = Math.round(1000 * pass / Q.items.length) / 10;
writeFileSync(new URL('../../data/ai-eval-last.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), set: Q.version, base: BASE, score, pass, total: Q.items.length, results: res }, null, 1));
console.log((score >= 90 ? 'PASS' : 'FAIL') + ' ai-eval: ' + pass + '/' + Q.items.length + ' (' + score + ' %)'); process.exit(score >= 90 ? 0 : 1);
