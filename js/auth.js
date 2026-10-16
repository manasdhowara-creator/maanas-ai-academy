/* auth.js — the login / sign-up screen and the learner's session.
   Every learner has their own account. Their data is stored on the server under that account, so
   logging in on any phone or computer brings back everything. The last logged-in learner is
   remembered on this device so the app still opens offline; the server re-checks the login
   in the background and sends them back to this screen if it was ended elsewhere. */
(function(){
  const CACHE = 'maa.user';
  const Auth = window.Auth = { user: null, _started: false, _onReady: null };

  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch(_){ return null; } };
  const writeCache = u => { try { if(u) localStorage.setItem(CACHE, JSON.stringify(u)); else localStorage.removeItem(CACHE); } catch(_){} };

  /* fetch helper for every account / data call: same-site header, JSON, timeout, clear error codes */
  Auth.api = async (path, { method = 'GET', body, timeout = 60000, keepalive = false } = {}) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try {
      res = await fetch('/api' + path, {
        method, keepalive, credentials: 'same-origin', cache: 'no-store', signal: ctl.signal,
        headers: { 'X-Requested-With': 'maa', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch(e){ clearTimeout(t); const err = new Error('offline'); err.code = 'offline'; throw err; }
    clearTimeout(t);
    let data = null; try { data = await res.json(); } catch(_){}
    if(!res.ok){ const err = new Error((data && data.error) || ('http_' + res.status)); err.code = (data && data.error) || ('http_' + res.status); err.status = res.status; err.data = data; throw err; }
    return data;
  };

  const MSG = {
    name_required: 'Please enter your name.',
    bad_login: 'Use a valid email, or a username of 3+ letters/numbers (no spaces).',
    weak_password: 'Password must be at least 6 characters.',
    login_taken: 'An account with this email/username already exists. Log in instead.',
    wrong_login: 'Email/username or password is wrong.',
    locked: 'Too many wrong tries. Wait 15 minutes, then try again.',
    rate_limited: 'Too many attempts from this network. Wait a few minutes.',
    storage_unavailable: 'The server’s storage is waking up. Try again in a few seconds.',
    offline: 'No internet connection (or the server is waking up). Check your connection and try again.',
    wrong_password: 'Current password is wrong.',
  };
  Auth.msg = code => MSG[code] || 'Something went wrong. Please try again.';

  /* ---------- boot ---------- */
  Auth.boot = (onReady) => {
    Auth._onReady = onReady;
    const cached = readCache();
    if(cached && cached.id){ enter(cached, false); verify(); }
    else { showScreen('login'); silentResume(); }
  };

  // Cached login → app opens instantly; confirm with the server in the background.
  async function verify(){
    try { const r = await Auth.api('/auth/me', { timeout: 90000 }); Auth.user = r.user; writeCache(r.user); M.emit('auth'); }
    catch(e){ if(e.status === 401) Auth.expired(); /* offline / server asleep: keep working locally */ }
  }
  // No cached login but a cookie may still be valid (e.g. site data partly cleared).
  async function silentResume(){
    try { const r = await Auth.api('/auth/me', { timeout: 90000 }); if(r && r.user && !Auth.user) enter(r.user, true); } catch(_){}
  }

  function enter(user, fresh){
    Auth.user = user; writeCache(user);
    document.getElementById('auth').hidden = true;
    document.getElementById('app').hidden = false;
    if(!Auth._started){ Auth._started = true; Auth._onReady(user, fresh); }
    M.emit('auth');
  }

  Auth.expired = () => {
    if(!Auth.user) return;
    M.toast('Your login ended. Please log in again — your saved work is safe in your account.', 5000);
    Auth.logout(true);
  };

  Auth.logout = async (skipServer) => {
    if(!skipServer){
      const clean = await Store.flushNow(15000);
      if(!clean && !confirm('Some of your latest changes have not reached your account yet (no internet?). Log out anyway and lose them?')) return;
      try { await Auth.api('/auth/logout', { method: 'POST', timeout: 15000 }); } catch(_){}
    }
    Store.forgetDevice();
    writeCache(null);
    try { localStorage.removeItem('maa.lastPage'); } catch(_){}
    location.hash = '';
    location.reload();
  };

  /* ---------- the screen ---------- */
  function showScreen(mode){
    document.getElementById('app').hidden = true;
    const el = document.getElementById('auth'); el.hidden = false;
    paint(mode);
  }

  function paint(mode, err = '', vals = {}){
    const el = document.getElementById('auth');
    const signup = mode === 'signup';
    el.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-hero">
          <div class="brand"><span class="brand-mark" aria-hidden="true">M</span><span class="brand-text"><b>Maanas</b> AI Academy</span></div>
          <h1 class="auth-title">Learn it. Prove it.<br><span>Master it.</span></h1>
          <p class="auth-sub">Your personal AI teacher. Log in once and your lessons, tests, mistakes and notes follow you to every phone and computer.</p>
          <ul class="auth-points">
            <li>${M.icon.shield}<span>Your own private account — nobody else can see your data</span></li>
            <li>${M.icon.repeat}<span>Saved automatically to the cloud, every few seconds</span></li>
            <li>${M.icon.link}<span>Log in from any device and continue where you stopped</span></li>
          </ul>
        </div>
        <form class="auth-card" id="authForm" novalidate>
          <div class="auth-tabs" role="tablist">
            <button type="button" role="tab" class="auth-tab ${!signup ? 'on' : ''}" aria-selected="${!signup}" data-action="auth-mode" data-m="login">Log in</button>
            <button type="button" role="tab" class="auth-tab ${signup ? 'on' : ''}" aria-selected="${signup}" data-action="auth-mode" data-m="signup">Create account</button>
          </div>
          <h2>${signup ? 'Create your free account' : 'Welcome back'}</h2>
          ${signup ? `<div class="field"><label for="aName">Your name</label><input class="input" id="aName" autocomplete="name" maxlength="60" required value="${M.esc(vals.name || '')}" placeholder="e.g. Riya Sharma"></div>` : ''}
          <div class="field"><label for="aLogin">Email or username</label><input class="input" id="aLogin" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" maxlength="80" required value="${M.esc(vals.login || '')}" placeholder="you@gmail.com or riya_08"></div>
          <div class="field"><label for="aPass">Password</label>
            <div class="pass-row"><input class="input" id="aPass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" maxlength="200" required placeholder="${signup ? 'At least 6 characters' : 'Your password'}"><button type="button" class="btn sm ghost" data-action="auth-peek" aria-label="Show password">Show</button></div>
          </div>
          ${signup ? `<div class="field"><label for="aPass2">Confirm password</label><input class="input" id="aPass2" type="password" autocomplete="new-password" maxlength="200" required placeholder="Type it again"></div>` : ''}
          <div class="auth-err" id="authErr" role="alert" ${err ? '' : 'hidden'}>${M.esc(err)}</div>
          <button class="btn primary auth-submit" type="submit" id="authBtn">${signup ? 'Create account' : 'Log in'}</button>
          <p class="small muted auth-foot">${signup ? 'Already have an account? <a href="#" data-action="auth-mode" data-m="login">Log in</a>' : 'New here? <a href="#" data-action="auth-mode" data-m="signup">Create a free account</a>'}</p>
          ${!signup ? '<p class="small muted auth-foot">Forgot your password? Ask the academy admin (Maanas) to reset it — your data stays safe.</p>' : ''}
        </form>
      </div>`;
    el.querySelector('#authForm').addEventListener('submit', e => { e.preventDefault(); submit(signup ? 'signup' : 'login'); });
    setTimeout(() => { const f = el.querySelector(signup && !vals.name ? '#aName' : vals.login ? '#aPass' : '#aLogin'); if(f && matchMedia('(min-width: 700px)').matches) f.focus(); }, 30);
  }

  M.action('auth-mode', el => paint(el.dataset.m, '', { name: (document.getElementById('aName') || {}).value, login: (document.getElementById('aLogin') || {}).value }));
  M.action('auth-peek', el => { const p = document.getElementById('aPass'), p2 = document.getElementById('aPass2'); const show = p.type === 'password'; [p, p2].forEach(x => { if(x) x.type = show ? 'text' : 'password'; }); el.textContent = show ? 'Hide' : 'Show'; el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });

  let busy = false;
  async function submit(mode){
    if(busy) return;
    const v = id => (document.getElementById(id) || {}).value || '';
    const name = v('aName').trim(), login = v('aLogin').trim(), pass = v('aPass'), pass2 = v('aPass2');
    const fail = (m) => { const e = document.getElementById('authErr'); e.textContent = m; e.hidden = false; };
    if(mode === 'signup' && !name) return fail(MSG.name_required);
    if(!login) return fail('Please enter your email or username.');
    if(!pass) return fail('Please enter your password.');
    if(mode === 'signup' && pass.length < 6) return fail(MSG.weak_password);
    if(mode === 'signup' && pass !== pass2) return fail('The two passwords don’t match.');
    busy = true;
    const btn = document.getElementById('authBtn'); btn.disabled = true; btn.textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';
    const slow = setTimeout(() => { if(btn.isConnected) btn.textContent = 'Waking up the server… (can take up to a minute the first time)'; }, 4000);
    try {
      const r = await Auth.api('/auth/' + mode, { method: 'POST', body: mode === 'signup' ? { name, login, password: pass } : { login, password: pass }, timeout: 90000 });
      clearTimeout(slow);
      enter(r.user, true);
    } catch(e){
      clearTimeout(slow);
      paint(mode, Auth.msg(e.code), { name, login });
    } finally { busy = false; }
  }

  /* ---------- account actions (used by Settings + sidebar) ---------- */
  M.action('logout', () => Auth.logout());
  M.action('logout-others', async el => {
    el.disabled = true;
    try { await Auth.api('/auth/logout-others', { method: 'POST' }); M.toast('Logged out on all your other devices.'); }
    catch(e){ M.toast(Auth.msg(e.code)); }
    el.disabled = false;
  });
  M.action('change-password', async el => {
    const cur = document.getElementById('pwCur').value, nx = document.getElementById('pwNew').value;
    if(nx.length < 6) return M.toast(MSG.weak_password);
    el.disabled = true;
    try { await Auth.api('/auth/password', { method: 'POST', body: { current: cur, next: nx } }); M.toast('Password changed. Other devices were logged out.'); document.getElementById('pwCur').value = ''; document.getElementById('pwNew').value = ''; }
    catch(e){ M.toast(Auth.msg(e.code)); }
    el.disabled = false;
  });
  M.action('delete-account', async el => {
    const pw = document.getElementById('delPw').value;
    if(!pw) return M.toast('Type your password to confirm.');
    if(!confirm('Delete your account and ALL your study data permanently? This cannot be undone.')) return;
    el.disabled = true;
    try { await Auth.api('/auth/delete', { method: 'POST', body: { password: pw } }); Store.forgetDevice(); writeCache(null); location.hash = ''; location.reload(); }
    catch(e){ M.toast(Auth.msg(e.code)); el.disabled = false; }
  });
})();
