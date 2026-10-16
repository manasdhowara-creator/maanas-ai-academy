/* accounts.js — learner accounts + private per-learner cloud data.

   WHAT IT DOES
   - Sign up / log in / log out with a name, an email-or-username, and a password.
   - Every learner's study data (lessons, mistakes, notes, tests, coach chat, settings…) is stored
     on the server under THEIR account only, so logging in on any phone or computer brings it back.
   - Nobody can read or change another learner's data: every data route looks up the learner from
     their own login cookie, never from anything the browser claims.

   HOW IT IS SAFE
   - Passwords are never stored. Only a salted scrypt hash (Node's built-in crypto) is kept.
   - The login cookie holds a random token; the database only keeps a SHA-256 of it, so even a
     leaked database can't be used to log in. Cookie is HttpOnly + SameSite=Lax (+ Secure on HTTPS).
   - Mutating requests must carry the X-Requested-With header (blocks cross-site form posts).
   - Repeated wrong passwords lock that login for 15 minutes; sign-ups are rate-limited per IP.

   WHERE DATA LIVES
   - DATABASE_URL set (Neon / any Postgres) → permanent storage. This is the production setup.
   - No DATABASE_URL → a local JSON file (./data/accounts.json). Fine for local testing only:
     on Render's free plan that file is wiped on every restart, so the server warns loudly. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const COOKIE = 'maa_sid';
const SESSION_DAYS = 365;
const DOC_MAX_BYTES = 8 * 1024 * 1024;        // one lesson / book document
const USER_MAX_BYTES = 150 * 1024 * 1024;     // everything one learner stores
const KEY_RE = /^[a-z]{1,16}(_[A-Za-z0-9_-]{1,100})?$/;
const LOGIN_RE = /^[a-z0-9._@+-]{3,80}$/;

/* ---------------- password + token helpers ---------------- */
const scrypt = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
async function hashPassword(pw){
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(pw, stored){
  try {
    const [algo, s, h] = String(stored).split('$');
    if(algo !== 'scrypt') return false;
    const key = await scrypt(pw, Buffer.from(s, 'base64'));
    const want = Buffer.from(h, 'base64');
    return want.length === key.length && crypto.timingSafeEqual(want, key);
  } catch(_){ return false; }
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const newId = () => crypto.randomUUID();
const normLogin = s => String(s || '').trim().toLowerCase();

/* ---------------- storage backends ---------------- */
function pgStore(url){
  const { Pool } = require('pg');
  const needsSsl = !/localhost|127\.0\.0\.1/.test(url) && !/sslmode=disable/.test(url);
  // Neon/Render URLs carry ?sslmode=…&channel_binding=…; drop them and set TLS explicitly
  // (verified certificates), so driver-version quirks in parsing those options can't break the connection.
  let cleanUrl = url;
  try { const u = new URL(url); ['sslmode', 'channel_binding', 'sslrootcert'].forEach(k => u.searchParams.delete(k)); cleanUrl = u.toString(); } catch(_){}
  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: needsSsl ? { rejectUnauthorized: process.env.DB_SSL_INSECURE !== '1' } : undefined,
    max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000,
  });
  pool.on('error', e => console.error('Postgres pool error:', e.message));
  const q = (text, params) => pool.query(text, params);
  return {
    kind: 'database',
    async init(){
      await q(`CREATE TABLE IF NOT EXISTS maa_users(
        id text PRIMARY KEY, login text UNIQUE NOT NULL, name text NOT NULL DEFAULT '',
        pass text NOT NULL, created bigint NOT NULL, last_login bigint)`);
      await q(`CREATE TABLE IF NOT EXISTS maa_sessions(
        token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES maa_users(id) ON DELETE CASCADE,
        created bigint NOT NULL, expires bigint NOT NULL, agent text)`);
      await q(`CREATE INDEX IF NOT EXISTS maa_sessions_user ON maa_sessions(user_id)`);
      await q(`CREATE TABLE IF NOT EXISTS maa_docs(
        user_id text NOT NULL REFERENCES maa_users(id) ON DELETE CASCADE, key text NOT NULL,
        data text, u bigint NOT NULL, srv bigint NOT NULL, size integer NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, key))`);
      await q(`CREATE INDEX IF NOT EXISTS maa_docs_srv ON maa_docs(user_id, srv)`);
      await q(`DELETE FROM maa_sessions WHERE expires < $1`, [Date.now()]);
    },
    async createUser(u){
      try { await q(`INSERT INTO maa_users(id, login, name, pass, created) VALUES($1,$2,$3,$4,$5)`, [u.id, u.login, u.name, u.pass, u.created]); return true; }
      catch(e){ if(e.code === '23505') return false; throw e; }
    },
    async userByLogin(login){ return (await q(`SELECT * FROM maa_users WHERE login=$1`, [login])).rows[0] || null; },
    async userById(id){ return (await q(`SELECT * FROM maa_users WHERE id=$1`, [id])).rows[0] || null; },
    async updateUser(id, fields){
      const keys = Object.keys(fields); if(!keys.length) return;
      await q(`UPDATE maa_users SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1`, [id, ...keys.map(k => fields[k])]);
    },
    async deleteUser(id){ await q(`DELETE FROM maa_users WHERE id=$1`, [id]); },
    async addSession(s){ await q(`INSERT INTO maa_sessions(token_hash, user_id, created, expires, agent) VALUES($1,$2,$3,$4,$5)`, [s.token_hash, s.user_id, s.created, s.expires, s.agent]); },
    async session(hash){ return (await q(`SELECT * FROM maa_sessions WHERE token_hash=$1`, [hash])).rows[0] || null; },
    async touchSession(hash, expires){ await q(`UPDATE maa_sessions SET expires=$2 WHERE token_hash=$1`, [hash, expires]); },
    async dropSession(hash){ await q(`DELETE FROM maa_sessions WHERE token_hash=$1`, [hash]); },
    async dropUserSessions(userId, exceptHash){ await q(`DELETE FROM maa_sessions WHERE user_id=$1 AND token_hash<>$2`, [userId, exceptHash || '']); },
    async docs(userId, since){
      const r = await q(`SELECT key, data, u, srv FROM maa_docs WHERE user_id=$1 AND srv>$2 ORDER BY key`, [userId, since || 0]);
      return r.rows.map(x => ({ key: x.key, data: x.data, u: Number(x.u), srv: Number(x.srv) }));
    },
    async doc(userId, key){
      const x = (await q(`SELECT key, data, u, srv FROM maa_docs WHERE user_id=$1 AND key=$2`, [userId, key])).rows[0];
      return x ? { key: x.key, data: x.data, u: Number(x.u), srv: Number(x.srv) } : null;
    },
    async usage(userId, exceptKey){ return Number((await q(`SELECT COALESCE(SUM(size),0) AS n FROM maa_docs WHERE user_id=$1 AND key<>$2`, [userId, exceptKey])).rows[0].n); },
    /* Last-writer-wins by the learner's own edit time: an older copy never overwrites a newer one. */
    async putDoc(userId, key, data, u, srv){
      const r = await q(`INSERT INTO maa_docs(user_id, key, data, u, srv, size) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(user_id, key) DO UPDATE SET data=EXCLUDED.data, u=EXCLUDED.u, srv=EXCLUDED.srv, size=EXCLUDED.size
        WHERE maa_docs.u <= EXCLUDED.u RETURNING srv`, [userId, key, data, u, srv, data ? Buffer.byteLength(data) : 0]);
      return r.rowCount > 0;
    },
    async ping(){ await q('SELECT 1'); },
    async stats(){ const r = await q(`SELECT (SELECT COUNT(*) FROM maa_users) AS users, (SELECT COUNT(*) FROM maa_docs WHERE data IS NOT NULL) AS docs`); return { users: Number(r.rows[0].users), docs: Number(r.rows[0].docs) }; },
  };
}

