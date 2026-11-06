// S11 · the urban heat fallback caveat no longer claims the ranking is better supported (the served model caveat says it barely ranks).
import { src, ok, done } from './lib.mjs';
const S = src('server/api/urbanheat.mjs');
ok(!/The RANKING between places is better supported than the absolute value/.test(S), 'S11: the contradicting fallback sentence is gone');
ok(/caveat: MODEL\.caveat \|\| 'the model caveat could not be read[^']*barely ranks places inside one city/.test(S), 'S11: the fallback agrees with the served caveat (barely ranks inside one city)');
done('S11-URBANCAVEAT');
