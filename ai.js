/* ai.js — the one gateway to AI on the standalone site. Calls this server's own
   /api/ai endpoint, which holds the real Gemini API key server-side and proxies to
   Google's free-tier Gemini API. No key ever reaches the browser. If the backend is
   unreachable or has no key configured, callers get a clear error and offline
   features (built-in lessons, coding lab, revision, notes) keep working. */
(function(){
  const AI = window.AI = {
    status: 'checking', limits: null,

    async init(){
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if(!r.ok){ this.status = 'off'; M.emit('ai'); return; }
        const data = await r.json();
        this.status = data.ok ? 'on' : 'off';
      } catch(e){ this.status = 'off'; }
      M.emit('ai');
    },

    ready(){ return this.status === 'on'; },
    canSeeImages(){ return true; },

    friendly(code){
      return ({
        no_api_key: 'The AI teacher is not configured on this server yet.',
        sampling_disabled: 'AI features are switched off for this deployment.',
        rate_limited: 'The AI teacher is busy or the free usage limit was reached. Wait a minute, then try again.',
        refused: 'The AI teacher declined this request. Rephrase it and try again.',
        empty_completion: 'The AI teacher returned an empty answer. Try again, maybe with a simpler request.',
        invalid_json: 'The AI answer came back in the wrong format. Try again.',
        prompt_too_large: 'That is too much text for one request. Use a shorter source or a smaller chapter.',
        images_unavailable: 'This view cannot send images to the AI teacher.',
        image_rejected: 'That image could not be read. Try a different file.',
        cancelled: 'Stopped.',
        offline: 'The AI teacher is not available right now.',
      })[code] || 'The AI teacher could not answer (network or service problem). Try again.';
    },

    _err(code, partial){
      if(['no_api_key','sampling_disabled'].includes(code)) this.status = 'off';
      const err = new Error(this.friendly(code)); err.code = code; err.partial = partial; return err;
    },

    async _blobToBase64(blob){
      const buf = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for(let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { data: btoa(binary), mime: blob.type || 'image/jpeg' };
    },

    async _call(input, opts, wantJson){
      if(!this.ready()) throw this._err('offline');
      const body = { input, json: !!wantJson };
      if(opts.images && opts.images.length) body.images = await Promise.all(opts.images.map(b => this._blobToBase64(b)));
      if(opts.peek){ const el = typeof opts.peek === 'function' ? opts.peek() : opts.peek; if(el) el.textContent = '… thinking'; }
      let res;
      try {
        res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: opts.signal,
        });
      } catch(e){
        if(e.name === 'AbortError') throw this._err('cancelled');
        throw this._err('offline');
      }
      if(!res.ok){
        let payload = {};
        try { payload = await res.json(); } catch(_){}
        let code = 'upstream_error';
        if(res.status === 429) code = 'rate_limited';
        else if(res.status === 400) code = payload.error === 'invalid_json' ? 'invalid_json' : 'refused';
        else if(res.status === 503) code = 'no_api_key';
        else if(payload.error) code = payload.error;
        throw this._err(code);
      }
      return res.json();
    },

    /* Ask for structured data. opts: {tier, signal, peek, images} */
    async json(prompt, opts = {}){
      const data = await this._call(prompt, opts, true);
      if(data.parsed === undefined) throw this._err('invalid_json');
      return data.parsed;
    },

    /* Free text. input: string or turns [{role, content}]. opts: {tier, signal, onText, images} */
    async text(input, opts = {}){
      const data = await this._call(input, opts, false);
      if(opts.onText) opts.onText({ text: data.text });
      return data.text;
    },

    /* ---------- prompt context builders (personalization) ---------- */
    langRule(lang){
      lang = lang || Store.state.profile.language || 'English';
      if(lang === 'Easy English') return 'LANGUAGE: very simple English — short sentences, everyday words; explain any hard word in brackets.';
      if(lang === 'Hinglish') return 'LANGUAGE: Hinglish — natural Hindi-English mix in Roman script (e.g. "Force ek push ya pull hota hai"). Keep technical terms in English.';
      return 'LANGUAGE: clear, standard English.';
    },
    learner(topic){
      const p = Store.state.profile;
      const level = (topic && topic.level) || p.level || 'unknown (assume a curious beginner teen)';
      const lines = [
        `LEARNER: ${p.name || 'the learner'}; level: ${level}; prefers: ${prefText(p.pref)}.`,
        'If this is a school topic, align with NCERT/CBSE conventions for that class unless told otherwise.',
        this.langRule(),
      ];
      if(topic){
        const weak = Mastery.weakConcepts(topic).slice(0, 4).map(c => c.name);
        if(weak.length) lines.push('WEAK CONCEPTS (from past answers): ' + weak.join('; ') + '.');
        const errs = Mastery.topErrorTypes(topic.id).slice(0, 3).map(e => e[0]);
        if(errs.length) lines.push('COMMON ERROR TYPES: ' + errs.join(', ') + '.');
      }
      return lines.join('\n');
    },
  };
  function prefText(p){ return ({ visual:'visual explanations and diagrams', examples:'real-life examples', steps:'step-by-step worked solutions', mixed:'a mix of explanation, visuals and examples' })[p] || 'a mix of explanation, visuals and examples'; }
})();
