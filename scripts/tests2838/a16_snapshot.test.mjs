// audit 16 · a snapshot id resolves from the whole retention window (every snapshots_YYYY-MM.jsonl held, not only this month and last),
// and a report's snapshot resolves by the report id (the id it was issued under is kept on its library entry).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, src, ok, done } from './lib.mjs';
const { createSnapshot } = await imp('server/api/snapshot.mjs');
const D = mkdtempSync(join(tmpdir(), 'snap-')); mkdirSync(join(D, 'archive', 'snapshots'), { recursive: true });
const old = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 7);
writeFileSync(join(D, 'archive', 'snapshots', 'snapshots_' + old + '.jsonl'), JSON.stringify({ id: 'S-0123456789ab', at: old + '-05T00:00:00Z', parts: { chain: 'c' } }) + '\n');
const app = { provenance: { chain: () => ({ id: null }) }, outlook: { status: () => ({}) }, engine: { latest: () => null }, store: { filter: () => [] }, reports: { entry: (id) => (id === 'site_x_00001' ? { id, snapshot: 'S-0123456789ab' } : id === 'old_rep_0001' ? { id } : null) } };
const S = createSnapshot(app, D);
const hit = S.lookup('S-0123456789ab');
ok(hit && hit.id === 'S-0123456789ab', 'a snapshot written ' + old + ' (about 200 days ago, inside the 365-day report retention) resolves (v283.7: only this month and last)');
const r = S.lookupReport ? S.lookupReport('site_x_00001') : null, r2 = S.lookupReport ? S.lookupReport('old_rep_0001') : null;
ok(r && r.found && r.snapshot.id === 'S-0123456789ab', 'lookup by report id: the report\'s snapshot', JSON.stringify(r).slice(0, 200));
ok(r2 && r2.found === false && /recorded no snapshot/.test(r2.why), 'a report issued before the build says it recorded none', JSON.stringify(r2));
ok(/snapshot: \(\(\) => \{ try \{ return app && app\.snapshot \? app\.snapshot\.id\(\)/.test(src('server/api/reports.mjs')) && /searchParams\.get\('report'\)/.test(src('server/server.mjs')), 'reports record the snapshot id; GET /api/snapshot?report=<id>');
rmSync(D, { recursive: true, force: true });
done('A16-SNAPSHOT');
