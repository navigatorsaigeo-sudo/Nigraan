// v91.17.283 · WS2 · compare two captures of urls60.json (base, WS2): byte-equal after the code-identity masks of compare3.mjs; for each
// differing body, every differing JSON leaf path (up to 40). usage: node diff60.mjs <urls.json> <base.json> <ws2.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [U, A, B, OUT] = process.argv.slice(2); const reqs = JSON.parse(readFileSync(U, 'utf8')), a = JSON.parse(readFileSync(A, 'utf8')), b = JSON.parse(readFileSync(B, 'utf8'));
const mask = (x) => x.replace(/("chainId":"|"chain":\{"id":"|"snapshot":"S-|"snapshotId":"S-)[0-9a-f]+/g, '$1#').replace(/"codeFiles":\d+/g, '"codeFiles":#').replace(/"provenanceSha256":"[0-9a-f]+"/g, '"provenanceSha256":"#"').replace(/"tableFiles":\d+/g, '"tableFiles":#').replace(/"(report|id)":"site-[0-9-]+-[0-9a-f]+"/g, '"$1":"#"').replace(/"modified":"[0-9T:.Z-]+"/g, '"modified":"#"');   /* file times differ between two fresh copies */
function leaves(x, y, p, out) { if (out.length >= 40) return; if (x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) leaves(x[k], y[k], p + '/' + k, out); return; }
  if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path: p, base: JSON.stringify(x)?.slice(0, 200), ws2: JSON.stringify(y)?.slice(0, 200) }); }
const rows = [], byKind = {}; let same = 0, errs = 0;
reqs.forEach((q, i) => { const k = byKind[q.kind] = byKind[q.kind] || { n: 0, same: 0 }; k.n++; if (String(a[i].s).startsWith('ERR') || String(b[i].s).startsWith('ERR')) errs++;
  if (a[i].s === b[i].s && mask(a[i].b) === mask(b[i].b)) { same++; k.same++; return; }
  let d = []; try { leaves(JSON.parse(mask(a[i].b)), JSON.parse(mask(b[i].b)), '', d); } catch (_) { d = [{ path: '(body)', base: a[i].b.slice(0, 200), ws2: b[i].b.slice(0, 200) }]; }
  if (a[i].s !== b[i].s) d.unshift({ path: '(status)', base: a[i].s, ws2: b[i].s });
  rows.push({ req: q.m + ' ' + q.path + (q.body ? ' ' + q.body.assets[0].name : ''), diffs: d }); });
writeFileSync(OUT, JSON.stringify({ requests: reqs.length, identical: same, differ: rows.length, fetchErrors: errs, byKind, rows }, null, 1));
console.log('requests ' + reqs.length + ', identical ' + same + ', differ ' + rows.length + ', fetch errors ' + errs);
for (const [k, v] of Object.entries(byKind)) if (v.same !== v.n) console.log('  ' + k.padEnd(30) + v.same + '/' + v.n);
