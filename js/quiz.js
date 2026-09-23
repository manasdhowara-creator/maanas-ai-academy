/* quiz.js — Question Engine: generation (fresh, non-repeating), validation, rendering, grading (objective + subjective). */
(function(){
  const ASSERTION_OPTS = ['Both A and R are true, and R correctly explains A','Both A and R are true, but R does not explain A','A is true, but R is false','A is false, but R is true'];
  const WRITTEN = ['short','long','case','application','data','diagram','explain','challenge','teachback'];
  const TYPE_LABEL = { mcq:'Multiple choice', tf:'True / False', assertion:'Assertion–Reason', fill:'Fill in the blank', numerical:'Numerical', short:'Short answer', long:'Long answer', case:'Case-based', application:'Application', data:'Data-based', diagram:'Diagram-based', explain:'Explain', challenge:'Unfamiliar challenge' };

  const SCHEMA = `Return ONLY JSON: {"questions":[Q, ...]}
Q = {
 "type": "mcq"|"tf"|"assertion"|"fill"|"numerical"|"short"|"long"|"case"|"application"|"data"|"diagram",
 "difficulty": "easy"|"medium"|"hard"|"very hard"|"unfamiliar",
 "concept": "<concept id from the list>",
 "stem": "the question — clear and unambiguous. Make it hard through reasoning, never through confusing wording. For assertion put 'Assertion (A): … Reason (R): …'. For fill use ____ for the blank.",
 "context": "optional markdown: case passage, or a small markdown table for data questions (required for case/data)",
 "visual": optional diagram object for diagram questions (VISUAL SPEC below),
 "options": mcq: exactly 4 distinct strings; tf: ["True","False"]; assertion: omit,
 "answer": mcq/tf: 0-based index of the correct option; assertion: 0=both true & R explains A, 1=both true but R doesn't explain, 2=A true R false, 3=A false R true; fill: exact word/phrase; numerical: a number,
 "accept": ["other acceptable fill answers"],
 "unit": "numerical unit, optional", "tolerance": 0.02,
 "optionNotes": ["one short note per option: why right / why wrong"],
 "trapOptions": [indices of options that reflect a common misconception],
 "modelAnswer": "for written types: an ideal answer at the learner's level",
 "keyPoints": ["2-5 essential points a correct answer must contain"],
 "explanation": "1-3 sentences: why the correct answer is correct"
}
Use plain Unicode for maths (×, ÷, ², √, π, →). No LaTeX.`;

  const Quiz = window.Quiz = {
    TYPE_LABEL, WRITTEN, SCHEMA,
    isWritten(q){ return WRITTEN.includes(q.type); },

    conceptList(t){ return (t.concepts || []).map(c => `${c.id}: ${c.name}`).join('\n'); },

    /* spec: {count, stage, difficulty:[], types:[], concepts:[ids], note, related:[topics], source:true} */
    async generate(t, spec, opts = {}){
      const avoid = t.asked.slice(-25).map(s => '- ' + s.slice(0, 120)).join('\n');
      const conceptFocus = spec.concepts && spec.concepts.length ? `Focus on concepts: ${spec.concepts.join(', ')}.` : 'Spread across the concepts.';
      const rel = spec.related && spec.related.length ? `CUMULATIVE: make ${spec.related.length > 1 ? 'one or two questions' : 'one question'} connect this topic with previously mastered topic(s): ${spec.related.map(r => r.title).join('; ')} (use concept id "${t.concepts[0] ? t.concepts[0].id : 'c1'}" for those).` : '';
      const src = t.source && t.source.text ? `\nSOURCE (authoritative for source-specific facts; questions must be answerable from it or from standard knowledge at this level):\n"""${t.source.text.slice(0, 14000)}"""\n` : '';
      const prompt = `You are an expert examiner writing FRESH questions for a mastery-learning app.
${AI.learner(t)}
TOPIC: ${t.title} (${t.subject})
CONCEPTS:
${this.conceptList(t)}
${src}
WRITE ${spec.count} question(s) for the "${spec.stage}" stage.
Allowed types (use a mix, in this priority): ${spec.types.join(', ')}.
Difficulty: ${spec.difficulty.join(' / ')}.
${conceptFocus}
${spec.note || ''}
${rel}
Every question must test understanding, reasoning or application — not trivia. Do not repeat or lightly reword any of these already-asked questions:
${avoid || '- (none yet)'}
The question text itself must be in the learner's language setting.

${SCHEMA}

VISUAL SPEC (only if a diagram truly helps): ${window.Visuals ? Visuals.SPEC_SHORT : ''}`;
      const data = await AI.json(prompt, { tier: opts.tier || 'default', peek: opts.peek, signal: opts.signal });
      const list = Array.isArray(data) ? data : (data && data.questions) || [];
      const out = [];
      list.forEach(q => { const v = this.validate(q, t, out); if(v) out.push(v); });
      if(!out.length) { const e = new Error('The questions that came back failed the quality check. Try again.'); e.code = 'qc'; throw e; }
      return out;
    },

    /* Quality control for one question. Returns a clean question or null. */
    validate(q, t, batch = []){
      if(!q || typeof q !== 'object' || !q.stem) return null;
      let type = String(q.type || '').toLowerCase().replace(/[^a-z]/g,'');
      type = ({ multiplechoice:'mcq', truefalse:'tf', trueorfalse:'tf', assertionreason:'assertion', fillintheblank:'fill', fillblank:'fill', number:'numerical', calculation:'numerical', shortanswer:'short', longanswer:'long', casebased:'case', databased:'data', diagrambased:'diagram', conceptual:'short', explanation:'short', multistep:'long' })[type] || type;
      const c = { ...q, type, id: M.uid('q'), stem: String(q.stem).trim(), difficulty: ['easy','medium','hard','very hard','unfamiliar'].includes(q.difficulty) ? q.difficulty : 'medium' };
      if(type === 'mcq'){
        if(!Array.isArray(q.options) || q.options.length < 3) return null;
        c.options = q.options.map(o => String(o).trim()).slice(0, 5);
        if(new Set(c.options.map(o => M.norm(o))).size !== c.options.length) return null;
        let a = q.answer;
        if(typeof a === 'string' && !/^\d+$/.test(a)){ const i = c.options.findIndex(o => M.norm(o) === M.norm(a)); a = i; }
        a = Number(a); if(!Number.isInteger(a) || a < 0 || a >= c.options.length) return null;
        c.answer = a;
      } else if(type === 'tf'){
        c.options = ['True','False'];
        let a = q.answer; if(typeof a === 'boolean') a = a ? 0 : 1; if(typeof a === 'string') a = /^t/i.test(a) ? 0 : /^f/i.test(a) ? 1 : Number(a);
        if(a !== 0 && a !== 1) return null; c.answer = a;
      } else if(type === 'assertion'){
        c.options = ASSERTION_OPTS; const a = Number(q.answer); if(!Number.isInteger(a) || a < 0 || a > 3) return null; c.answer = a;
      } else if(type === 'fill'){
        if(q.answer === undefined || q.answer === null || !String(q.answer).trim()) return null;
        c.answer = String(q.answer).trim(); c.accept = Array.isArray(q.accept) ? q.accept.map(String) : [];
      } else if(type === 'numerical'){
        const n = parseFloat(String(q.answer).replace(/,/g,'')); if(!isFinite(n)) return null; c.answer = n;
        c.tolerance = Number(q.tolerance) > 0 && Number(q.tolerance) < 0.2 ? Number(q.tolerance) : 0.02;
      } else if(WRITTEN.includes(type)){
        if(!(Array.isArray(q.keyPoints) && q.keyPoints.length) && !q.modelAnswer) return null;
        c.keyPoints = Array.isArray(q.keyPoints) ? q.keyPoints.map(String).slice(0, 6) : [];
        if((type === 'case' || type === 'data') && !q.context) c.type = 'short';
      } else return null;
      // concept must exist
      const ids = (t.concepts || []).map(x => x.id);
      if(!ids.includes(c.concept)){
        const byName = (t.concepts || []).map(x => [x.id, M.similarity(x.name, (q.concept || '') + ' ' + c.stem)]).sort((a,b) => b[1] - a[1])[0];
        c.concept = byName ? byName[0] : (ids[0] || 'c1');
      }
      // no repeats (against history and this batch)
      const prior = t.asked.concat(batch.map(b => b.stem));
      if(prior.some(s => M.similarity(s, c.stem) > 0.72)) return null;
      if(c.visual && !(window.Visuals && Visuals.valid(c.visual))) delete c.visual;
      return c;
    },

    answerText(q){
      if(!q) return '';
      if(['mcq','tf','assertion'].includes(q.type)) return q.options ? q.options[q.answer] : '';
      if(q.type === 'fill') return String(q.answer);
      if(q.type === 'numerical') return `${q.answer}${q.unit ? ' ' + q.unit : ''}`;
      return q.modelAnswer || (q.keyPoints || []).join('; ');
    },

    /* ---------- rendering ---------- */
    stemHTML(q, { dark=false } = {}){
      const meta = `<div class="q-meta"><span class="tag">${M.esc(TYPE_LABEL[q.type] || q.type)}</span><span class="tag ${q.difficulty === 'hard' || q.difficulty === 'very hard' || q.difficulty === 'unfamiliar' ? 'warn' : ''}">${M.esc(M.cap(q.difficulty))}</span></div>`;
      const ctx = q.context ? `<div class="q-context prose">${M.md(q.context)}</div>` : '';
      const vis = q.visual && window.Visuals ? `<div class="q-context" style="padding:6px">${Visuals.render(q.visual, { light: !dark })}</div>` : '';
      return `<div class="q" data-qid="${q.id}">${meta}<div class="q-stem">${M.esc(q.stem)}</div>${ctx}${vis}</div>`;
    },
    render(q, { idx, total, dark=false, locked=false, chosen } = {}){
      const meta = `<div class="q-meta"><span class="tag">${M.esc(TYPE_LABEL[q.type] || q.type)}</span><span class="tag ${q.difficulty === 'hard' || q.difficulty === 'very hard' || q.difficulty === 'unfamiliar' ? 'warn' : ''}">${M.esc(M.cap(q.difficulty))}</span>${total ? `<span class="tiny muted" style="margin-left:auto">Question ${idx + 1} of ${total}</span>` : ''}</div>`;
      const ctx = q.context ? `<div class="q-context prose">${M.md(q.context)}</div>` : '';
      const vis = q.visual && window.Visuals ? `<div class="q-context" style="padding:6px">${Visuals.render(q.visual, { light: !dark })}</div>` : '';
      let body = '';
      if(q.options){
        const chosenIdx = q.options.indexOf(chosen);
        body = `<div class="opts" role="radiogroup">${q.options.map((o,i) => {
          const cls = locked ? (i === q.answer ? 'right' : i === chosenIdx ? 'wrong' : '') : (i === chosenIdx ? 'sel' : '');
          return `<button type="button" class="opt ${cls}" role="radio" aria-checked="${i === chosenIdx}" data-action="q-opt" data-i="${i}" ${locked ? 'disabled' : ''}><span class="k">${String.fromCharCode(65 + i)}</span><span>${M.esc(o)}</span></button>`;
        }).join('')}</div>`;
      } else if(q.type === 'fill' || q.type === 'numerical'){
        body = `<div class="row" style="flex-wrap:nowrap"><input class="input" data-ans id="ans-${q.id}" ${q.type === 'numerical' ? 'inputmode="decimal"' : ''} autocomplete="off" placeholder="${q.type === 'numerical' ? 'Your answer (number)' : 'Your answer'}" ${locked ? `readonly value="${M.esc(chosen != null ? chosen : '')}"` : ''}>${q.unit ? `<span class="muted">${M.esc(q.unit)}</span>` : ''}</div>`;
      } else {
        const rows = q.type === 'long' || q.type === 'case' || q.type === 'challenge' ? 7 : 4;
        body = `<textarea class="textarea" data-ans id="ans-${q.id}" rows="${rows}" placeholder="Write your answer in your own words…" ${locked ? 'readonly' : ''}>${locked ? M.esc(chosen != null ? chosen : '') : ''}</textarea>${locked ? '' : '<div class="hint">Your wording doesn’t need to match any model answer. The ideas and reasoning are what count.</div>'}`;
      }
      return `<div class="q" data-qid="${q.id}">${meta}<div class="q-stem">${M.esc(q.stem)}</div>${ctx}${vis}${body}</div>`;
    },

    readAnswer(root, q){
      if(q.options){ const s = root.querySelector('.opt.sel'); return s ? Number(s.dataset.i) : null; }
      const el = root.querySelector('[data-ans]'); const v = el ? el.value.trim() : '';
      return v || null;
    },

    lockOptions(root, q, chosen){
      root.querySelectorAll('.opt').forEach(b => {
        const i = Number(b.dataset.i); b.disabled = true;
        if(i === q.answer) b.classList.add('right'); else if(i === chosen) b.classList.add('wrong');
      });
      const el = root.querySelector('[data-ans]'); if(el) el.readOnly = true;
    },

    /* ---------- grading ---------- */
    async grade(q, answer, t, opts = {}){
      const res = await this._grade(q, answer, t, opts);
      res.userAnswer = q.options ? (q.options[answer] ?? '') : String(answer ?? '');
      return res;
    },
    async _grade(q, answer, t, opts){
      if(['mcq','tf','assertion'].includes(q.type)){
        const correct = Number(answer) === q.answer;
        const trap = Array.isArray(q.trapOptions) && q.trapOptions.map(Number).includes(Number(answer));
        return { correct, score: correct ? 1 : 0, verdict: correct ? 'correct' : 'incorrect', graded:'auto',
          feedback: (q.optionNotes && q.optionNotes[answer]) || '', errorType: correct ? null : (trap ? 'misconception' : 'concept misunderstanding') };
      }
      if(q.type === 'numerical'){
        const v = parseFloat(String(answer).replace(/,/g,'').replace(/[^\d.\-eE+]/g,''));
        if(!isFinite(v)) return { correct:false, score:0, verdict:'incorrect', graded:'auto', feedback:'That isn’t a number I can read.', errorType:'incomplete answer' };
        const tol = Math.abs(q.answer) * (q.tolerance || 0.02) || 0.01;
        const correct = Math.abs(v - q.answer) <= tol;
        let errorType = 'wrong method';
        if(!correct){ const r = q.answer !== 0 ? v / q.answer : 0; if(Math.abs(Math.abs(r) - 1) < 0.02 || [10,100,1000,0.1,0.01,0.001].some(k => Math.abs(Math.abs(r) - k) / k < 0.02)) errorType = 'calculation error'; }
        return { correct, score: correct ? 1 : 0, verdict: correct ? 'correct' : 'incorrect', graded:'auto', feedback:'', errorType: correct ? null : errorType };
      }
      if(q.type === 'fill'){
        const ok = [q.answer].concat(q.accept || []).some(a => M.norm(a) === M.norm(answer));
        if(ok) return { correct:true, score:1, verdict:'correct', graded:'auto', feedback:'' };
        if(AI.ready() && !opts.noAI){
          try {
            const r = await AI.json(`Is the learner's fill-in answer acceptable (same meaning, minor spelling OK)? Question: "${q.stem}" Expected: "${q.answer}" Learner: "${answer}". Reply JSON {"correct":true|false,"why":"short"}`, { tier:'quick' });
            if(r && r.correct) return { correct:true, score:1, verdict:'correct', graded:'ai', feedback: r.why || 'Accepted: same meaning.' };
          } catch(_){}
        }
        return { correct:false, score:0, verdict:'incorrect', graded:'auto', feedback:'', errorType:'memory failure' };
      }
      return this.gradeWritten(q, answer, t, opts);
    },

    async gradeWritten(q, answer, t, opts = {}){
      if(!AI.ready()) return this.basicGrade(q, answer);
      const level = (t && t.level) || Store.state.profile.level || 'unknown';
      const prompt = `You are a fair, encouraging but rigorous teacher grading a written answer.
Learner level: ${level}. ${AI.langRule()} (write feedback in this language)
TOPIC: ${t ? t.title : ''}
QUESTION (${q.type}): ${q.stem}
${q.context ? 'CONTEXT: ' + q.context.slice(0, 2000) : ''}
MODEL ANSWER: ${q.modelAnswer || '(none)'}
KEY POINTS: ${(q.keyPoints || []).join(' | ')}
${t && t.source && t.source.text ? 'SOURCE EXCERPT (authority for source-specific facts): ' + t.source.text.slice(0, 5000) : ''}
LEARNER ANSWER: """${String(answer).slice(0, 4000)}"""

Evaluate correctness, concept understanding, completeness, reasoning, relevance, key points, terminology and logical structure — adapted to the learner's level.
Do NOT mark down different wording if the meaning is right. A blank, off-topic or "I don't know" answer scores 0.
Reply ONLY JSON:
{"score": 0-1 (0.7+ means the core understanding is clearly shown), "verdict":"correct"|"partial"|"incorrect", "strengths":["…"], "missing":["key ideas missing"], "misconceptions":["wrong ideas stated, if any"], "errorType": one of ${JSON.stringify(Mastery.ERROR_TYPES)} or null, "feedback":"2-3 sentences, specific, kind"}`;
      try {
        const r = await AI.json(prompt, { tier: opts.tier || 'default', peek: opts.peek, nocache: true });
        let score = M.clamp(Number(r.score) || 0, 0, 1);
        const verdict = ['correct','partial','incorrect'].includes(r.verdict) ? r.verdict : (score >= 0.7 ? 'correct' : score >= 0.4 ? 'partial' : 'incorrect');
        const correct = score >= 0.7 && (!r.misconceptions || !r.misconceptions.length || verdict === 'correct');
        return { correct, score, verdict: correct ? 'correct' : verdict === 'correct' ? 'partial' : verdict, graded:'ai', feedback: r.feedback || '', strengths: r.strengths || [], missing: r.missing || [], misconceptions: r.misconceptions || [], errorType: correct ? null : (Mastery.ERROR_TYPES.includes(r.errorType) ? r.errorType : (r.misconceptions && r.misconceptions.length ? 'misconception' : 'incomplete answer')) };
      } catch(e){
        if(e.code === 'cancelled') throw e;
        const b = this.basicGrade(q, answer); b.note = 'AI grading failed (' + e.message + '). Used the basic keyword check instead.'; return b;
      }
    },

    /* Honest fallback when AI is unavailable: key-point coverage. Clearly labelled as basic. */
    basicGrade(q, answer){
      const a = M.norm(answer); const pts = q.keyPoints && q.keyPoints.length ? q.keyPoints : [q.modelAnswer || ''];
      const hit = [], miss = [];
      pts.forEach(p => { const w = M.words(p).filter(x => x.length > 3); const n = w.filter(x => a.includes(x.slice(0, Math.max(4, x.length - 2)))).length; (w.length && n / w.length >= 0.5 ? hit : miss).push(p); });
      const score = pts.length ? hit.length / pts.length : 0;
      const correct = score >= 0.6 && a.split(' ').length >= 5;
      return { correct, score, verdict: correct ? 'correct' : score >= 0.3 ? 'partial' : 'incorrect', graded:'basic', feedback:'', strengths: hit, missing: miss, misconceptions: [], errorType: correct ? null : 'incomplete answer', note:'Basic keyword check. The AI grader is off, so this only checks whether the key ideas are mentioned.' };
    },

    feedbackHTML(q, r, { selfTag=true } = {}){
      const cls = r.correct ? 'ok' : r.verdict === 'partial' ? 'partial' : 'bad';
      const head = r.correct ? 'Correct' : r.verdict === 'partial' ? 'Partly there' : 'Not yet';
      const li = arr => arr && arr.length ? `<ul style="margin:0;padding-left:1.2em">${arr.map(x => `<li>${M.esc(x)}</li>`).join('')}</ul>` : '';
      return `<div class="feedback ${cls}">
        <div class="row-between"><div class="fh">${head}</div>${r.graded === 'ai' ? '<span class="tag">Graded by AI</span>' : r.graded === 'basic' ? '<span class="tag warn">Basic check</span>' : ''}</div>
        ${r.feedback ? `<div>${M.esc(r.feedback)}</div>` : ''}
        ${r.strengths && r.strengths.length && !r.correct ? `<div class="small"><b>What you got right</b>${li(r.strengths)}</div>` : ''}
        ${r.missing && r.missing.length ? `<div class="small"><b>Missing</b>${li(r.missing)}</div>` : ''}
        ${r.misconceptions && r.misconceptions.length ? `<div class="small"><b>Misconception</b>${li(r.misconceptions)}</div>` : ''}
        ${!r.correct ? `<div class="small"><b>${Quiz.isWritten(q) ? 'Model answer' : 'Correct answer'}:</b> ${M.esc(this.answerText(q))}</div>` : ''}
        ${q.explanation ? `<div class="small"><b>Why:</b> ${M.esc(q.explanation)}</div>` : ''}
        ${r.errorType && !r.correct ? `<div class="small muted">Mistake type: <b>${M.esc(r.errorType)}</b>${selfTag ? ' · <button class="btn ghost sm" data-action="self-tag" data-type="careless error">It was a careless slip</button><button class="btn ghost sm" data-action="self-tag" data-type="misreading">I misread it</button>' : ''}</div>` : ''}
        ${r.note ? `<div class="tiny muted">${M.esc(r.note)}</div>` : ''}
      </div>`;
    },
  };

  M.action('q-opt', (el) => {
    const box = el.closest('.opts'); if(!box) return;
    box.querySelectorAll('.opt').forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-checked','false'); });
    el.classList.add('sel'); el.setAttribute('aria-checked','true');
  });
  M.action('self-tag', (el) => {
    const type = el.dataset.type; const ms = Store.state.mistakes; const last = ms[ms.length - 1];
    if(last){ last.errorType = type; last.selfTagged = true; Store.touch('mistakes');
      const t = Store.topic(last.topicId); if(t){ const f = t.pendingFix.find(f => f.concept === last.concept); if(f) f.errorType = type; Store.saveTopic(t); } }
    el.parentElement.querySelectorAll('[data-action="self-tag"]').forEach(b => b.remove());
    M.toast('Noted as ' + type + '. It stays in your Mistake Bank.');
  });
})();
