// A9 · a held GLOF day says "standing condition, not a day forecast" (API /api/levels, unit layers, AI facts); other held layers keep
// the once-per-issue note; levels unchanged.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, src, ok, done, TREE } from './lib.mjs';
const { createEngine } = await imp('server/api/engine.mjs');
const rec = JSON.parse(readFileSync(join(TREE, 'data', 'engine-latest.json'), 'utf8'));
const body = JSON.parse(JSON.stringify(rec)); for (const d of body.days) if (d.day > 0) for (const k of Object.keys(d.layers)) if (d.layers[k].held != null) delete d.layers[k];
const dir = mkdtempSync(join(tmpdir(), 'a9-')); const E = createEngine({}, dir, { port: 1 }); ok(E.report(body).ok, 'report accepted');
E.latest().received = new Date().toISOString();
const g = E.levels('glof', 2, false), d = E.levels('drought', 2, false), g0 = E.levels('glof', 0, false);
ok(g.ready && /susceptibility, not a day forecast/.test(g.held || '') && /standing condition/.test(g.held || ''), '/api/levels glof day 2: standing condition', g.held);
ok(d.ready && d.held === 'assessed once per issue: the level covers every issued day', '/api/levels drought day 2: the once-per-issue note is kept');
ok(JSON.stringify(g.levels) === JSON.stringify(g0.levels), 'glof day-2 levels = day-0 levels (no level change)');
const u = E.unit('Sindh|Sujawal|Jati', false);
ok(u.ready && u.days[2].layers.glof && u.days[2].layers.glof.held === true && /standing condition/.test(u.days[2].layers.glof.heldNote || ''), 'unit layer: held GLOF carries the standing-condition note');
ok(/heldFromIssue: true, \.\.\.\(x\.heldNote \? \{ heldNote: x\.heldNote \}/.test(src('server/api/ai.mjs')), 'AI unit facts carry the held note');
rmSync(dir, { recursive: true, force: true });
done('A9-HELD');
