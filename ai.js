/* ai.js — the one gateway to Claude (via the artifact's `sample` capability, on the learner's own Claude plan).
   No API keys, no paid services. If unavailable, callers get a clear error and offline features keep working. */
(function(){
  const AI = window.AI = {
    fn: null, status: 'checking', limits: null,

    async init(){
      try {
        if(!window.claude || !window.claude.use){ this.status = 'off'; M.emit('ai'); return; }
        this.fn = await window.claude.use('sample');
        this.status = this.fn ? 'on' : 'off';
        if(this.fn && this.fn.limits) this.limits = await this.fn.limits().catch(() => null);
      } catch(e){ this.status = 'off'; }
      M.emit('ai');
    },

    ready(){ return !!this.fn && this.status === 'on'; },
    canSeeImages(){ return !!(this.limits && this.limits.images); },

    friendly(code){
      return ({
        not_granted: 'The AI teacher needs your permission. Allow it when Claude asks, then reload the page.',
        sampling_disabled: 'Claude is not available for this account, so AI features are switched off.',
        rate_limited: 'Claude is busy or your usage limit was reached. Wait a minute, then try again.',
        session_expired: 'Your Claude session expired. Sign in again, then try again.',
        refused: 'Claude declined this request. Rephrase it and try again.',
        empty_completion: 'Claude returned an empty answer. Try again, maybe with a simpler request.',
        invalid_json: 'The AI answer came back in the wrong format. Try again.',
        prompt_too_large: 'That is too much text for one request. Use a shorter source or a smaller chapter.',
        images_unavailable: 'This view cannot send images to Claude.',
        image_rejected: 'That image could not be read. Try a different file.',
        cancelled: 'Stopped.',
        offline: 'The AI teacher is not available here. Open this page inside Claude to switch it on.',
      })[code] || 'The AI teacher could not answer (network or service problem). Try again.';
    },

    _err(e){
      const code = (e && e.code) || 'upstream_error';
      if(['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(code)){ this.status = code === 'not_granted' ? 'denied' : 'off'; M.emit('ai'); }
      const err = new Error(this.friendly(code)); err.code = code; err.partial = e && e.text; return err;
    },

    /* Ask for structured data. opts: {tier, signal, peek: element to show streaming progress, images} */
    async json(prompt, opts = {}){
      if(!this.ready()) throw this._err({code:'offline'});
      const o = { modelTier: opts.tier || 'default' };
      if(opts.signal) o.signal = opts.signal;
      if(opts.images) o.images = opts.images;
      if(opts.nocache) o.cache = false;
      if(opts.peek) o.onText = ({text}) => { const el = typeof opts.peek === 'function' ? opts.peek() : opts.peek; if(el) el.textContent = '… ' + text.slice(-160); };
      try { return await this.fn.json(prompt, o); }
      catch(e){ throw this._err(e); }
    },

    /* Free text. input: string or turns. opts: {tier, signal, onText, cache} */
    async text(input, opts = {}){
      if(!this.ready()) throw this._err({code:'offline'});
      const o = { modelTier: opts.tier || 'default' };
      if(opts.signal) o.signal = opts.signal;
      if(opts.onText) o.onText = opts.onText;
      if(opts.cache !== undefined) o.cache = opts.cache;
      if(opts.images) o.images = opts.images;
      try { return (await this.fn(input, o)).text; }
      catch(e){ throw this._err(e); }
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
