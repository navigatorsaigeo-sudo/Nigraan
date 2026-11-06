// S8 · the wind gate limitation no longer says gusts are always taken from the mean wind; the resolved gate is regenerated (same version).
import { src, ok, done } from './lib.mjs';
const G = JSON.parse(src('data/model-gate.json')), R = JSON.parse(src('data/model-gate.resolved.json'));
const all = (o) => JSON.stringify(o);
ok(!/gusts are taken from the mean wind by a fixed factor/.test(all(G)) && !/gust factor from wind is fixed"/.test(all(G)), 'S8: model-gate.json: the wrong sentence is gone');
ok(/only where no gust is retrieved is it estimated from the mean wind by a fixed factor/.test(all(G)), 'S8: model-gate.json: the corrected client limitation');
ok(!/gusts are taken from the mean wind by a fixed factor/.test(all(R)) && /only where no gust is retrieved/.test(all(R)), 'S8: model-gate.resolved.json regenerated with the corrected text');
ok(G.version === 'gate-91.17.283' && R.version === 'gate-91.17.283', 'S8: the gate version is kept (gate-91.17.283)', G.version + ' / ' + R.version);
done('S8-GATE');
