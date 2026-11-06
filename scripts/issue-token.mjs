#!/usr/bin/env node
/* Issue a locally signed access token for a named actor and role(s).
   node scripts/issue-token.mjs --sub asim --name "Asim Javid" --roles scientific_reviewer --hours 8 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createIdentity, ROLE_SCOPES } from '../server/api/core.mjs';
const a = process.argv.slice(2); const get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = process.env.NIGRAAN_DATA_DIR || join(root, 'data'); mkdirSync(dataDir, { recursive: true });
const roles = get('roles', 'viewer').split(',');
const bad = roles.filter(r => !ROLE_SCOPES[r]); if (bad.length) { console.error('Unknown role(s): ' + bad.join(', ') + '\nKnown: ' + Object.keys(ROLE_SCOPES).join(', ')); process.exit(1); }
const t = createIdentity(dataDir).issue({ sub: get('sub', 'user'), name: get('name'), roles, tenantId: get('tenant', 'agn-development'), ttlHours: Number(get('hours', 8)) });
console.log(t);
