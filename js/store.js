/* store.js — Data layer. Local-first (instant, offline) + private per-learner sync to the account (db). */
(function(){
  const LS_KEY = 'maa.v1';
  const blank = () => ({
    v: 1,
    profile: { name:'', email:'', level:'', subjects:[], language:'English', pref:'mixed', examDate:null, onboarded:false, voiceURI:null, created: Date.now() },
    topics: {}, mistakes: [], notes: [], research: [], labs: {}, projects: {}, formulas: [],
    coding: { solved:{}, drafts:{} }, exams: [], examPlan: { date:null, topicIds:[], extra:[] },
    deleted: [], meta: {}
  });

  const Store = window.Store = {
    state: blank(),
    sync: 'device',          // 'device' | 'account' | 'connecting'
    _db: null, _col: null, _dirty: new Set(), _writing: false,

    loadLocal(){
      try {
        const raw = localStorage.getItem(LS_KEY);
        if(raw){ const s = JSON.parse(raw); this.state = Object.assign(blank(), s); this.state.profile = Object.assign(blank().profile, s.profile || {}); }
      } catch(e){ /* storage blocked or corrupt → start fresh in memory */ }
    },

    saveLocal: M.debounce(function(){
      const s = Store.state;
      try { localStorage.setItem(LS_KEY, JSON.stringify(s)); }
      catch(e){
        // Quota: keep a lighter local copy (source texts stay in the account copy)
        try {
          const lite = JSON.parse(JSON.stringify(s));
          Object.values(lite.topics).forEach(t => { if(t.source) t.source.text = ''; if(t.scenes) t.scenes = null; });
          localStorage.setItem(LS_KEY, JSON.stringify(lite));
        } catch(_){}
      }
    }, 400),

    /* keys: 'profile' | 'mistakes' | 'notes' | 'research' | 't_<topicId>' */
    touch(key){
      this.state.meta[key] = Date.now();
      this.saveLocal();
      if(this.sync === 'account'){ this._dirty.add(key); this._flush(); }
      M.emit('store', key);
    },

    docFor(key){
      const s = this.state;
      if(key === 'profile') return { profile:s.profile, labs:s.labs, projects:s.projects, coding:s.coding, exams:s.exams.slice(-30), examPlan:s.examPlan, deleted:s.deleted.slice(-200) };
      if(key === 'mistakes') return { items: s.mistakes.slice(-400) };
      if(key === 'notes') return { items: s.notes };
      if(key === 'research') return { items: s.research.slice(-30) };
      if(key === 'formulas') return { items: s.formulas };
      if(key.startsWith('t_')){ const t = s.topics[key.slice(2)]; return t ? { topic: t } : null; }
      return null;
    },

    applyDoc(key, data){
      const s = this.state;
      if(key === 'profile'){ ['profile','labs','projects','coding','exams','examPlan','deleted'].forEach(k => { if(data[k] !== undefined) s[k] = data[k]; }); s.profile = Object.assign(blank().profile, s.profile); }
      else if(key === 'mistakes') s.mistakes = data.items || [];
      else if(key === 'notes') s.notes = data.items || [];
      else if(key === 'research') s.research = data.items || [];
      else if(key === 'formulas') s.formulas = data.items || [];
      else if(key.startsWith('t_') && data.topic){ if(!s.deleted.includes(data.topic.id)) s.topics[key.slice(2)] = data.topic; }
    },

    async connect(){
      if(!window.claude || !window.claude.use) return;
      this.sync = 'connecting'; M.emit('sync');
      try {
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        const uid = user && user.id ? await user.id() : null;
        if(!db || !uid){ this.sync = 'device'; M.emit('sync'); return; }
        this._db = db; this._col = db.collection('data/users/' + uid);
        const snap = await this._col.get();
        const remote = new Set();
        snap.docs.forEach(d => {
          if(!d.exists) return;
          const key = d.id, data = d.data(); remote.add(key);
          const rU = data._u || 0, lU = this.state.meta[key] || 0;
          if(rU > lU){ this.applyDoc(key, data); this.state.meta[key] = rU; }
          else if(lU > rU) this._dirty.add(key);
        });
        // local keys never pushed
        ['profile','mistakes','notes','research','formulas'].forEach(k => { if(!remote.has(k) && this.state.meta[k]) this._dirty.add(k); });
        Object.keys(this.state.topics).forEach(id => { if(!remote.has('t_' + id)) this._dirty.add('t_' + id); });
        // remote deletions
        this.state.deleted.forEach(id => { delete this.state.topics[id]; });
        this.sync = 'account'; this.saveLocal(); M.emit('sync'); M.emit('store', '*');
        this._flush();
      } catch(e){
        console.warn('Sync unavailable', e);
        this.sync = 'device'; M.emit('sync');
      }
    },

    _flush: M.debounce(async function(){
      if(Store._writing || !Store._col) return;
      Store._writing = true;
      try {
        while(Store._dirty.size){
          const key = Store._dirty.values().next().value; Store._dirty.delete(key);
          let body = Store.docFor(key);
          if(!body) continue;
          body = JSON.parse(JSON.stringify(body)); body._u = Store.state.meta[key] || Date.now();
          if(JSON.stringify(body).length > 240000 && body.topic){ if(body.topic.source) body.topic.source.text = (body.topic.source.text||'').slice(0, 60000); body.topic.scenes = null; }
          try { await Store._col.doc(key).set(body); }
          catch(e){
            if(e && (e.code === 'resource_exhausted' || e.code === 'unavailable')){ Store._dirty.add(key); setTimeout(() => Store._flush(), 5000 + Math.random()*3000); break; }
            if(e && (e.code === 'revoked' || e.code === 'not_granted')){ Store.sync = 'device'; M.emit('sync'); break; }
            console.warn('Sync write failed', key, e);
          }
        }
      } finally { Store._writing = false; }
    }, 1200),

    async removeTopic(id){
      delete this.state.topics[id];
      this.state.deleted.push(id);
      this.state.mistakes = this.state.mistakes.filter(m => m.topicId !== id);
      delete this.state.meta['t_' + id];
      this.touch('profile'); this.touch('mistakes');
      if(this._col){ try { await this._col.doc('t_' + id).delete(); } catch(_){} }
    },

    exportJSON(){ return JSON.stringify(this.state); },
    importJSON(text){
      const s = JSON.parse(text);
      if(!s || typeof s !== 'object' || !s.profile) throw new Error('This does not look like an academy backup.');
      this.state = Object.assign(blank(), s);
      const now = Date.now();
      ['profile','mistakes','notes','research','formulas'].forEach(k => this.state.meta[k] = now);
      Object.keys(this.state.topics).forEach(id => this.state.meta['t_' + id] = now);
      this.saveLocal();
      if(this.sync === 'account'){ Object.keys(this.state.meta).forEach(k => this._dirty.add(k)); this._flush(); }
      M.emit('store', '*');
    },
    resetAll(){
      const keys = Object.keys(this.state.meta);
      this.state = blank();
      try { localStorage.removeItem(LS_KEY); } catch(_){}
      if(this._col) keys.forEach(k => { this._col.doc(k).delete().catch(()=>{}); });
      M.emit('store', '*');
    },

    /* convenience */
    topic(id){ return this.state.topics[id]; },
    topicsList(){ return Object.values(this.state.topics).sort((a,b) => (b.lastActive||0) - (a.lastActive||0)); },
    saveTopic(t){ t.lastActive = Date.now(); this.state.topics[t.id] = t; this.touch('t_' + t.id); },
  };
})();