function fileStore(file){
  let db = { users: {}, sessions: {}, docs: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(_){}
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); } catch(e){ console.error('file store save failed', e.message); } }, 200); };
  const userDocs = id => (db.docs[id] = db.docs[id] || {});
  return {
    kind: 'temporary-file',
    async init(){},
    async createUser(u){ if(Object.values(db.users).some(x => x.login === u.login)) return false; db.users[u.id] = { ...u }; save(); return true; },
    async userByLogin(login){ return Object.values(db.users).find(x => x.login === login) || null; },
    async userById(id){ return db.users[id] || null; },
    async updateUser(id, f){ if(db.users[id]) Object.assign(db.users[id], f); save(); },
    async deleteUser(id){ delete db.users[id]; delete db.docs[id]; Object.keys(db.sessions).forEach(h => { if(db.sessions[h].user_id === id) delete db.sessions[h]; }); save(); },
    async addSession(s){ db.sessions[s.token_hash] = s; save(); },
    async session(h){ return db.sessions[h] || null; },
    async touchSession(h, expires){ if(db.sessions[h]) db.sessions[h].expires = expires; save(); },
    async dropSession(h){ delete db.sessions[h]; save(); },
    async dropUserSessions(id, except){ Object.keys(db.sessions).forEach(h => { if(db.sessions[h].user_id === id && h !== except) delete db.sessions[h]; }); save(); },
    async docs(id, since){ return Object.entries(userDocs(id)).filter(([, d]) => d.srv > (since || 0)).map(([key, d]) => ({ key, ...d })); },
    async doc(id, key){ const d = userDocs(id)[key]; return d ? { key, ...d } : null; },
    async usage(id, except){ return Object.entries(userDocs(id)).reduce((n, [k, d]) => n + (k === except ? 0 : (d.size || 0)), 0); },
    async putDoc(id, key, data, u, srv){ const cur = userDocs(id)[key]; if(cur && cur.u > u) return false; userDocs(id)[key] = { data, u, srv, size: data ? Buffer.byteLength(data) : 0 }; save(); return true; },
    async ping(){},
    async stats(){ return { users: Object.keys(db.users).length, docs: Object.values(db.docs).reduce((n, d) => n + Object.keys(d).length, 0) }; },
  };
}

