/* exam.js — Exam Engine: Exam War Room (date → analysis → adaptive day plan) and Exam Mode (timed, mixed, no hints,
   subjective answers, detailed analysis → fix → retest). */
(function(){
  const LS = 'maa.exam';
  const E = window.Exam = { cur: null, timer: null, busy: false, err: null };
  try { E.cur = JSON.parse(localStorage.getItem(LS) || 'null'); } catch(_){}
  const persist = () => { try { if(E.cur) localStorage.setItem(LS, JSON.stringify(E.cur)); else localStorage.removeItem(LS); } catch(_){} };
  const MARKS_WRITTEN = 3;

  /* ================= WAR ROOM ================= */
  function planTasks(){
    const plan = Store.state.examPlan; const days = plan.date ? M.daysUntil(new Date(plan.date + 'T09:00:00').getTime()) : null;
    const topics = plan.topicIds.map(id => Store.topic(id)).filter(Boolean);
    const tasks = [];
    topics.forEach(t => {
      const s = Mastery.statusKey(t);
      const push = (kind, label, pr) => tasks.push({ kind, label, pr, t });
      if(s === 'not-started' || s === 'learning'){ push('LEARN', 'Learn: ' + t.title, 9); push('PRACTICE', 'Practice: ' + t.title, 7); }
      else if(s === 'unstable' || t.pendingFix.length){ push('FIX', 'Fix weak spots: ' + t.title, 10); push('RETEST', 'Retest: ' + t.title, 8); }
      else if(s === 'practicing'){ push('TEST', 'Hard test: ' + t.title, 8); }
      else if(s === 'near'){ push('TEST', 'Finish proofs: ' + t.title, 7); }
      else if(s === 'risk' || s === 'review'){ push('REVISE', 'Revise: ' + t.title, 9); }
      else push('REVISE', 'Quick retrieval: ' + t.title, 3);
    });
    (plan.extra || []).forEach(x => tasks.push({ kind:'LEARN', label:'Learn: ' + x, pr: 9, extra: x }));
    tasks.sort((a, b) => b.pr - a.pr);
    return { days, topics, tasks };
  }
  function schedule(tasks, days){
    if(days === null) return [];
    if(days <= 0) return [{ day: 0, items: [{ kind:'REVISE', label:'Exam day: skim your mastery sheets and Mistake Bank. No new topics.' }] }];
    const study = Math.max(1, days - 1); const perDay = Math.max(1, Math.ceil(tasks.length / study));
    const out = []; let i = 0;
    for(let d = 0; d < study && i < tasks.length; d++){ out.push({ day: d, items: tasks.slice(i, i + perDay) }); i += perDay; }
    if(days >= 2) out.push({ day: days - 1, items: [{ kind:'TEST', label:'Full timed mock exam (Exam Mode) on all topics', mock:true }, { kind:'FIX', label:'Fix what the mock exposed', mistakes:true }] });
    return out;
  }

  const LABELS = { 'not-started':'Not started', learning:'Learning', practicing:'Practicing', unstable:'Unstable', near:'Near mastery', mastered:'Mastered', review:'Review due', risk:'At risk' };
  M.route('war', (view) => {
    const plan = Store.state.examPlan; const { days, topics, tasks } = planTasks();
    const all = Store.topicsList();
    const sel = new Set(plan.topicIds);
    const counts = {}; topics.forEach(t => { const k = Mastery.statusKey(t); counts[k] = (counts[k] || 0) + 1; });
    const recent = Store.state.exams.slice(-3);
    const sched = schedule(tasks, days);
    const kindCls = { LEARN:'', PRACTICE:'', TEST:'warn', FIX:'bad', RETEST:'warn', REVISE:'ok' };
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Exam War Room</div><h1>${days === null ? 'When is your exam?' : days > 0 ? `${days} day${days === 1 ? '' : 's'} to go` : days === 0 ? 'Exam is today' : 'Exam date has passed'}</h1></div>
      <div class="card stack">
        <div class="grid grid-2"><div class="field"><label for="exDate">Exam date</label><input class="input" type="date" id="exDate" value="${M.esc(plan.date || '')}"></div>
        <div class="field"><label for="exExtra">Syllabus topics you haven’t started</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="exExtra" placeholder="e.g. Chemical reactions"><button class="btn" data-action="ex-extra">Add</button></div></div></div>
        ${(plan.extra || []).length ? `<div class="chips">${plan.extra.map((x, i) => `<span class="chip">${M.esc(x)} <button class="btn ghost sm" style="min-height:26px;padding:0 6px" data-action="ex-start-extra" data-i="${i}">Start</button><button class="btn ghost sm" style="min-height:26px;padding:0 6px" data-action="ex-del-extra" data-i="${i}" aria-label="Remove">×</button></span>`).join('')}</div>` : ''}
        <div class="field"><span class="label">Topics in this exam</span>${all.length ? `<div class="chips">${all.map(t => `<button class="chip ${sel.has(t.id) ? 'on' : ''}" data-action="ex-toggle" data-tid="${t.id}">${M.esc(t.title)}</button>`).join('')}</div>` : '<p class="small muted">Start some lessons first, or add syllabus topics above.</p>'}</div>
      </div>
      ${topics.length || (plan.extra || []).length ? `<div class="grid grid-2">
        <div class="card stack-sm"><h3>Where you stand</h3>
          ${['not-started','learning','practicing','unstable','near','mastered','review','risk'].filter(k => counts[k]).map(k => `<div class="row-between small"><span class="pill s-${k}">${LABELS[k]}</span><b>${counts[k]}</b></div>`).join('')}
          ${(plan.extra || []).length ? `<div class="row-between small"><span class="pill s-not-started">Not in academy yet</span><b>${plan.extra.length}</b></div>` : ''}
          ${Mastery.repeatedWeak().filter(w => sel.has(w.topicId)).slice(0, 3).map(w => `<div class="small">Weak: <b>${M.esc(w.conceptName)}</b> in ${M.esc(w.topicTitle)} (${w.n}×)</div>`).join('')}
          ${recent.length ? `<div class="small muted">Recent mock scores: ${recent.map(x => Math.round(x.score / x.max * 100) + '%').join(' · ')}</div>` : ''}
        </div>
        <div class="card stack-sm"><h3>Your plan</h3><p class="small muted">LEARN → PRACTICE → TEST → FIX → RETEST → REVISE. Rebuilt automatically as your mastery changes.</p>
          ${days === null ? '<p class="small">Set the exam date to get a day-by-day plan.</p>' : sched.map(d => `<div class="stack-sm" style="border-top:1px solid var(--line);padding-top:8px"><b class="small">${d.day === 0 ? 'Today' : d.day === 1 ? 'Tomorrow' : M.fmtDate(Date.now() + d.day * M.DAY)}</b>${d.items.map(it => `<div class="row small" style="flex-wrap:nowrap"><span class="tag ${kindCls[it.kind] || ''}">${it.kind}</span><span style="flex:1">${M.esc(it.label)}</span>${it.t ? `<a class="btn sm" href="#topic-${it.t.id}">Go</a>` : it.mock ? `<a class="btn sm" href="#tests">Go</a>` : it.mistakes ? `<a class="btn sm" href="#mistakes">Go</a>` : it.extra ? `<button class="btn sm" data-action="ex-start-name" data-name="${M.esc(it.extra)}">Start</button>` : ''}</div>`).join('')}</div>`).join('')}
        </div></div>` : ''}
    </div>`;
    view.querySelector('#exDate').addEventListener('change', e => { plan.date = e.target.value || null; Store.state.profile.examDate = plan.date; Store.touch('profile'); M.render(); });
  });
  M.action('ex-toggle', el => { const p = Store.state.examPlan; const i = p.topicIds.indexOf(el.dataset.tid); if(i >= 0) p.topicIds.splice(i, 1); else p.topicIds.push(el.dataset.tid); Store.touch('profile'); M.render(); });
  M.action('ex-extra', () => { const v = document.getElementById('exExtra').value.trim(); if(!v) return; const p = Store.state.examPlan; p.extra = p.extra || []; p.extra.push(v); Store.touch('profile'); M.render(); });
  M.action('ex-del-extra', el => { Store.state.examPlan.extra.splice(Number(el.dataset.i), 1); Store.touch('profile'); M.render(); });
  const startExtra = name => { const p = Store.state.examPlan; p.extra = (p.extra || []).filter(x => x !== name); Store.touch('profile'); Lesson.startSearch(name); setTimeout(() => { const t = Store.topicsList()[0]; if(t && !p.topicIds.includes(t.id)){ p.topicIds.push(t.id); Store.touch('profile'); } }, 50); };
  M.action('ex-start-extra', el => startExtra(Store.state.examPlan.extra[Number(el.dataset.i)]));
  M.action('ex-start-name', el => startExtra(el.dataset.name));

  /* ================= EXAM MODE ================= */
  const LENGTHS = [{ k:'quick', label:'Quick · 15 min · 6 questions', min:15, n:6 }, { k:'standard', label:'Standard · 30 min · 10 questions', min:30, n:10 }, { k:'full', label:'Full · 45 min · 14 questions', min:45, n:14 }];

  M.route('tests', (view, param) => {
    if(E.cur && !E.cur.done) return renderExam(view);
    if(E.cur && E.cur.done && param !== 'new') return renderResult(view);
    const all = Store.topicsList(); const pre = E.preselect || Store.state.examPlan.topicIds;
    const hist = Store.state.exams.slice().reverse();
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Tests · Exam Mode</div><h1>Simulate the real exam.</h1><p class="muted" style="margin-top:6px">Timed. Mixed chapters. No hints. Written answers are graded by meaning, not wording. Then: analyze → fix → retest.</p></div>
      ${E.err ? M.errorHTML(E.err) : ''}
      ${all.length ? `<div class="card stack">
        <div class="field"><span class="label">Topics</span><div class="chips" id="exTopics">${all.map(t => `<button class="chip ${pre.includes(t.id) ? 'on' : ''}" data-action="chip-toggle" data-tid="${t.id}">${M.esc(t.title)}</button>`).join('')}</div></div>
        <div class="field"><span class="label">Length</span><div class="chips" id="exLen">${LENGTHS.map((l, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-action="chip-one" data-k="${l.k}">${l.label}</button>`).join('')}</div></div>
        ${E.busy ? M.loadingHTML('Creating your exam paper…', 'Fresh, mixed questions across your topics') : `<button class="btn primary block" data-action="ex-begin">${M.icon.clock} Start timed exam</button>`}
        ${!AI.ready() ? '<p class="hint">AI is off: exams use the built-in question bank (built-in lesson only), and written answers get the basic keyword check.</p>' : ''}
      </div>` : M.emptyHTML('test', 'Start a lesson first. Exams are built from the topics you’re studying.', '<a class="btn primary" href="#learn">Learn something</a>')}
      ${hist.length ? `<div class="card"><h3>Past exams</h3><div class="mini-list">${hist.map(x => `<div class="mini-item"><div class="grow"><div class="t">${Math.round(x.score / x.max * 100)}% · ${x.score}/${x.max} marks</div><div class="s">${M.fmtDate(x.at)} · ${x.topics.map(M.esc).join(', ')}</div></div></div>`).join('')}</div></div>` : ''}
    </div>`;
  });
  M.action('chip-toggle', el => el.classList.toggle('on'));
  M.action('chip-one', el => { el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); el.classList.add('on'); });

  M.action('ex-begin', async () => {
    const tids = [...document.querySelectorAll('#exTopics .chip.on')].map(c => c.dataset.tid); const len = LENGTHS.find(l => l.k === (document.querySelector('#exLen .chip.on') || {}).dataset?.k) || LENGTHS[0];
    if(!tids.length){ M.toast('Pick at least one topic.'); return; }
    const topics = tids.map(id => Store.topic(id)).filter(Boolean);
    E.busy = true; E.err = null; M.render();
    try {
      let qs = [];
      if(AI.ready()){
        const prompt = `You are a senior examiner setting a realistic, fair but challenging exam paper. No hints in the questions.
${AI.learner()}
TOPICS:
${topics.map((t, i) => `T${i + 1}: ${t.title} (${t.subject}); concepts: ${t.concepts.map(c => c.id + '=' + c.name).join(', ')}`).join('\n')}
Write ${len.n} questions spread across the topics, like a real ${topics[0].level || ''} exam: mix of mcq, assertion, numerical (if relevant), short and long/case answers (about 35% written). Difficulty: mostly medium and hard, a few very hard. Add a "topic" field: "T1", "T2", …
${Quiz.SCHEMA}`;
        const r = await AI.json(prompt, { tier:'default' });
        (r.questions || []).forEach(q => { const i = Math.max(0, Number(String(q.topic || 'T1').replace(/\D/g, '')) - 1); const t = topics[Math.min(i, topics.length - 1)]; const v = Quiz.validate(q, { concepts: t.concepts, asked: [] }, qs); if(v){ v.topicId = t.id; qs.push(v); } });
      } else {
        topics.filter(t => t.builtin).forEach(t => { M.shuffle(Pack[t.builtin].bank).forEach(q => { const v = Quiz.validate(q, { concepts: t.concepts, asked: [] }, qs); if(v){ v.topicId = t.id; qs.push(v); } }); });
        if(!qs.length) throw new Error('Exam papers need the AI teacher (or the built-in lesson). Open this page inside Claude to switch the AI on.');
      }
      qs = qs.slice(0, len.n);
      if(qs.length < 3) throw new Error('The exam paper failed the quality check. Try again.');
      E.cur = { id: M.uid('e'), topics: tids, qs, answers: {}, i: 0, start: Date.now(), end: Date.now() + len.min * 60000, minutes: len.min, done: false };
      persist(); E.preselect = null;
    } catch(e){ E.err = e.message; }
    E.busy = false; M.render();
  });

  function renderExam(view){
    const X = E.cur, q = X.qs[X.i];
    const saved = X.answers[q.id];
    view.innerHTML = `<div class="stack">
      <div class="row-between"><div class="eyebrow">Exam in progress · no hints</div><span class="timer num" id="exTimer"></span></div>
      <div class="chips">${X.qs.map((x, i) => `<button class="chip ${i === X.i ? 'on' : ''}" data-action="ex-go" data-i="${i}" style="min-width:42px;justify-content:center;${X.answers[x.id] !== undefined && i !== X.i ? 'background:var(--surface-2)' : ''}">${i + 1}${X.answers[x.id] !== undefined ? '·' : ''}</button>`).join('')}</div>
      <div class="card">${Quiz.render(q, { idx: X.i, total: X.qs.length })}<div class="tiny muted" style="margin-top:8px">${Quiz.isWritten(q) ? `${MARKS_WRITTEN} marks` : '1 mark'} · ${M.esc((Store.topic(q.topicId) || {}).title || '')}</div></div>
      <div class="row-between"><div class="row"><button class="btn" data-action="ex-go" data-i="${X.i - 1}" ${X.i === 0 ? 'disabled' : ''}>${M.icon.back} Prev</button><button class="btn" data-action="ex-go" data-i="${X.i + 1}" ${X.i === X.qs.length - 1 ? 'disabled' : ''}>Next ${M.icon.arrow}</button></div><button class="btn primary" data-action="ex-submit">Submit exam</button></div>
      <p class="hint">Answers save as you go. Don’t close the page. The exam submits automatically when time runs out.</p>
    </div>`;
    const root = view.querySelector('.card');
    if(saved !== undefined){ if(q.options){ const b = root.querySelector(`.opt[data-i="${saved}"]`); if(b){ b.classList.add('sel'); b.setAttribute('aria-checked','true'); } } else { const el = root.querySelector('[data-ans]'); if(el) el.value = saved; } }
    root.addEventListener('click', () => setTimeout(() => capture(), 0));
    root.addEventListener('input', capture);
    tick(); clearInterval(E.timer); E.timer = setInterval(tick, 1000);
  }
  function capture(){ const X = E.cur; if(!X || X.done) return; const q = X.qs[X.i]; const root = document.querySelector('.card'); if(!root) return; const a = Quiz.readAnswer(root, q); if(a === null) delete X.answers[q.id]; else X.answers[q.id] = a; persist(); }
  function tick(){
    const X = E.cur; const el = document.getElementById('exTimer');
    if(!X || X.done || !el){ clearInterval(E.timer); return; }
    const left = Math.max(0, X.end - Date.now()); const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    el.textContent = `${m}:${String(s).padStart(2, '0')}`; el.classList.toggle('low', left < 120000);
    if(left <= 0){ clearInterval(E.timer); M.toast('Time’s up. Submitting.'); submit(); }
  }
  M.action('ex-go', el => { capture(); const i = Number(el.dataset.i); if(i < 0 || i >= E.cur.qs.length) return; E.cur.i = i; persist(); M.render(); });
  M.action('ex-submit', el => {
    capture(); const X = E.cur; const blank = X.qs.filter(q => X.answers[q.id] === undefined).length;
    if(blank && el.dataset.confirm !== '1'){ el.dataset.confirm = '1'; el.textContent = `${blank} unanswered. Tap again to submit`; return; }
    submit();
  });

  async function submit(){
    const X = E.cur; if(!X || X.done || E.grading) return;
    E.grading = true; clearInterval(E.timer);
    document.getElementById('view').innerHTML = `<div class="card">${M.loadingHTML('Checking your answers…', 'Objective answers instantly, written answers by meaning')}</div>`;
    const results = {};
    const written = [];
    for(const q of X.qs){
      const a = X.answers[q.id];
      if(a === undefined){ results[q.id] = { correct:false, score:0, verdict:'incorrect', feedback:'Not answered.', errorType:'incomplete answer', userAnswer:'' }; continue; }
      if(Quiz.isWritten(q)) written.push(q);
      else results[q.id] = await Quiz.grade(q, a, Store.topic(q.topicId), { noAI: true });
    }
    if(written.length){
      if(AI.ready()){
        try {
          const r = await AI.json(`Grade these exam answers fairly by meaning (not wording), adapted to the learner level. ${AI.learner()}
${written.map((q, i) => `#${i + 1} QUESTION: ${q.stem}\nMODEL: ${q.modelAnswer || ''}\nKEY POINTS: ${(q.keyPoints || []).join(' | ')}\nANSWER: """${String(X.answers[q.id]).slice(0, 2500)}"""`).join('\n\n')}
Reply ONLY JSON {"grades":[{"n":1,"score":0-1,"feedback":"1-2 sentences","missing":["…"],"errorType": one of ${JSON.stringify(Mastery.ERROR_TYPES)} or null}]}`, { tier:'default', nocache:true });
          written.forEach((q, i) => { const g = (r.grades || []).find(g => Number(g.n) === i + 1) || {}; const score = M.clamp(Number(g.score) || 0, 0, 1); results[q.id] = { correct: score >= 0.7, score, verdict: score >= 0.7 ? 'correct' : score >= 0.4 ? 'partial' : 'incorrect', feedback: g.feedback || '', missing: g.missing || [], graded:'ai', errorType: score >= 0.7 ? null : (Mastery.ERROR_TYPES.includes(g.errorType) ? g.errorType : 'incomplete answer'), userAnswer: String(X.answers[q.id]) }; });
        } catch(e){ written.forEach(q => { results[q.id] = { ...Quiz.basicGrade(q, X.answers[q.id]), userAnswer: String(X.answers[q.id]), note:'AI grading failed. Used the basic check.' }; }); }
      } else written.forEach(q => { results[q.id] = { ...Quiz.basicGrade(q, X.answers[q.id]), userAnswer: String(X.answers[q.id]) }; });
    }
    // marks + feed mistakes into the mastery system (so FIX → RETEST works)
    let score = 0, max = 0; const perTopic = {};
    X.qs.forEach(q => {
      const r = results[q.id]; const mk = Quiz.isWritten(q) ? MARKS_WRITTEN : 1; max += mk;
      const got = Quiz.isWritten(q) ? Math.round((r.score || 0) * mk * 2) / 2 : (r.correct ? 1 : 0); r.marks = got; score += got;
      const pt = perTopic[q.topicId] = perTopic[q.topicId] || { got:0, max:0 }; pt.got += got; pt.max += mk;
      const t = Store.topic(q.topicId); if(t && X.answers[q.id] !== undefined){ Mastery.record(t, q, r, 'exam'); }
    });
    X.qs.map(q => q.topicId).filter((v, i, a) => a.indexOf(v) === i).forEach(id => { const t = Store.topic(id); if(t) Store.saveTopic(t); });
    X.results = results; X.score = score; X.max = max; X.perTopic = perTopic; X.done = true; X.finished = Date.now();
    Store.state.exams.push({ id: X.id, at: Date.now(), topics: X.topics.map(id => (Store.topic(id) || {}).title || '?'), score, max, perTopic });
    Store.touch('profile'); persist(); E.grading = false; M.render();
  }

  function renderResult(view){
    const X = E.cur; const pct = Math.round(X.score / X.max * 100);
    const errs = {}; X.qs.forEach(q => { const r = X.results[q.id]; if(!r.correct && r.errorType) errs[r.errorType] = (errs[r.errorType] || 0) + 1; });
    const weakTopics = Object.entries(X.perTopic).filter(([, v]) => v.got / v.max < 0.7).map(([id]) => id);
    const fixT = weakTopics.map(id => Store.topic(id)).filter(t => t && t.pendingFix.length)[0];
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Exam result</div><h1>${X.score} / ${X.max} marks · ${pct}%</h1><p class="muted">${M.plural(X.qs.length, 'question')} · ${Math.round(((X.finished || Date.now()) - X.start) / 60000)} of ${X.minutes} min</p></div>
      <div class="grid grid-2">
        <div class="card stack-sm"><h3>By topic</h3>${Object.entries(X.perTopic).map(([id, v]) => `<div class="stack-sm"><div class="row-between small"><span>${M.esc((Store.topic(id) || {}).title || '?')}</span><b>${v.got}/${v.max}</b></div><div class="score-bar"><i style="width:${v.got / v.max * 100}%;background:${v.got / v.max >= 0.7 ? 'var(--ok)' : 'var(--warn)'}"></i></div></div>`).join('')}</div>
        <div class="card stack-sm"><h3>Why marks were lost</h3>${Object.keys(errs).length ? `<div class="bars">${Object.entries(errs).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="bar-row"><span>${M.esc(k)}</span><span class="track"><i style="width:${n / Math.max(...Object.values(errs)) * 100}%"></i></span><span class="n">${n}</span></div>`).join('')}</div>` : '<p class="small">No lost marks. Excellent.</p>'}</div>
      </div>
      <div class="card stack-sm"><h3>Next: analyze → fix → retest</h3><p class="small muted">Every wrong answer went into your Mistake Bank and the topic’s fix list.</p><div class="row">${fixT ? `<a class="btn primary" href="#topic-${fixT.id}">Fix weak spots: ${M.esc(fixT.title)}</a>` : ''}<a class="btn" href="#mistakes">Open Mistake Bank</a><button class="btn" data-action="ex-retest" data-tids="${(weakTopics.length ? weakTopics : X.topics).join(',')}">Fresh retest${weakTopics.length ? ' on weak topics' : ''}</button></div></div>
      <div class="stack"><h2>Question-by-question</h2>${X.qs.map((q, i) => { const r = X.results[q.id]; return `<details class="fold"><summary><span class="row" style="flex-wrap:nowrap"><span class="tag ${r.correct ? 'ok' : r.verdict === 'partial' ? 'warn' : 'bad'}">${r.marks}/${Quiz.isWritten(q) ? MARKS_WRITTEN : 1}</span><span style="font-weight:400">${i + 1}. ${M.esc(q.stem.slice(0, 80))}${q.stem.length > 80 ? '…' : ''}</span></span></summary><div class="stack-sm">${q.context ? `<div class="q-context prose small">${M.md(q.context)}</div>` : ''}<div class="small"><b>Your answer:</b> ${M.esc(r.userAnswer || '—')}</div>${Quiz.feedbackHTML(q, r, { selfTag:false })}</div></details>`; }).join('')}</div>
      <a class="btn" href="#tests-new" data-action="ex-new">New exam</a>
    </div>`;
  }
  M.action('ex-retest', el => { E.preselect = el.dataset.tids.split(','); E.cur = null; persist(); M.go('tests-new'); });
  M.action('ex-new', () => { E.cur = null; persist(); M.go('tests-new'); });
  M.on('route', r => { if(r.name !== 'tests') clearInterval(E.timer); });
})();
