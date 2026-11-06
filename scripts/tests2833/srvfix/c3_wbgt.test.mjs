// C3 · WBGT answers carry the environmental value and the ISO 7243 statement; no work/rest ratios or "stop heavy work".
import { imp, src, ok, done } from './lib.mjs';
const T = await imp('server/api/thermal.mjs');
const vals = [25, 27, 28.5, 30.2, 31.5, 34].map(T.wbgtBand);
ok(vals.every((v) => !/work\/rest|stop heavy work|no restriction|caution/.test(v)), 'thermal.wbgtBand: no work/rest phrases', JSON.stringify(vals.slice(3, 5)));
ok(vals.every((v) => /ISO 7243 reference values depend on workload, acclimatisation and clothing/.test(v)), 'thermal.wbgtBand: the reference statement');
ok(T.wbgtBand(null) === null, 'no WBGT -> null');
/* v91.17.283.19: the physical-state module of /api/state/point is retired; the WBGT wording lives in thermal.mjs only */
/* v91.17.283.20 (A3): the physical-state module serves only the operator bundle part state; its route /api/state/point stays retired */
ok(/import \{ createState \} from '\.\/state\.mjs'/.test(src('server/api/index.mjs')) && !/'\/api\/state\/point'/.test(src('server/api/index.mjs')), 'the physical-state module serves only the operator part state of the place bundle (its route stays retired)');
done('C3-WBGT');