/* ---------------- tiny helpers ---------------- */
function parseCookies(h){
  const out = {};
  String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if(i > 0){ const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch(_){} } });
  return out;
}
function limiter(windowMs, max, keyFn){
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for(const [k, v] of hits) if(v.reset <= now) hits.delete(k); }, 60000).unref();
  return {
    hit(key){ const now = Date.now(); let e = hits.get(key); if(!e || e.reset <= now){ e = { n: 0, reset: now + windowMs }; hits.set(key, e); } e.n++; return e; },
    blocked(key){ const e = hits.get(key); return !!(e && e.reset > Date.now() && e.n >= max); },
    clear(key){ hits.delete(key); },
    mw(){ return (req, res, next) => { const e = this.hit(keyFn(req)); if(e.n > max){ res.setHeader('Retry-After', String(Math.ceil((e.reset - Date.now()) / 1000))); return res.status(429).json({ error: 'rate_limited' }); } next(); }; },
  };
}

/* ---------------- the module ---------------- */
function createAccounts(){
  const url = process.env.DATABASE_URL || '';
  const store = url ? pgStore(url) : fileStore(path.join(__dirname, 'data', 'accounts.json'));
  let ready = null, readyErr = null;
  const init = () => {
    ready = store.init().then(() => { readyErr = null; console.log(`Accounts storage ready (${store.kind}).`); })
      .catch(e => { readyErr = e; console.error('Accounts storage failed to start:', e.message); ready = null; throw e; });
    return ready;
  };
  init().catch(() => {});
  if(!url) console.warn('⚠ DATABASE_URL is not set — learner accounts are stored in a TEMPORARY file. Set DATABASE_URL for permanent storage.');
  const whenReady = async () => { if(!ready) await init(); else await ready; };

  const signupLimit = limiter(60 * 60 * 1000, 20, req => req.ip);
  const loginIpLimit = limiter(15 * 60 * 1000, 60, req => req.ip);
  const failLimit = limiter(15 * 60 * 1000, 10, () => '');

  const cookieOpts = (req, maxAgeSec) => [`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=${maxAgeSec}`, req.secure ? 'Secure' : ''].filter(Boolean).join('; ');
  const setCookie = (req, res, token) => res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; ${cookieOpts(req, SESSION_DAYS * 86400)}`);
  const clearCookie = (req, res) => res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOpts(req, 0)}`);
  const publicUser = u => ({ id: u.id, name: u.name, login: u.login, email: u.login.includes('@') ? u.login : '', created: Number(u.created) });

  async function startSession(req, res, user){
    const token = newToken();
    const now = Date.now();
    await store.addSession({ token_hash: sha256(token), user_id: user.id, created: now, expires: now + SESSION_DAYS * 86400000, agent: String(req.get('user-agent') || '').slice(0, 200) });
    setCookie(req, res, token);
  }

  /* Attaches req.user when a valid login cookie is present. Never throws. */
  async function identify(req){
    if(req._userChecked) return req.user;
    req._userChecked = true;
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if(!token) return null;
    try {
      await whenReady();
      const h = sha256(token);
      const s = await store.session(h);
      if(!s || Number(s.expires) < Date.now()) return null;
      const u = await store.userById(s.user_id);
      if(!u) return null;
      // sliding expiry: an active learner stays logged in
      if(Number(s.expires) - Date.now() < (SESSION_DAYS - 7) * 86400000){
        store.touchSession(h, Date.now() + SESSION_DAYS * 86400000).catch(() => {});
        setCookie(req, req.res, token);
      }
      req.user = u; req.sessionHash = h;
      return u;
    } catch(e){ console.error('identify failed', e.message); req.storageDown = true; return null; }
  }
  const requireUser = async (req, res, next) => {
    const u = await identify(req);
    if(u) return next();
    if(req.storageDown) return res.status(503).json({ error: 'storage_unavailable' });
    return res.status(401).json({ error: 'not_logged_in' });
  };
  const sameSite = (req, res, next) => {
    if(['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if(req.get('x-requested-with') !== 'maa') return res.status(403).json({ error: 'bad_origin' });
    next();
  };
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(e => {
    console.error('accounts route error:', e && e.stack || e);
    if(!res.headersSent) res.status(e && /ECONN|timeout|terminat|ENOTFOUND/i.test(e.message || '') ? 503 : 500).json({ error: e && /ECONN|timeout|terminat|ENOTFOUND/i.test(e.message || '') ? 'storage_unavailable' : 'server_error' });
  });

  const router = express.Router();
  router.use(express.json({ limit: '12mb' }));
  router.use(sameSite);
  router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  /* ----- auth ----- */
  router.post('/auth/signup', signupLimit.mw(), wrap(async (req, res) => {
    await whenReady();
    const { name, login, password } = req.body || {};
    const L = normLogin(login), N = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if(!N) return res.status(400).json({ error: 'name_required' });
    if(!LOGIN_RE.test(L) || (L.includes('@') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(L))) return res.status(400).json({ error: 'bad_login' });
    if(typeof password !== 'string' || password.length < 6 || password.length > 200) return res.status(400).json({ error: 'weak_password' });
    const user = { id: newId(), login: L, name: N, pass: await hashPassword(password), created: Date.now() };
    if(!(await store.createUser(user))) return res.status(409).json({ error: 'login_taken' });
    await startSession(req, res, user);
    res.json({ user: publicUser(user) });
  }));

  router.post('/auth/login', loginIpLimit.mw(), wrap(async (req, res) => {
    await whenReady();
    const { login, password } = req.body || {};
    const L = normLogin(login);
    if(!L || typeof password !== 'string') return res.status(400).json({ error: 'missing_fields' });
    if(failLimit.blocked('f:' + L)) return res.status(429).json({ error: 'locked' });
    const u = await store.userByLogin(L);
    const ok = u ? await checkPassword(password, u.pass) : (await hashPassword('x'), false); // same timing either way
    if(!ok){ failLimit.hit('f:' + L); return res.status(401).json({ error: 'wrong_login' }); }
    failLimit.clear('f:' + L);
    await store.updateUser(u.id, { last_login: Date.now() });
    await startSession(req, res, u);
    res.json({ user: publicUser(u) });
  }));

  router.post('/auth/logout', wrap(async (req, res) => {
    await identify(req);
    if(req.sessionHash) await store.dropSession(req.sessionHash);
    clearCookie(req, res);
    res.json({ ok: true });
  }));

  router.get('/auth/me', wrap(async (req, res) => {
    const u = await identify(req);
    if(!u) return res.status(req.storageDown ? 503 : 401).json({ error: req.storageDown ? 'storage_unavailable' : 'not_logged_in' });
    res.json({ user: publicUser(u) });
  }));

  router.post('/auth/name', requireUser, wrap(async (req, res) => {
    const N = String((req.body || {}).name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if(!N) return res.status(400).json({ error: 'name_required' });
    await store.updateUser(req.user.id, { name: N });
    res.json({ user: publicUser({ ...req.user, name: N }) });
  }));

  router.post('/auth/password', requireUser, wrap(async (req, res) => {
    const { current, next } = req.body || {};
    if(!(await checkPassword(String(current || ''), req.user.pass))) return res.status(401).json({ error: 'wrong_password' });
    if(typeof next !== 'string' || next.length < 6 || next.length > 200) return res.status(400).json({ error: 'weak_password' });
    await store.updateUser(req.user.id, { pass: await hashPassword(next) });
    await store.dropUserSessions(req.user.id, req.sessionHash);   // log out every OTHER device
    res.json({ ok: true });
  }));

  router.post('/auth/logout-others', requireUser, wrap(async (req, res) => {
    await store.dropUserSessions(req.user.id, req.sessionHash);
    res.json({ ok: true });
  }));

  router.post('/auth/delete', requireUser, wrap(async (req, res) => {
    if(!(await checkPassword(String((req.body || {}).password || ''), req.user.pass))) return res.status(401).json({ error: 'wrong_password' });
    await store.deleteUser(req.user.id);
    clearCookie(req, res);
    res.json({ ok: true });
  }));

  /* ----- admin: reset a forgotten password (needs the ADMIN_KEY server secret) ----- */
  const adminLimit = limiter(60 * 60 * 1000, 20, req => req.ip);
  router.post('/admin/reset-password', adminLimit.mw(), wrap(async (req, res) => {
    const key = process.env.ADMIN_KEY || '';
    const given = String(req.get('x-admin-key') || '');
    if(key.length < 24 || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) return res.status(403).json({ error: 'forbidden' });
    const { login, password } = req.body || {};
    if(typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'weak_password' });
    const u = await store.userByLogin(normLogin(login));
    if(!u) return res.status(404).json({ error: 'no_such_user' });
    await store.updateUser(u.id, { pass: await hashPassword(password) });
    await store.dropUserSessions(u.id, '');
    res.json({ ok: true, login: u.login, name: u.name });
  }));
  router.get('/admin/stats', wrap(async (req, res) => {
    const key = process.env.ADMIN_KEY || '', given = String(req.get('x-admin-key') || '');
    if(key.length < 24 || given !== key) return res.status(403).json({ error: 'forbidden' });
    res.json({ storage: store.kind, ...(await store.stats()) });
  }));

  /* ----- private data: only ever the logged-in learner's own rows ----- */
  router.get('/data', requireUser, wrap(async (req, res) => {
    const since = Math.max(0, parseInt(req.query.since, 10) || 0);
    const now = Date.now();
    const docs = await store.docs(req.user.id, since);
    // Raw JSON strings are spliced in as-is: no parse/re-stringify of big lessons on the server.
    res.type('application/json').send(`{"now":${now},"docs":[${docs.map(d => `{"key":${JSON.stringify(d.key)},"u":${d.u},"srv":${d.srv},"data":${d.data == null ? 'null' : d.data}}`).join(',')}]}`);
  }));

  router.put('/data/:key', requireUser, wrap(async (req, res) => {
    const key = req.params.key;
    if(!KEY_RE.test(key)) return res.status(400).json({ error: 'bad_key' });
    const { u, data } = req.body || {};
    if(!Number.isFinite(u) || u <= 0) return res.status(400).json({ error: 'bad_version' });
    if(data === undefined || typeof data !== 'object') return res.status(400).json({ error: 'bad_data' });
    const str = JSON.stringify(data);
    const size = Buffer.byteLength(str);
    if(size > DOC_MAX_BYTES) return res.status(413).json({ error: 'doc_too_large' });
    if((await store.usage(req.user.id, key)) + size > USER_MAX_BYTES) return res.status(507).json({ error: 'quota_full' });
    const srv = Date.now();
    const ok = await store.putDoc(req.user.id, key, str, Math.min(u, srv + 5 * 60000), srv);
    if(!ok){ const cur = await store.doc(req.user.id, key); return res.status(409).json({ error: 'newer_exists', u: cur && cur.u }); }
    res.json({ ok: true, srv });
  }));

  router.delete('/data/:key', requireUser, wrap(async (req, res) => {
    const key = req.params.key;
    if(!KEY_RE.test(key)) return res.status(400).json({ error: 'bad_key' });
    const srv = Date.now();
    await store.putDoc(req.user.id, key, null, Math.max(srv, parseInt(req.query.u, 10) || 0), srv);  // tombstone, so other devices learn about the delete
    res.json({ ok: true, srv });
  }));

  return {
    router, identify, requireUser,
    kind: () => store.kind,
    async health(){ try { await whenReady(); await store.ping(); return { ok: true, kind: store.kind }; } catch(e){ return { ok: false, kind: store.kind, error: readyErr ? readyErr.message : e.message }; } },
    stats: () => store.stats(),
  };
}

module.exports = { createAccounts };
