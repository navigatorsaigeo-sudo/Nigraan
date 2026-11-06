// W2 · terrain position: Weiss landform classes 1-3 are drainage lines, not "valley floor"; class 4 is the valley floor.
import { src, lift, ok, done } from './lib.mjs';
const S = src('server/api/placefacts.mjs'); const t = lift(S, 'LF_GROUP'); const LF = t ? new Function(t + '\nreturn LF_GROUP;')() : {};
ok(LF[1] && LF[2] && LF[3] && ![1, 2, 3].some((k) => LF[k] === 'valley floor'), 'W2: classes 1-3 are not "valley floor"', JSON.stringify([LF[1], LF[2], LF[3]]));
ok(/canyon/.test(LF[1]) && /shallow valley/.test(LF[2]) && /headwater/.test(LF[3]), 'W2: canyon / shallow valley / headwater (Weiss 2001)');
ok(LF[4] === 'valley floor' && LF[5] === 'plain', 'W2: class 4 valley floor, 5 plain unchanged');
done('W2-LANDFORM');
