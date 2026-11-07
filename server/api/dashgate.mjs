/* Operator mode and Customize open only on a browser that presents the dashboard token.
   Issuing a token does not open them for anyone else. The dashboard password signs in
   only the browser that entered it. Both are cookies on that browser; the server stores hashes.
   Each successful unlock is recorded so the local dashboard can show which computers opened. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COOKIE = 'agn_dash';
const ADMIN_COOKIE = 'agn_dash_admin';
const SESSION_COOKIE = 'agn_dash_sid';
const MAX_SESSIONS = 40;
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

function clientIp(req) {
  const xf = String((req && req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  if (xf) return xf;
  const xr = String((req && req.headers && (req.headers['x-real-ip'] || req.headers['x-agn-proxy-client'])) || '').trim();
  if (xr) return xr;
  return String((req && req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/i, '');
}

function deviceLabel(ua) {
  const s = String(ua || '');
  let browser = 'Browser';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera\//.test(s)) browser = 'Opera';
  else if (/Chrome\//.test(s) || /CriOS\//.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s) || /FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Safari\//.test(s) && !/Chrome\//.test(s) && !/CriOS\//.test(s)) browser = 'Safari';
  let os = 'device';
  if (/Windows/i.test(s)) os = 'Windows PC';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iPhone/iPad';
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'Mac';
  else if (/Linux/i.test(s)) os = 'Linux PC';
  return `${browser} on ${os}`;
}

function cleanSessions(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_SESSIONS).map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    deviceKey: typeof row.deviceKey === 'string' ? row.deviceKey : '',
    label: typeof row.label === 'string' ? row.label : 'Unknown device',
    ip: typeof row.ip === 'string' ? row.ip : '',
    host: typeof row.host === 'string' ? row.host : '',
    unlockedAt: row.unlockedAt || null,
    lastSeenAt: row.lastSeenAt || row.unlockedAt || null,
    lockedAt: row.lockedAt || null,
    open: row.open !== false && !row.lockedAt,
  })).filter((row) => row.id);
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
      sessions: cleanSessions(j.sessions),
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
      sessions: cleanSessions(state.sessions),
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
  function publicSessions(st) {
    return cleanSessions(st.sessions).map((row) => ({
      id: row.id,
      label: row.label,
      ip: row.ip,
      host: row.host,
      unlockedAt: row.unlockedAt,
      lastSeenAt: row.lastSeenAt,
      lockedAt: row.lockedAt,
      open: !st.locked && row.open && !row.lockedAt,
    }));
  }
  return {
    cookie: COOKIE,
    adminCookie: ADMIN_COOKIE,
    sessionCookie: SESSION_COOKIE,
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
      return {
        authed: true,
        configured: true,
        locked: !live,
        hasToken: live,
        issuedAt: live ? st.issuedAt : null,
        sessions: publicSessions(st),
      };
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
      write({ ...st, locked: false, hash: hashOf(token), issuedAt, sessions: [] });
      return { token, issuedAt, locked: false, authed: true, sessions: [] };
    },
    lock() {
      const lockedAt = new Date().toISOString();
      const st = read();
      const sessions = cleanSessions(st.sessions).map((row) => ({
        ...row,
        open: false,
        lockedAt: row.lockedAt || lockedAt,
      }));
      write({ ...st, locked: true, hash: null, issuedAt: null, sessions });
      return { locked: true, hasToken: false, issuedAt: null, authed: true, sessions: publicSessions({ ...st, locked: true, sessions }) };
    },
    open(req) {
      return tokenOk(cookieValue(req, COOKIE));
    },
    accepts(token) {
      return tokenOk(String(token || '').trim());
    },
    recordUnlock(req) {
      const st = read();
      if (st.locked || !st.hash) return null;
      const now = new Date().toISOString();
      const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 240);
      const ip = clientIp(req).slice(0, 80);
      const host = String((req && req.headers && req.headers.host) || '').slice(0, 120);
      const deviceKey = hashOf(`${ip}|${ua}`);
      const sid = cookieValue(req, SESSION_COOKIE);
      const sessions = cleanSessions(st.sessions);
      let row = sessions.find((s) => s.id === sid) || sessions.find((s) => s.deviceKey === deviceKey && !s.lockedAt);
      if (row) {
        row.label = deviceLabel(ua);
        row.ip = ip || row.ip;
        row.host = host || row.host;
        row.lastSeenAt = now;
        row.lockedAt = null;
        row.open = true;
        if (!row.unlockedAt) row.unlockedAt = now;
      } else {
        row = {
          id: randomBytes(12).toString('base64url'),
          deviceKey,
          label: deviceLabel(ua),
          ip,
          host,
          unlockedAt: now,
          lastSeenAt: now,
          lockedAt: null,
          open: true,
        };
        sessions.unshift(row);
      }
      write({ ...st, sessions });
      return { id: row.id, label: row.label, ip: row.ip, host: row.host, unlockedAt: row.unlockedAt };
    },
    touch(req) {
      if (!this.open(req)) return false;
      const st = read();
      const sid = cookieValue(req, SESSION_COOKIE);
      const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 240);
      const ip = clientIp(req).slice(0, 80);
      const deviceKey = hashOf(`${ip}|${ua}`);
      const sessions = cleanSessions(st.sessions);
      const row = sessions.find((s) => s.id === sid) || sessions.find((s) => s.deviceKey === deviceKey && s.open && !s.lockedAt);
      if (!row) return false;
      row.lastSeenAt = new Date().toISOString();
      if (ip) row.ip = ip;
      write({ ...st, sessions });
      return true;
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
