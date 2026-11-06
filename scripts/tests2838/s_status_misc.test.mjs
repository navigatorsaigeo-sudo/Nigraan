// audit (other items) · the deploy writes a current "Latest entry" line at the top of NIGRAAN_STATUS_REPORT.md (it still named v268);
// the physical-state method text names the fixed-albedo method; the deploy scripts stay ASCII.
import { src, ok, done } from './lib.mjs';
const T = src('scripts/deploy/templates/DEPLOY.ps1.tpl');
ok(/\(\?m\)\^\\\*\\\*Latest entry:\\\*\\\*\[\^\\r\\n\]\*/.test(T) && /\*\*Latest entry:\*\* NIGRAAN v\{0\}, deployed \{1:yyyy-MM-dd HH:mm\} PKT/.test(T), 'DEPLOY: the "Latest entry" line is replaced with this release at every deploy');
ok([...T].every((c) => c.charCodeAt(0) < 128), 'DEPLOY template: ASCII only');
/* v91.17.283.19: the physical-state module (its method text) is retired with /api/state/point */
/* v91.17.283.20 (A3): the physical-state module serves only the operator bundle part state; its route /api/state/point stays retired */
ok(/import \{ createState \} from '\.\/state\.mjs'/.test(src('server/api/index.mjs')) && !/'\/api\/state\/point'/.test(src('server/api/index.mjs')), 'the physical-state module serves only the operator part state of the place bundle (its route stays retired)');
done('S-STATUS-MISC');
