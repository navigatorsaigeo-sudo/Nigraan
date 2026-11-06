/* Operator mode and Customize open only on a browser that presents the dashboard token.
   Issuing a token does not open them for anyone else. The dashboard password signs in
   only the browser that entered it. Both are cookies on that browser; the server stores hashes. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COOKIE = 'agn_dash';
const ADMIN_COOKIE = 'agn_dash_admin';
let inst = null;

function hashOf(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function envPassword(dataDir) {
  let fromFile = null;
  try {
    for (const line of readFileSync(join(dataDir, '..', '.env'), 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*NIGRAAN_DASHBOARD_PASSWORD\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let value = m[1];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      fromFile = value;
    }
  } catch { /* the process environment is the fallback */ }
  const value = fromFile != null ? fromFile : String(process.env.NIGRAAN_DASHBOARD_PASSWORD || '');
  return value.trim();
}

function cookieValue(req, name) {
  const raw = String((req && req.headers && req.headers.cookie) || '');
  for (const part of raw.split(';')) {
    const bit = part.trim();
    if (!bit.startsWith(`${name}=`)) continue;
    try { return decodeURIComponent(bit.slice(name.length + 1)); } catch { return ''; }
  }
  return '';
}

function create(dataDir) {
  const file = join(dataDir, 'dashboard-gate.json');
  function read() {
    let j = {};
    try { j = JSON.parse(readFileSync(file, 'utf8')); } catch { j = {}; }
    const st = {
      locked: j.locked !== false,
      hash: typeof j.hash === 'string' ? j.hash : null,
      issuedAt: j.issuedAt || null,
      adminHash: typeof j.adminHash === 'string' ? j.adminHash : null,
      adminPass: typeof j.adminPass === 'string' ? j.adminPass : null,
    };
    return st;
  }
  function write(state) {
    mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({
      locked: !!state.locked,
      hash: state.hash || null,
      issuedAt: state.issuedAt || null,
      adminHash: state.adminHash || null,
      adminPass: state.adminPass || null,
    }), { mode: 0o600 });
    renameSync(tmp, file);
  }
  function tokenOk(token) {
    const st = read();
    if (!envPassword(dataDir) || st.locked || !st.hash || !token) return false;
    return sameHash(hashOf(token), st.hash);
  }
  function passwordOk(password) {
    const expected = envPassword(dataDir);
    const given = String(password || '');
    if (!expected || given.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  }
  return {
    cookie: COOKIE,
    adminCookie: ADMIN_COOKIE,
    admin(req) {
      const expected = envPassword(dataDir);
      const st = read();
      if (!expected || !st.adminHash || !st.adminPass) return false;
      if (!sameHash(hashOf(expected), st.adminPass)) return false;
      return sameHash(hashOf(cookieValue(req, ADMIN_COOKIE)), st.adminHash);
    },
    view(req) {
      if (!envPassword(dataDir)) return { authed: false, configured: false };
      if (!this.admin(req)) return { authed: false, configured: true };
      const st = read();
      const live = !st.locked && !!st.hash;
      return { authed: true, configured: true, locked: !live, hasToken: live, issuedAt: live ? st.issuedAt : null };
    },
    login(password) {
      if (!passwordOk(password)) return null;
      const st = read();
      const admin = randomBytes(24).toString('base64url');
      write({ ...st, adminHash: hashOf(admin), adminPass: hashOf(envPassword(dataDir)) });
      return admin;
    },
    issue() {
      const st = read();
      const token = randomBytes(24).toString('base64url');
      const issuedAt = new Date().toISOString();
      write({ ...st, locked: false, hash: hashOf(token), issuedAt });
      return { token, issuedAt, locked: false, authed: true };
    },
    lock() {
      const st = read();
      write({ ...st, locked: true, hash: null, issuedAt: null });
      return { locked: true, hasToken: false, issuedAt: null, authed: true };
    },
    open(req) {
      return tokenOk(cookieValue(req, COOKIE));
    },
    accepts(token) {
      return tokenOk(String(token || '').trim());
    },
  };
}

export function dashGate(dataDir) {
  if (!inst) {
    if (!dataDir) throw new Error('dashboard gate is not ready');
    inst = create(dataDir);
  }
  return inst;
}
