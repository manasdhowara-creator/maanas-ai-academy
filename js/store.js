/* store.js — Data layer.
   Local-first: every change is saved instantly in this browser (works offline) AND pushed a moment
   later to the learner's own account on the server (see accounts.js), so it follows them to any
   device. Each learner's local copy is stored under their own key, so two people sharing a phone
   never see each other's work.

   Documents (one row each on the server): 'profile' | 'mistakes' | 'notes' | 'research' | 'formulas'
   | 'session' (coach chat + test in progress) | 't_<topicId>' | 'lib_<bookId>'.
   Conflicts: newest edit wins, judged by when the learner made it (meta[key] timestamps). */
(function(){
  const LEGACY_KEY = 'maa.v1';
  const LIST_KEYS = ['mistakes','notes','research','formulas'];
  const blank = () => ({
    v: 1,
    profile: { name:'', email:'', level:'', subjects:[], language:'English', pref:'mixed', examDate:null, onboarded:false, voiceURI:null, created: Date.now() },
    topics: {}, mistakes: [], notes: [], research: [], labs: {}, projects: {}, formulas: [], library: [],
    coding: { solved:{}, drafts:{} }, exams: [], examPlan: { date:null, topicIds:[], extra:[] },
    coach: { turns: [], topicId: null }, examCur: null,
    deleted: [], meta: {}, pendingDel: [], lastPull: 0,
  });
  const merge = (s) => { const b = blank(); const out = Object.assign(b, s || {}); out.profile = Object.assign(blank().profile, (s && s.profile) || {}); if(!out.coach || !Array.isArray(out.coach.turns)) out.coach = { turns: [], topicId: null }; if(!Array.isArray(out.pendingDel)) out.pendingDel = []; if(!out.meta || typeof out.meta !== 'object') out.meta = {}; return out; };

  /* Old, partial or damaged lessons get the fields every screen relies on, so one bad record can never crash a screen. */
  const TOPIC_ARRAYS = ['concepts','attempts','asked','pendingFix','related'], TOPIC_OBJS = ['ev','conceptStats'];
  const fixTopic = (t, id) => {
    if(!t || typeof t !== 'object') return null;
    t.id = t.id || id; t.title = t.title || 'Untitled topic';
    TOPIC_ARRAYS.forEach(k => { if(!Array.isArray(t[k])) t[k] = []; });
    TOPIC_OBJS.forEach(k => { if(!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {}; });
    if(!t.lessonProgress || typeof t.lessonProgress !== 'object') t.lessonProgress = { started:false, checkpoints:{}, done:false };
    if(!t.lessonProgress.checkpoints) t.lessonProgress.checkpoints = {};
    return t;
  };
  const fixState = s => { Object.keys(s.topics || {}).forEach(id => { if(!fixTopic(s.topics[id], id)) delete s.topics[id]; }); ['mistakes','notes','research','formulas','library','exams','deleted'].forEach(k => { if(!Array.isArray(s[k])) s[k] = []; else s[k] = s[k].filter(x => x != null); }); if(!s.examPlan || typeof s.examPlan !== 'object') s.examPlan = { date:null, topicIds:[], extra:[] }; if(!Array.isArray(s.examPlan.topicIds)) s.examPlan.topicIds = []; if(!s.coding || typeof s.coding !== 'object') s.coding = { solved:{}, drafts:{} }; ['labs','projects'].forEach(k => { if(!s[k] || typeof s[k] !== 'object') s[k] = {}; }); return s; };

  const Store = window.Store = {
    state: blank(),
    sync: 'device',          // 'account' (all saved) | 'saving' | 'connecting' | 'offline' (will retry) | 'device'
    uid: null, _lsKey: null, _dirty: new Set(), _writing: false, _online: false, _retry: null, _pulling: false,

    /* ---------- local copy (per learner) ---------- */
    useUser(user){
      this.uid = user.id; this._lsKey = 'maa.v1.u.' + user.id;
      this.loadLocal();
      this._migrateLegacy();
      const p = this.state.profile;
      if(user.name && p.name !== user.name){ p.name = user.name; this.state.meta.profile = Math.max(this.state.meta.profile || 0, 1); }
      if(!p.email && user.email) p.email = user.email;
      this.saveLocal();
      M.emit('userdata');
    },
    loadLocal(){
      try { const raw = localStorage.getItem(this._lsKey); this.state = fixState(merge(raw ? JSON.parse(raw) : null)); }
      catch(e){ this.state = blank(); }
      (this.state.pendingDel || []).forEach(k => this._dirty.add(k));
    },
    /* Before accounts existed, everything lived under one shared key on this device. The first learner
       to log in on this device adopts it (keeping its real edit times), and it is then removed so the
       next person to use this phone does not inherit it. */
    _migrateLegacy(){
      let raw = null; try { raw = localStorage.getItem(LEGACY_KEY); } catch(_){}
      if(!raw) return;
      try {
        const old = fixState(merge(JSON.parse(raw))); const s = this.state;
        Object.entries(old.topics || {}).forEach(([id, t]) => { const k = 't_' + id; if(!s.topics[id] || (old.meta[k] || 0) > (s.meta[k] || 0)){ s.topics[id] = t; s.meta[k] = old.meta[k] || Date.now(); } });
        (old.library || []).forEach(b => { const k = 'lib_' + b.id; if(!s.library.some(x => x.id === b.id)){ s.library.push(b); s.meta[k] = old.meta[k] || Date.now(); } });
        LIST_KEYS.forEach(k => { const have = new Set(s[k].map(x => x && x.id)); old[k].forEach(x => { if(x && !have.has(x.id)) s[k].push(x); }); if(old[k].length) s.meta[k] = Math.max(s.meta[k] || 0, old.meta[k] || 0, 1); });
        if(!s.meta.profile || (old.meta.profile || 0) > (s.meta.profile || 0)){ ['profile','labs','projects','coding','exams','examPlan'].forEach(k => { s[k] = old[k]; }); s.profile = Object.assign(blank().profile, old.profile); s.meta.profile = old.meta.profile || Date.now(); }
        s.deleted = [...new Set([...(s.deleted || []), ...(old.deleted || [])])];
        try { const c = JSON.parse(localStorage.getItem('maa.coach') || 'null'); if(c && c.turns && c.turns.length && !s.coach.turns.length){ s.coach = { turns: c.turns, topicId: c.topicId || null }; s.meta.session = Date.now(); } } catch(_){}
        try { const x = JSON.parse(localStorage.getItem('maa.exam') || 'null'); if(x && !s.examCur){ s.examCur = x; s.meta.session = Date.now(); } } catch(_){}
        this._mergeLists = true;   // on the first sync, union these lists with the account's copy instead of replacing
      } catch(_){}
      try { localStorage.removeItem(LEGACY_KEY); localStorage.removeItem('maa.coach'); localStorage.removeItem('maa.exam'); } catch(_){}
    },
    saveLocal(){ clearTimeout(Store._saveT); Store._saveT = setTimeout(() => Store.saveLocalNow(), 400); },
    saveLocalNow(){
      clearTimeout(Store._saveT);
      const s = Store.state; if(!Store._lsKey) return;
      s.pendingDel = [...Store._dirty].filter(k => Store.docFor(k) === null);
      try { localStorage.setItem(Store._lsKey, JSON.stringify(s)); }
      catch(e){
        // Storage full: keep a lighter local copy (the full copy is safe in the account)
        try {
          const lite = JSON.parse(JSON.stringify(s));
          Object.values(lite.topics).forEach(t => { if(t.source) t.source.text = ''; if(t.scenes) t.scenes = null; });
          (lite.library || []).forEach(b => { b.pages = []; });
          localStorage.setItem(Store._lsKey, JSON.stringify(lite));
        } catch(_){}
      }
    },
    forgetDevice(){ clearTimeout(this._saveT); try { if(this._lsKey) localStorage.removeItem(this._lsKey); } catch(_){} this._dirty.clear(); this.state = blank(); this.uid = null; this._lsKey = null; },

    touch(key){
      this.state.meta[key] = Math.max(Date.now(), (this.state.meta[key] || 0) + 1);
      this._dirty.add(key);
      this.saveLocal();
      if(this.uid){ if(this.sync === 'account') this._setSync('saving'); this._flush(); }
      M.emit('store', key);
    },

    docFor(key){
      const s = this.state;
      if(key === 'profile') return { profile:s.profile, labs:s.labs, projects:s.projects, coding:s.coding, exams:s.exams.slice(-30), examPlan:s.examPlan, deleted:s.deleted.slice(-300) };
      if(key === 'mistakes') return { items: s.mistakes.slice(-400) };
      if(key === 'notes') return { items: s.notes };
      if(key === 'research') return { items: s.research.slice(-30) };
      if(key === 'formulas') return { items: s.formulas };
      if(key === 'session') return { coach: { turns: s.coach.turns.slice(-40), topicId: s.coach.topicId }, examCur: s.examCur };
      if(key.startsWith('t_')){ const t = s.topics[key.slice(2)]; return t ? { topic: t } : null; }
      if(key.startsWith('lib_')){ const b = s.library.find(x => x.id === key.slice(4)); return b ? { book: b } : null; }
      return undefined;   // unknown key: ignore
    },

    applyDoc(key, data){
      const s = this.state;
      if(key === 'profile'){ ['profile','labs','projects','coding','exams','examPlan','deleted'].forEach(k => { if(data[k] !== undefined && data[k] !== null) s[k] = data[k]; }); s.profile = Object.assign(blank().profile, s.profile); fixState(s); s.deleted.forEach(id => { delete s.topics[id]; }); }
      else if(LIST_KEYS.includes(key)){
        const remote = Array.isArray(data.items) ? data.items : [];
        if(this._mergeLists){ const ids = new Set(remote.map(x => x && x.id)); s[key] = remote.concat(s[key].filter(x => x && !ids.has(x.id))); this._dirty.add(key); }
        else s[key] = remote;
      }
      else if(key === 'session'){ if(data.coach && Array.isArray(data.coach.turns)) s.coach = data.coach; s.examCur = data.examCur || null; }
      else if(key.startsWith('t_') && data.topic){ if(!s.deleted.includes(data.topic.id)) s.topics[key.slice(2)] = fixTopic(data.topic, key.slice(2)); }
      else if(key.startsWith('lib_') && data.book){ const i = s.library.findIndex(x => x.id === data.book.id); if(i >= 0) s.library[i] = data.book; else s.library.push(data.book); }
    },
    _applyDelete(key){
      const s = this.state;
      if(key.startsWith('t_')) delete s.topics[key.slice(2)];
      else if(key.startsWith('lib_')) s.library = s.library.filter(b => b.id !== key.slice(4));
    },

    _setSync(v){ if(this.sync !== v){ this.sync = v; M.emit('sync'); } },

    /* ---------- pull from the account ---------- */
    async connect(){
      if(!this.uid) return;
      this._setSync('connecting');
      const ok = await this.pull(true);
      if(ok){ this._mergeLists = false; this._startTimers(); }
      this._flush();
    },
    async pull(full){
      if(this._pulling || !this.uid) return false;
      this._pulling = true;
      const uid = this.uid;
      try {
        const since = full ? 0 : (this.state.lastPull || 0);
        const r = await Auth.api('/data' + (since ? '?since=' + since : ''), { timeout: 90000 });
        if(uid !== this.uid) return false;
        let changed = false; const remote = new Set();
        (r.docs || []).forEach(d => {
          remote.add(d.key);
          const lU = this.state.meta[d.key] || 0;
          if(d.data === null){                                  // deleted on another device
            if(d.u >= lU && this.docFor(d.key) !== undefined){ this._applyDelete(d.key); delete this.state.meta[d.key]; this._dirty.delete(d.key); changed = true; }
            return;
          }
          if(d.u > lU && !(this._dirty.has(d.key) && this.docFor(d.key) === null)){ this.applyDoc(d.key, d.data); this.state.meta[d.key] = d.u; this._dirty.delete(d.key); changed = true; }
          else if(lU > d.u) this._dirty.add(d.key);
        });
        if(full){
          // anything this device has that the account has never seen → upload it
          Object.keys(this.state.meta).forEach(k => { if(!remote.has(k) && this.docFor(k)) this._dirty.add(k); });
          Object.keys(this.state.topics).forEach(id => { if(!remote.has('t_' + id)){ this._dirty.add('t_' + id); this.state.meta['t_' + id] = this.state.meta['t_' + id] || Date.now(); } });
          this.state.library.forEach(b => { if(!remote.has('lib_' + b.id)){ this._dirty.add('lib_' + b.id); this.state.meta['lib_' + b.id] = this.state.meta['lib_' + b.id] || Date.now(); } });
        }
        this.state.lastPull = r.now - 2000;   // small overlap so nothing slips between two pulls
        this._online = true;
        this.saveLocal();
        this._setSync(this._dirty.size ? 'saving' : 'account');
        if(changed){ M.emit('userdata'); M.emit('store', '*'); }
        return true;
      } catch(e){
        if(e.status === 401){ Auth.expired(); return false; }
        this._online = false; this._setSync('offline'); this._scheduleRetry();
        return false;
      } finally { this._pulling = false; }
    },
    _startTimers(){
      if(this._timers) return; this._timers = true;
      const refresh = () => { if(document.visibilityState === 'visible') this.pull(false).then(() => this._flush()); };
      document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') refresh(); else { this.saveLocalNow(); this.flushNow(4000, true); } });
      window.addEventListener('online', () => { this.pull(false).then(() => this._flush()); });
      window.addEventListener('pagehide', () => { this.saveLocalNow(); this.flushNow(3000, true); });
      setInterval(refresh, 90 * 1000);   // pick up work done on another device
    },
    _scheduleRetry(){
      clearTimeout(this._retry);
      this._backoff = Math.min((this._backoff || 4000) * 1.6, 60000);
      this._retry = setTimeout(() => { if(!this._online) this.pull(!this.state.lastPull).then(() => this._flush()); else this._flush(); }, this._backoff + Math.random() * 1500);
    },

    /* ---------- push to the account ---------- */
    _flush: M.debounce(() => Store._push(), 1200),
    async _push(keepalive){
      if(this._writing || !this.uid || !this._dirty.size) { if(!this._dirty.size && this.uid && this._online) this._setSync('account'); return; }
      if(!this._online && !keepalive){ return this._scheduleRetry(); }
      this._writing = true;
      const uid = this.uid;
      try {
        for(const key of [...this._dirty]){
          if(uid !== this.uid) return;
          let body = this.docFor(key);
          if(body === undefined){ this._dirty.delete(key); continue; }
          const u = this.state.meta[key] || Date.now();
          try {
            if(body === null){
              await Auth.api('/data/' + encodeURIComponent(key) + '?u=' + Date.now(), { method: 'DELETE', keepalive, timeout: 30000 });
            } else {
              body = JSON.parse(JSON.stringify(body));
              if(keepalive && JSON.stringify(body).length > 60000) continue;   // browsers cap keepalive bodies; it will go next time
              await Auth.api('/data/' + encodeURIComponent(key), { method: 'PUT', body: { u, data: body }, keepalive, timeout: 60000 });
            }
            if((this.state.meta[key] || 0) <= u) this._dirty.delete(key);     // not edited again meanwhile
          } catch(e){
            if(e.status === 401){ Auth.expired(); return; }
            if(e.code === 'newer_exists'){ this._dirty.delete(key); this.pull(false); continue; }
            if(e.code === 'doc_too_large' && body && body.topic){ const t = this.state.topics[key.slice(2)]; if(t){ if(t.source) t.source.text = (t.source.text || '').slice(0, 200000); t.scenes = null; } continue; }
            if(e.code === 'doc_too_large' && body && body.book){ M.toast('This book is too big to save to your account. It stays on this device only.'); this._dirty.delete(key); continue; }
            if(e.code === 'quota_full'){ M.toast('Your account storage is full. Delete some old books or lessons.'); break; }
            if(e.status === 400){ this._dirty.delete(key); continue; }
            this._online = false; this._setSync('offline'); this._scheduleRetry(); return;   // offline / server asleep
          }
        }
        this._backoff = 0;
        this.saveLocal();
        this._setSync(this._dirty.size ? 'saving' : 'account');
        if(this._dirty.size) this._flush();
      } finally { this._writing = false; }
    },
    /* Push everything now. Resolves true when nothing is left unsaved. */
    async flushNow(maxMs = 15000, keepalive = false){
      if(!this.uid) return true;
      const end = Date.now() + maxMs;
      if(!this._online && !keepalive) await this.pull(!this.state.lastPull);
      while(this._dirty.size && Date.now() < end){
        if(this._writing){ await new Promise(r => setTimeout(r, 150)); continue; }
        const before = this._dirty.size;
        await this._push(keepalive);
        if(keepalive || (!this._online) || this._dirty.size >= before) break;
      }
      return this._dirty.size === 0;
    },

    /* ---------- library / topics ---------- */
    saveLibraryBook(book){
      book.updatedAt = Date.now();
      const i = this.state.library.findIndex(b => b.id === book.id);
      if(i >= 0) this.state.library[i] = book; else this.state.library.push(book);
      this.touch('lib_' + book.id);
    },
    removeLibraryBook(id){
      this.state.library = this.state.library.filter(b => b.id !== id);
      this.touch('lib_' + id);     // docFor → null → deleted on the account too
    },
    removeTopic(id){
      delete this.state.topics[id];
      if(!this.state.deleted.includes(id)) this.state.deleted.push(id);
      this.state.mistakes = this.state.mistakes.filter(m => m.topicId !== id);
      if(this.state.coach.topicId === id){ this.state.coach = { turns: [], topicId: null }; this.touch('session'); }
      this.touch('t_' + id); this.touch('profile'); this.touch('mistakes');
    },

    exportJSON(){ const s = JSON.parse(JSON.stringify(this.state)); delete s.pendingDel; delete s.lastPull; return JSON.stringify(s); },
    importJSON(text){
      const s = JSON.parse(text);
      if(!s || typeof s !== 'object' || !s.profile) throw new Error('This does not look like an academy backup.');
      const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
      if(s.topics !== undefined && !isMap(s.topics)) throw new Error('This backup file is damaged (lessons are unreadable).');
      ['mistakes','notes','research','formulas','library','exams','deleted'].forEach(k => { if(s[k] !== undefined && !Array.isArray(s[k])) throw new Error('This backup file is damaged (' + k + ' is unreadable).'); });
      const lastPull = this.state.lastPull;
      this.state = fixState(merge(s)); this.state.lastPull = lastPull; this.state.pendingDel = [];
      const now = Date.now();
      ['profile','mistakes','notes','research','formulas','session'].forEach(k => { this.state.meta[k] = now; this._dirty.add(k); });
      Object.keys(this.state.topics).forEach(id => { this.state.meta['t_' + id] = now; this._dirty.add('t_' + id); });
      (this.state.library || []).forEach(b => { this.state.meta['lib_' + b.id] = now; this._dirty.add('lib_' + b.id); });
      this.saveLocal(); this._flush();
      M.emit('userdata'); M.emit('store', '*');
    },
    resetAll(){
      const keys = new Set([...Object.keys(this.state.meta), ...Object.keys(this.state.topics).map(id => 't_' + id), ...this.state.library.map(b => 'lib_' + b.id)]);
      const lastPull = this.state.lastPull;
      this.state = blank(); this.state.lastPull = lastPull;
      const p = this.state.profile; if(Auth.user){ p.name = Auth.user.name; p.email = Auth.user.email || ''; }
      const now = Date.now();
      keys.forEach(k => { if(!k.startsWith('t_') && !k.startsWith('lib_')){ this.state.meta[k] = now; } this._dirty.add(k); });
      ['profile','mistakes','notes','research','formulas','session'].forEach(k => { this.state.meta[k] = now; this._dirty.add(k); });
      this.saveLocal(); this._flush();
      M.emit('userdata'); M.emit('store', '*');
    },

    /* convenience */
    topic(id){ return this.state.topics[id]; },
    topicsList(){ return Object.values(this.state.topics).sort((a,b) => (b.lastActive||0) - (a.lastActive||0)); },
    saveTopic(t){ fixTopic(t, t.id); t.lastActive = Date.now(); this.state.topics[t.id] = t; this.touch('t_' + t.id); },
  };
})();
/* Never lose the last second of work: write the local copy the moment the page is hidden or closed
   (works even when offline, before any account sync has started). */
window.addEventListener('pagehide', () => Store.saveLocalNow());
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') Store.saveLocalNow(); });
