/* lesson.js — Lesson Engine + the topic Journey (the master learning loop UI).
   DIAGNOSE → LEARN (teacher + reading, with checkpoints) → PRACTICE → HARD TEST → FIX (reteach differently + fresh retest)
   → APPLY → EXPLAIN → TEACH BACK → UNFAMILIAR CHALLENGE → MASTERED → SPACED REVISION */
(function(){
  const L = window.Lesson = { inflight: {}, errors: {}, tab: {}, readMode: {} };
  const KINDS = ['maths','physics','chemistry','biology','history','geography','ai','coding','language','general'];
  const METHODS = ['a vivid analogy','a fully worked example, step by step','a visual explanation (include a diagram)','a real-life example','Socratic questions that lead the learner to the answer','the simplest possible explanation, like to a younger student'];
  const LOOP = [['diagnose','Diagnose'],['learn','Learn'],['practice','Practice'],['hard','Hard test'],['fix','Fix & retest'],['apply','Apply'],['explain','Explain'],['teachback','Teach back'],['challenge','Challenge'],['award','Mastered'],['review','Revise']];

  /* ---------- async task helper (dedupes, survives navigation, re-renders) ---------- */
  L.task = (key, fn) => {
    if(L.inflight[key]) return L.inflight[key];
    delete L.errors[key];
    const p = (async () => fn())();
    L.inflight[key] = p;
    p.then(() => {}, e => { if(e && e.code !== 'cancelled') { L.errors[key] = e; console.warn(key, e); } })
     .finally(() => { delete L.inflight[key]; L.refresh(); });
    return p;
  };
  L.refresh = () => { if(M.current.name === 'topic') M.render(); else M.emit('store', 'task'); };
  const peek = () => document.querySelector('[data-peek]');

  /* ================= creating topics ================= */
  L.startSearch = (query) => {
    query = String(query || '').trim();
    if(!query){ M.toast('Type a topic first. For example “Photosynthesis”.'); return; }
    const existing = Store.topicsList().find(t => M.norm(t.query || t.title) === M.norm(query));
    if(existing){ M.go('topic-' + existing.id); return; }
    if(!AI.ready()){
      const pk = Pack.force;
      if(pk.match.test(query)) return L.startBuiltin('force');
      M.go('learn'); setTimeout(() => M.emit('offline-miss', query), 50); return;
    }
    const t = Mastery.newTopic({ title: query, query, planned: false });
    Store.saveTopic(t);
    M.go('topic-' + t.id);
  };

  L.startBuiltin = (key) => {
    const existing = Store.topicsList().find(t => t.builtin === key);
    if(existing){ M.go('topic-' + existing.id); return; }
    const pk = Pack[key];
    const t = Mastery.newTopic({ title: pk.title, query: pk.title, subject: pk.subject, subjectKind: pk.subjectKind, level: pk.level, builtin: key, planned: true,
      concepts: pk.concepts, diagnostic: { questions: pk.diagnostic.map(q => Quiz.validate(q, { concepts: pk.concepts, asked: [] })).filter(Boolean), answers: {}, done: false } });
    Store.saveTopic(t); M.go('topic-' + t.id);
  };

  L.startSource = (book, ch, text) => {
    const t = Mastery.newTopic({ title: ch.title, query: book.name + ' ' + ch.title, planned: false,
      source: { name: book.name, chapter: ch.title, pages: `${ch.start}–${ch.end}`, text: text.slice(0, 45000), truncated: text.length > 45000, sections: ch.sections || [] } });
    Store.saveTopic(t); M.go('topic-' + t.id);
  };

  /* ================= AI: plan + diagnostic ================= */
  L.plan = (t) => L.task('plan-' + t.id, async () => {
    const src = t.source ? `\nSOURCE MATERIAL (from the learner's upload "${t.source.name}", ${t.source.chapter}). It is the factual boundary for source-specific content. Detect the structure only from headings that really appear in it.\n"""${t.source.text.slice(0, 28000)}"""\n` : '';
    const prompt = `You are a curriculum architect for a mastery-learning academy.
${AI.learner()}
The learner wants to learn: "${t.query}"${src}
Plan it. Reply ONLY JSON:
{"title":"clean, specific topic title","subject":"e.g. Science, Maths, History, AI, Coding","subjectKind": one of ${JSON.stringify(KINDS)},
 "level":"the learner level to teach at (use the learner's level if known; otherwise infer, e.g. 'Class 8', 'Beginner adult')",
 "overview":"one sentence: what mastering this means",
 "parts": [] or, ONLY if this is a whole course too big for one sitting (e.g. 'Python from zero', 'Machine Learning'), 4-10 ordered part titles — the first part becomes this lesson,
 ${t.source ? '"tree":[{"section":"heading from source","topics":[{"name":"...","subtopics":["..."]}]}],' : ''}
 "concepts":[{"id":"c1","name":"…"}] (4-7 core concepts of THIS lesson (the first part if split), in teaching order),
 "diagnostic":[4 questions: easy→medium, types: 2 mcq, 1 tf or fill, 1 short; one targets a common misconception]}
Diagnostic questions use this format:
${Quiz.SCHEMA}`;
    const r = await AI.json(prompt, { tier:'default', peek });
    if(!r || !Array.isArray(r.concepts) || r.concepts.length < 2) throw Object.assign(new Error('The lesson plan came back incomplete. Try again.'), { code:'qc' });
    t.concepts = r.concepts.slice(0, 8).map((c, i) => ({ id: String(c.id || 'c' + (i + 1)), name: String(c.name || c).slice(0, 80) }));
    const parts = !t.pathSeed && Array.isArray(r.parts) ? r.parts.map(String).filter(Boolean).slice(0, 12) : [];
    t.title = parts.length >= 3 ? `${r.title || t.query}: ${parts[0]}` : String(r.title || t.query).slice(0, 90);
    if(parts.length >= 3) t.path = { course: r.title || t.query, parts, index: 0 };
    t.subject = String(r.subject || 'General').slice(0, 30);
    t.subjectKind = KINDS.includes(r.subjectKind) ? r.subjectKind : 'general';
    t.level = String(r.level || Store.state.profile.level || '').slice(0, 40);
    t.overview = String(r.overview || '').slice(0, 240);
    if(r.tree && t.source) t.source.tree = r.tree;
    const diagList = Array.isArray(r.diagnostic) ? r.diagnostic : (r.diagnostic && Array.isArray(r.diagnostic.questions) ? r.diagnostic.questions : []);
    const dq = []; diagList.forEach(q => { const v = Quiz.validate(q, t, dq); if(v) dq.push(v); });
    t.diagnostic = { questions: dq, answers: {}, done: dq.length === 0, skipped: dq.length === 0 };
    t.planned = true; Store.saveTopic(t);
  });

  L.startPart = (t, idx) => {
    const course = t.path.course, part = t.path.parts[idx];
    const exists = Store.topicsList().find(x => x.path && x.path.course === course && x.path.index === idx);
    if(exists){ M.go('topic-' + exists.id); return; }
    const n = Mastery.newTopic({ title: part, query: `${course} — part ${idx + 1}: ${part}`, planned: false, level: t.level, pathSeed: { course, parts: t.path.parts, index: idx } });
    Store.saveTopic(n); M.go('topic-' + n.id);
  };

  /* ================= AI: lesson ================= */
  L.buildLesson = (t) => L.task('lesson-' + t.id, async () => {
    if(t.builtin){ const pk = Pack[t.builtin]; t.lesson = { sections: pk.sections.map(s => ({ ...s, origin:'extra', checkpoint: Quiz.validate(s.checkpoint, t) })), summary:'', qc: null }; t.lesson.qc = qcLesson(t); Store.saveTopic(t); return; }
    const d = t.diagnostic || {}; const res = d.result || {};
    const known = (res.known || []).map(id => Mastery.conceptName(t, id)), weak = (res.weak || []).map(id => Mastery.conceptName(t, id));
    const src = t.source ? `\nSOURCE (the learner's uploaded material — authoritative for source-specific facts):\n"""${t.source.text.slice(0, 30000)}"""\nRULES: For each section set "origin":"source" if its core content comes from the SOURCE, and copy one EXACT sentence from the source into "sourceQuote". Anything you add beyond the source must be in a section with "origin":"extra" (EXTRA EXPLANATION). Never invent textbook-specific facts, page numbers or exercises.\n` : '';
    const pathNote = t.pathSeed ? `This is part ${t.pathSeed.index + 1} of the course "${t.pathSeed.course}" (parts: ${t.pathSeed.parts.join(' → ')}). Teach only this part; assume earlier parts are known.` : '';
    const prompt = `You are an outstanding teacher writing a complete mastery lesson.
${AI.learner(t)}
TOPIC: ${t.title} (${t.subject}) ${pathNote}
CONCEPTS (cover every one):
${t.concepts.map(c => c.id + ': ' + c.name).join('\n')}
DIAGNOSTIC: ${known.length ? 'already seems to know: ' + known.join(', ') + ' (keep these brief, don\'t skip).' : ''} ${weak.length ? 'struggled with: ' + weak.join(', ') + ' (teach these most carefully).' : ''}${!known.length && !weak.length ? 'no diagnostic data (assume a beginner at this level).' : ''}
${src}
Write 5-8 sections that progress Basic → Foundation → Intermediate → Advanced → Mastery. Remove filler, not content.
Each section: a clear explanation (markdown, 80-200 words; use short paragraphs, bullets, **bold** key terms; plain Unicode maths),
a concrete example or worked solution, and ONE checkpoint question (mcq/tf/fill/numerical/short) that checks THAT section.
For process-type ideas you may include a flow diagram as a fenced block: \`\`\`flow\nStep A -> Step B -> Step C\n\`\`\`.
Also include one section on common mistakes/misconceptions.
Reply ONLY JSON:
{"sections":[{"level":"Basic|Foundation|Intermediate|Advanced|Mastery","heading":"…","concepts":["c1"],"body":"markdown","example":"markdown","origin":"source|extra","sourceQuote":"exact sentence or empty","checkpoint":Q}],"summary":"3-5 sentence recap"}
Q format: ${Quiz.SCHEMA}`;
    const r = await AI.json(prompt, { tier:'default', peek });
    const secs = (r && r.sections || []).filter(s => s && s.body).slice(0, 10);
    if(secs.length < 3) throw Object.assign(new Error('The lesson came back too short and failed the quality check. Try again.'), { code:'qc' });
    const lesson = { sections: [], summary: String(r.summary || '') };
    const batch = [];
    secs.forEach(s => {
      const cp = s.checkpoint ? Quiz.validate(s.checkpoint, t, batch) : null; if(cp) batch.push(cp);
      const sec = { level: s.level || '', heading: String(s.heading || '').slice(0, 90), concepts: Array.isArray(s.concepts) ? s.concepts : [], body: String(s.body), example: String(s.example || ''), origin: t.source ? (s.origin === 'source' ? 'source' : 'extra') : 'extra', sourceQuote: String(s.sourceQuote || ''), checkpoint: cp };
      if(t.source && sec.origin === 'source'){ sec.verified = Source.verify(sec.sourceQuote, t.source.text); if(!sec.verified) sec.origin = 'unverified'; }
      lesson.sections.push(sec);
    });
    t.lesson = lesson; t.lesson.qc = qcLesson(t);
    Store.saveTopic(t);
  });

  function qcLesson(t){
    const secs = t.lesson.sections;
    const covered = new Set(); secs.forEach(s => (s.concepts || []).forEach(c => covered.add(c)));
    if(t.builtin) t.concepts.forEach(c => covered.add(c.id));
    // fall back: name mention counts as coverage
    t.concepts.forEach(c => { if(!covered.has(c.id) && secs.some(s => M.similarity(c.name, s.heading + ' ' + s.body.slice(0, 400)) > 0.08 || M.norm(s.body).includes(M.norm(c.name).split(' ').slice(0, 2).join(' ')))) covered.add(c.id); });
    const levels = new Set(secs.map(s => s.level));
    const cps = secs.filter(s => s.checkpoint).length;
    const qc = { concepts: [t.concepts.filter(c => covered.has(c.id)).length, t.concepts.length], levels: levels.size, checkpoints: [cps, secs.length], missing: t.concepts.filter(c => !covered.has(c.id)).map(c => c.name) };
    if(t.source){ const src = secs.filter(s => s.origin === 'source' || s.origin === 'unverified'); qc.quotes = [secs.filter(s => s.verified).length, src.length]; }
    return qc;
  }

  L.buildScenes = (t) => L.task('scenes-' + t.id, async () => {
    if(t.builtin){ t.scenes = Video.validate(Pack[t.builtin].scenes, t); Store.saveTopic(t); return; }
    t.scenes = await Video.generate(t, { peek }); Store.saveTopic(t);
  });

  /* ================= questions for a stage ================= */
  function specFor(t, stage){
    const ag = t.antiGuess > 0;
    const rel = Revision.related(t);
    const S = {
      practice: { count: 4, types: ag ? ['short','application','numerical','explain'] : ['mcq','short','numerical','fill','tf','application'], difficulty: ['easy','medium'], note: (ag ? 'ANTI-GUESSING: the learner answers multiple choice well but written explanations poorly — use written/explain questions. ' : '') + 'Include at least one written (short) answer.', related: rel.slice(0, 1) },
      hard: { count: 3, types: ['assertion','long','numerical','case','mcq','data'], difficulty: ['hard','very hard'], note: 'Use reasoning, multi-step thinking, misconceptions and mixed concepts. At least one written multi-step (long or case) question and one that targets a common misconception.' },
      apply: { count: 1, types: ['case','application','data'], difficulty: ['hard'], note: 'A realistic situation where the learner must APPLY the idea (not recall it).' },
      explain: { count: 1, types: ['short'], difficulty: ['medium'], note: 'Ask the learner to explain WHY or HOW in their own words.' },
      recall: { count: 2, types: ['mcq','fill','tf'], difficulty: ['easy'], note: 'Quick retrieval of key facts/definitions.' },
      challenge: { count: 1, types: ['long'], difficulty: ['unfamiliar'], note: 'UNFAMILIAR TRANSFER CHALLENGE: put the concept in a brand-new context never used in typical lessons, requiring the learner to combine at least two concepts. Must not resemble any earlier question.' },
      review: { count: 3, types: ['mcq','short','application','numerical','fill'], difficulty: ['medium','hard'], note: 'Spaced retrieval: one quick recall, one explain-in-your-words (short), one application. No re-reading.', related: rel },
      refresh: { count: 2, types: ['short','mcq','numerical'], difficulty: ['medium'], note: 'Recheck after a refresher.' },
    };
    return { ...S[stage], stage };
  }

  L.makeRun = (t, stage) => L.task('run-' + t.id, async () => {
    let qs;
    if(t.builtin && !AI.ready()){
      qs = Pack.questions(t, stage, specFor(t, stage).count);
      if(!qs.length) throw Object.assign(new Error('You’ve used all the built-in questions for this step. Fresh questions need the AI teacher. Open this page inside Claude to switch it on.'), { code:'exhausted' });
    } else {
      qs = await Quiz.generate(t, specFor(t, stage), { peek });
    }
    if(stage === 'challenge') qs = qs.slice(0, 1).map(q => ({ ...q, type: Quiz.isWritten(q) ? 'challenge' : q.type }));
    t.run = { stage, questions: qs, idx: 0, answered: {}, started: Date.now() };
    Store.saveTopic(t);
  });

  /* ================= grading inside a run ================= */
  L.checkRun = async (btn) => {
    const t = Store.topic(btn.dataset.tid); if(!t || !t.run) return;
    const run = t.run, q = run.questions[run.idx]; const root = btn.closest('.stage-card');
    const ans = Quiz.readAnswer(root, q);
    if(ans === null){ M.toast('Answer first. Even a best guess is useful evidence.'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Checking your answer…';
    let r;
    try { r = await Quiz.grade(q, ans, t, { peek: null }); }
    catch(e){ btn.disabled = false; btn.textContent = 'Check answer'; M.toast(e.message); return; }
    run.answered[q.id] = { ...r, type: q.type };
    Mastery.record(t, q, r, run.stage === 'diagnose' ? 'diagnose' : run.stage);
    Store.saveTopic(t); M.render();
  };

  L.nextRun = (tid) => {
    const t = Store.topic(tid); if(!t || !t.run) return;
    if(t.run.idx < t.run.questions.length - 1){ t.run.idx++; Store.saveTopic(t); M.render(); return; }
    finishRun(t);
  };

  function finishRun(t){
    const run = t.run; const results = run.questions.map(q => ({ ...(run.answered[q.id] || { correct:false, score:0 }), type: q.type, concept: q.concept }));
    let summary;
    if(run.stage === 'review'){ const r = Revision.record(t, results); summary = { ...r, stage:'review', note: r.passed ? `Retention confirmed. Next review ${M.relDay(t.review.due)}.` + (t.retainedAt ? ' This topic now counts as 102%.' : '') : 'Some of this has faded. It’s marked AT RISK: do a quick refresh, then a recheck.' }; }
    else if(run.stage === 'refresh'){ const ok = results.every(r => r.correct); Revision.refreshed(t, ok); summary = { passed: ok, right: results.filter(r => r.correct).length, n: results.length, stage:'refresh', note: ok ? 'Recovered. Back to MASTERED, and the next review is in 2 days.' : 'Not solid yet. Try the refresh once more.' }; }
    else if(run.stage === 'challenge'){ const ok = results[0] && results[0].score >= 0.7; if(ok) Mastery.grant(t, 'challenge'); summary = { passed: ok, right: ok ? 1 : 0, n: 1, stage:'challenge', note: ok ? 'You transferred the idea to a situation you’d never seen. That’s real understanding.' : 'Close. Fix the gap shown in the feedback, then try a new challenge.' }; }
    else summary = { ...Mastery.completeRun(t, run.stage, results), stage: run.stage };
    t.lastRun = { ...summary, at: Date.now(), results: results.map(r => ({ correct: r.correct, type: r.type })) };
    t.run = null; Store.saveTopic(t); M.render();
  }

  /* diagnostic uses its own stored questions */
  L.finishDiagnostic = (t) => {
    const d = t.diagnostic; const known = new Set(), weak = new Set();
    d.questions.forEach(q => { const a = d.answers[q.id]; if(!a) return; (a.correct ? known : weak).add(q.concept); });
    weak.forEach(c => known.delete(c));
    const right = d.questions.filter(q => d.answers[q.id] && d.answers[q.id].correct).length;
    d.result = { right, n: d.questions.length, known: [...known], weak: [...weak] };
    d.done = true; t.lessonProgress.started = true; Store.saveTopic(t); M.render();
  };

  /* ================= FIX: find weakness → reteach differently → fresh retest ================= */
  L.makeFix = (t) => L.task('fix-' + t.id, async () => {
    const f = t.pendingFix[0]; if(!f) return;
    const method = METHODS[f.methodIdx % METHODS.length];
    const tried = METHODS.slice(0, f.methodIdx).join('; ');
    const cname = Mastery.conceptName(t, f.concept);
    if(!AI.ready()){
      if(!t.builtin) throw Object.assign(new Error(AI.friendly('offline')), { code:'offline' });
      const pk = Pack[t.builtin]; const sec = pk.sections.find(s => s.checkpoint && s.checkpoint.concept === f.concept) || pk.sections[0];
      const q = Pack.fixQuestion(t, f.concept);
      if(!q) throw Object.assign(new Error('No fresh built-in question is left for this concept. The AI teacher can make new ones. Open this page inside Claude.'), { code:'exhausted' });
      t.fixRun = { concept: f.concept, method: 'built-in explanation', diagnosis: `You missed a question on “${cname}”. Here is that idea again.`, reteach: sec.body + '\n\n**Example:** ' + sec.example, visual: null, question: q, phase:'teach' };
      Store.saveTopic(t); return;
    }
    const diff = f.tries >= 2 ? 'medium (one step easier than before)' : (f.difficulty || 'medium');
    const prompt = `You are a patient expert tutor fixing ONE specific weakness.
${AI.learner(t)}
TOPIC: ${t.title}. WEAK CONCEPT: ${f.concept} — ${cname}
The learner was asked: "${f.stem}"
They answered: "${String(f.userAnswer).slice(0, 600)}"
Correct answer: "${String(f.correctAnswer).slice(0, 600)}"
Mistake type: ${f.errorType}. ${f.feedback ? 'Grader feedback: ' + f.feedback : ''}
${f.tries ? `Earlier reteach attempts used: ${tried}. They did not work — use a genuinely DIFFERENT approach.` : ''}
1) Diagnose the exact misunderstanding in one sentence (kind, specific).
2) Reteach ONLY that concept using ${method}. 100-220 words, markdown, plain Unicode maths.
3) Write ONE completely fresh question that tests the SAME underlying idea in a different form/context (not a rewording), difficulty ${diff}.
Reply ONLY JSON: {"diagnosis":"…","reteach":"markdown","visual": null or VISUAL,"question": Q}
VISUAL = ${Visuals.SPEC_SHORT}
Q format: ${Quiz.SCHEMA}`;
    const r = await AI.json(prompt, { tier:'default', peek });
    const q = r && r.question ? Quiz.validate({ ...r.question, concept: f.concept }, t) : null;
    if(!q || !r.reteach) throw Object.assign(new Error('The reteach came back incomplete. Try again.'), { code:'qc' });
    t.fixRun = { concept: f.concept, method, diagnosis: String(r.diagnosis || ''), reteach: String(r.reteach), visual: Visuals.valid(r.visual) ? r.visual : null, question: q, phase:'teach' };
    Store.saveTopic(t);
  });

  L.checkFix = async (btn) => {
    const t = Store.topic(btn.dataset.tid); const fr = t && t.fixRun; if(!fr) return;
    const root = btn.closest('.stage-card'); const ans = Quiz.readAnswer(root, fr.question);
    if(ans === null){ M.toast('Answer the fresh question first.'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Checking your answer…';
    let r; try { r = await Quiz.grade(fr.question, ans, t); } catch(e){ btn.disabled = false; btn.textContent = 'Check answer'; M.toast(e.message); return; }
    fr.result = r; fr.phase = 'result';
    const f = t.pendingFix.find(x => x.concept === fr.concept);
    // record without re-adding a mistake entry for retest misses (keep one fix item, track tries)
    t.attempts.push({ id: fr.question.id, stage:'fix', type: fr.question.type, difficulty: fr.question.difficulty, concept: fr.concept, correct: r.correct, score: r.score ?? (r.correct ? 1 : 0), at: Date.now(), errorType: r.correct ? null : r.errorType, stem: fr.question.stem.slice(0, 200) });
    t.asked.push(fr.question.stem.slice(0, 200));
    if(r.correct){ Mastery.resolveConcept(t, fr.concept); if(Quiz.isWritten(fr.question) && r.score >= 0.7) Mastery.grant(t, 'understanding'); }
    else if(f){ f.tries++; f.methodIdx++; f.userAnswer = r.userAnswer; f.stem = fr.question.stem; f.correctAnswer = Quiz.answerText(fr.question); f.feedback = r.feedback || ''; f.errorType = r.errorType || f.errorType; Mastery.addMistake(t, fr.question, r, 'fix'); }
    Store.saveTopic(t); M.render();
  };

  /* ================= TEACH-BACK ================= */
  L.evalTeachback = async (btn) => {
    const t = Store.topic(btn.dataset.tid); const ta = document.getElementById('tb-text'); const text = ta ? ta.value.trim() : '';
    if(text.split(/\s+/).length < 25){ M.toast('Teach a bit more. Aim for at least 4–5 sentences, like a real mini-lesson.'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span> Checking your teaching…';
    let r;
    try {
      if(AI.ready()){
        const res = await AI.json(`A learner is teaching a concept back to you to prove mastery. Evaluate like a strict but kind examiner, adapted to their level.
${AI.learner(t)}
TOPIC: ${t.title}. CONCEPTS: ${t.concepts.map(c => c.name).join('; ')}
${t.source ? 'SOURCE EXCERPT: ' + t.source.text.slice(0, 6000) : ''}
LEARNER'S TEACHING: """${text.slice(0, 5000)}"""
Evaluate accuracy, completeness, reasoning, missing concepts and misconceptions.
Reply ONLY JSON {"score":0-1 (0.7+ = could genuinely teach it),"accuracy":"short","completeness":"short","reasoning":"short","missing":["…"],"misconceptions":["…"],"feedback":"2-3 sentences","followUp":"one probing question a student might ask"}`, { tier:'default', nocache:true });
        const score = M.clamp(Number(res.score) || 0, 0, 1);
        r = { ...res, score, correct: score >= 0.7 && !(res.misconceptions || []).length, graded:'ai' };
      } else {
        const b = Quiz.basicGrade({ keyPoints: t.builtin ? Pack[t.builtin].teachbackPoints : t.concepts.map(c => c.name) }, text);
        r = { score: b.score, correct: b.correct, missing: b.missing, misconceptions: [], feedback: '', graded:'basic', note: b.note };
      }
    } catch(e){ btn.disabled = false; btn.textContent = 'Check my teaching'; M.toast(e.message); return; }
    t.teachback = { text, result: r, at: Date.now() };
    if(r.correct) Mastery.grant(t, 'teachback', `score ${Math.round(r.score * 10)}/10`);
    Store.saveTopic(t); M.render();
  };

  /* ================= award + mastery sheet ================= */
  L.award = (t) => {
    if(Mastery.checkAward(t)){ Store.saveTopic(t); L.buildSheet(t); }
    M.render();
  };
  L.buildSheet = (t) => L.task('sheet-' + t.id, async () => {
    if(t.builtin && !AI.ready()){ t.sheet = Pack[t.builtin].sheet; saveSheetNote(t); Store.saveTopic(t); return; }
    const myMistakes = Store.state.mistakes.filter(m => m.topicId === t.id).slice(-8).map(m => `${m.conceptName}: ${m.errorType}`).join('; ');
    const r = await AI.json(`Create a ONE-PAGE mastery revision sheet. Concise, exam-useful, no filler.
${AI.learner(t)}
TOPIC: ${t.title}. CONCEPTS: ${t.concepts.map(c => c.name).join('; ')}
${t.lesson ? 'LESSON SUMMARY: ' + t.lesson.summary : ''}
${t.source ? 'SOURCE (authoritative): ' + t.source.text.slice(0, 12000) : ''}
THIS LEARNER'S OWN MISTAKES: ${myMistakes || 'none recorded'}
Reply ONLY JSON {"keyConcepts":["≤6"],"definitions":[{"term":"","meaning":""}],"formulas":["if any"],"facts":["≤5 important facts"],"mistakes":["common + this learner's mistakes, ≤5"],"tricky":["≤3 tricky points"],"hooks":["≤3 memory hooks"],"questions":["≤4 important exam questions"],"visual": VISUAL or null}
VISUAL = ${Visuals.SPEC_SHORT}`, { tier:'default', peek });
    t.sheet = r; if(t.sheet.visual && !Visuals.valid(t.sheet.visual)) delete t.sheet.visual;
    saveSheetNote(t); Store.saveTopic(t);
  });
  function saveSheetNote(t){
    const notes = Store.state.notes; const ex = notes.find(n => n.sheetOf === t.id);
    const s = t.sheet; const body = [
      s.keyConcepts && s.keyConcepts.length ? '## Key concepts\n' + s.keyConcepts.map(x => '- ' + x).join('\n') : '',
      s.definitions && s.definitions.length ? '## Definitions\n' + s.definitions.map(d => `- **${d.term}**: ${d.meaning}`).join('\n') : '',
      s.formulas && s.formulas.length ? '## Formulas\n' + s.formulas.map(x => '- ' + x).join('\n') : '',
      s.mistakes && s.mistakes.length ? '## Common mistakes\n' + s.mistakes.map(x => '- ' + x).join('\n') : '',
      s.hooks && s.hooks.length ? '## Memory hooks\n' + s.hooks.map(x => '- ' + x).join('\n') : '',
      s.questions && s.questions.length ? '## Important questions\n' + s.questions.map(x => '- ' + x).join('\n') : '',
    ].filter(Boolean).join('\n\n');
    if(ex){ ex.body = body; ex.updated = Date.now(); }
    else notes.unshift({ id: M.uid('n'), title: 'Mastery sheet: ' + t.title, body, sheetOf: t.id, topicId: t.id, created: Date.now(), updated: Date.now() });
    Store.touch('notes');
  }

  L.makeRefresher = (t) => L.task('refresher-' + t.id, async () => {
    if(!AI.ready()){ const s = t.sheet || (t.builtin && Pack[t.builtin].sheet); t.refresher = s ? '**Quick refresher**\n\n' + (s.keyConcepts || []).map(x => '- ' + x).join('\n') : 'Re-read your lesson summary, then take the recheck.'; Store.saveTopic(t); return; }
    const last = (t.review && t.review.history || []).slice(-1)[0];
    const missed = t.attempts.filter(a => a.stage === 'review' && !a.correct).slice(-4).map(a => Mastery.conceptName(t, a.concept));
    t.refresher = (await AI.text(`${AI.learner(t)}\nWrite a 150-word high-yield refresher for "${t.title}" for a learner who had mastered it but is forgetting. Focus on: ${missed.join(', ') || t.concepts.map(c => c.name).join(', ')}. Use retrieval cues (questions to self-test) not just rereading. Markdown.`, { tier:'default', cache:false }));
    Store.saveTopic(t);
  });

  /* ================= RENDERING ================= */
  M.route('topic', (view, id) => {
    const t = Store.topic(id);
    if(!t){ view.innerHTML = `<div class="stack"><h2>Lesson not found</h2><p class="muted">It may have been deleted.</p><div><a class="btn primary" href="#learn">Learn something new</a></div></div>`; return; }
    if(!t.planned && !L.inflight['plan-' + t.id] && !L.errors['plan-' + t.id] && (Store.state.profile.level || t.levelAsked)) {
      if(t.pathSeed && !t.path) t.path = { ...t.pathSeed };
      L.plan(t);
    }
    const tab = L.tab[t.id] || 'study';
    const st = Mastery.status(t);
    view.innerHTML = `<div class="stack">
      <div class="topic-head">
        <a class="btn ghost sm" href="#lessons" style="align-self:flex-start;padding-left:0">${M.icon.back} My lessons</a>
        <div class="row">${M.pill(st)}<span class="tag">${M.esc(t.subject)}</span>${t.level ? `<span class="tag">${M.esc(t.level)}</span>` : ''}${t.source ? `<span class="tag src">Source: ${M.esc(t.source.name)}</span>` : ''}${t.builtin ? '<span class="tag">Built-in lesson · works offline</span>' : ''}</div>
        <h1>${M.esc(t.title)}</h1>
        ${t.overview ? `<p class="muted">${M.esc(t.overview)}</p>` : ''}
        ${partsHTML(t)}
      </div>
      ${t.planned ? loopHTML(t) : ''}
      ${t.planned ? `<div class="chips" role="tablist">${[['study','Study'],['lesson','Lesson'],['proof','Mastery proof'],['sheet','Revision sheet'],['notes','Notes']].map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" data-action="topic-tab" data-tid="${t.id}" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}
      <div id="topicBody"></div>
    </div>`;
    const body = view.querySelector('#topicBody');
    if(!t.planned){ body.innerHTML = planHTML(t); return; }
    if(tab === 'lesson') renderLesson(body, t, false);
    else if(tab === 'proof') body.innerHTML = proofHTML(t);
    else if(tab === 'sheet') body.innerHTML = sheetHTML(t);
    else if(tab === 'notes') body.innerHTML = topicNotesHTML(t);
    else renderStudy(body, t);
  });

  function partsHTML(t){
    const p = t.path || t.pathSeed; if(!p) return '';
    return `<details class="fold"><summary>Course: ${M.esc(p.course)} · part ${p.index + 1} of ${p.parts.length}</summary><div class="stack-sm">${p.parts.map((x, i) => `<button class="btn sm ${i === p.index ? 'primary' : ''}" style="justify-content:flex-start" data-action="start-part" data-tid="${t.id}" data-i="${i}">${i + 1}. ${M.esc(x)}</button>`).join('')}<p class="hint">Master each part before moving to the next. Every part gets its own full mastery loop.</p></div></details>`;
  }

  function loopHTML(t){
    const ns = Mastery.nextStep(t).stage; const ev = t.ev || {};
    const done = { diagnose: t.diagnostic && t.diagnostic.done, learn: t.lessonProgress.done, practice: ev.practice, hard: ev.hard, fix: !t.pendingFix.length && t.attempts.some(a => a.stage === 'fix'), apply: ev.application, explain: ev.understanding, teachback: ev.teachback, challenge: ev.challenge, award: !!t.masteredAt, review: !!t.retainedAt };
    return `<div class="loop" aria-label="Your mastery loop">${LOOP.map(([k, l]) => `<span class="loop-step ${ns === k || (ns === 'refresh' && k === 'review') || (ns === 'recall' && k === 'award') ? 'now' : done[k] ? 'done' : ''} ${k === 'fix' && t.pendingFix.length ? 'fix' : ''}">${done[k] ? '✓ ' : ''}${l}</span>`).join('')}</div>`;
  }

  function planHTML(t){
    const e = L.errors['plan-' + t.id];
    if(e) return `<div class="stage-card">${M.errorHTML(e.message, 'retry-plan', 'Try again', `data-tid="${t.id}"`)}</div>`;
    if(!Store.state.profile.level && !t.levelAsked){
      const levels = ['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','College','Working professional'];
      return `<div class="stage-card"><div class="stage-title"><div class="ico">${M.icon.target}</div><div><h2>Which level should I teach at?</h2><p class="muted small">So explanations, examples and questions fit you. You can change this later in Settings.</p></div></div>
        <div class="chips">${levels.map(l => `<button class="chip" data-action="pick-level" data-tid="${t.id}" data-level="${l}">${l}</button>`).join('')}</div>
        <button class="btn ghost sm" data-action="pick-level" data-tid="${t.id}" data-level="">Skip. Work it out from my topic</button></div>`;
    }
    return `<div class="stage-card">${M.loadingHTML(t.source ? 'Reading your source…' : 'Analyzing topic…', t.source ? 'Detecting sections and core concepts from your material' : 'Choosing the core concepts and a quick 2-minute check')}</div>`;
  }

  function stageCard(icon, title, sub, inner){
    return `<div class="stage-card"><div class="stage-title"><div class="ico">${M.icon[icon] || M.icon.target}</div><div><h2>${M.esc(title)}</h2>${sub ? `<p class="muted small">${M.esc(sub)}</p>` : ''}</div></div>${inner}</div>`;
  }

  function lastRunHTML(t){
    const r = t.lastRun; if(!r || Date.now() - r.at > 30 * 60000) return '';
    const names = { practice:'Practice', hard:'Hard test', apply:'Application', explain:'Explanation', recall:'Recall check', challenge:'Unfamiliar challenge', review:'Revision check', refresh:'Recheck' };
    return `<div class="notice ${r.passed ? 'ok' : 'warn'}">${r.passed ? M.icon.check : M.icon.info}<div class="stack-sm"><div><b>${names[r.stage] || 'Round'}: ${r.right}/${r.n} ${r.passed ? '. Passed' : '. Not passed yet'}</b></div>${r.note ? `<div class="small">${M.esc(r.note)}</div>` : ''}${!r.passed && t.pendingFix.length ? '<div class="small">Your mistakes were analysed. Next: fix the weak concept with a different explanation and a fresh question.</div>' : ''}</div></div>`;
  }

  function renderStudy(body, t){
    const n = Mastery.nextStep(t);
    // an active run takes over
    if(t.run){ body.innerHTML = runHTML(t); return; }
    const key = 'run-' + t.id;
    if(L.inflight[key]){ body.innerHTML = stageCard('test', stageName(n.stage), '', M.loadingHTML(n.stage === 'challenge' ? 'Building your mastery challenge…' : n.stage === 'review' ? 'Preparing revision…' : 'Creating questions…', 'Fresh questions, never repeats of ones you’ve seen')); return; }
    let html = lastRunHTML(t);
    const err = L.errors[key];
    if(err) html += M.errorHTML(err.message, err.code === 'exhausted' ? 'go' : 'start-stage', err.code === 'exhausted' ? 'Open AI Coach' : 'Try again', `data-tid="${t.id}" data-stage="${n.stage}" data-to="coach"`);
    switch(n.stage){
      case 'diagnose': html += diagnoseHTML(t); break;
      case 'learn': body.innerHTML = html; renderLesson(body, t, true); return;
      case 'fix': html += fixHTML(t); break;
      case 'teachback': html += teachbackHTML(t); break;
      case 'award': html += stageCard('trophy', 'All seven proofs are in', 'You didn’t just finish this topic. You proved it.', `${evidenceListHTML(t)}<button class="btn gold block" data-action="award" data-tid="${t.id}">${M.icon.trophy} Claim mastery</button>`); break;
      case 'refresh': html += refreshHTML(t); break;
      case 'done': html += doneHTML(t); break;
      default: html += stageCard(stageIcon(n.stage), n.label, n.why, `${n.stage === 'hard' ? '<p class="small muted">3 carefully chosen questions: reasoning, multi-step and a misconception trap. Quality over quantity.</p>' : ''}${t.antiGuess && n.stage === 'practice' ? '<div class="notice warn small">' + M.icon.info + '<div>Anti-guessing is on: you did well on multiple choice but not on written answers, so this round is mostly “explain” questions.</div></div>' : ''}<button class="btn primary block" data-action="start-stage" data-tid="${t.id}" data-stage="${n.stage}">${M.icon.play} Start</button>`);
    }
    body.innerHTML = html;
  }
  const stageName = s => ({ practice:'Practice', hard:'Hard test', apply:'Apply it', explain:'Explain it', recall:'Quick recall', challenge:'Unfamiliar challenge', review:'Revision', refresh:'Recheck' })[s] || 'Questions';
  const stageIcon = s => ({ practice:'test', hard:'target', apply:'flask', explain:'chat', recall:'repeat', challenge:'spark', review:'repeat' })[s] || 'test';

  function diagnoseHTML(t){
    const d = t.diagnostic;
    const qs = d.questions; const answered = qs.filter(q => d.answers[q.id]).length;
    const q = qs.find(q => !d.answers[q.id]);
    if(!q) return stageCard('target', 'Check complete', '', `<button class="btn primary block" data-action="finish-diag" data-tid="${t.id}">See my starting point</button>`);
    return stageCard('target', 'Quick check: what do you already know?', `${answered + 1} of ${qs.length}. It's fine to be unsure. This makes the lesson fit you.`,
      `${Quiz.render(q, { idx: answered, total: qs.length })}<div class="row"><button class="btn primary" data-action="diag-check" data-tid="${t.id}" data-qid="${q.id}">Submit</button><button class="btn ghost" data-action="diag-idk" data-tid="${t.id}" data-qid="${q.id}">I don’t know yet</button></div>
      <button class="btn ghost sm" data-action="skip-diag" data-tid="${t.id}">Skip the check. I’m completely new to this</button>`);
  }

  function runHTML(t){
    const run = t.run, q = run.questions[run.idx], a = run.answered[q.id];
    const dots = run.questions.map((x, i) => { const r = run.answered[x.id]; return `<i class="${r ? (r.correct ? 'ok' : 'bad') : i === run.idx ? 'done' : ''}"></i>`; }).join('');
    const title = stageName(run.stage) + (run.stage === 'review' ? ': spaced retrieval' : '');
    let html = `<div class="row-between"><div class="progress-dots" aria-label="Progress">${dots}</div><button class="btn ghost sm" data-action="quit-run" data-tid="${t.id}">Leave</button></div>`;
    html += Quiz.render(q, { idx: run.idx, total: run.questions.length, locked: !!a, chosen: a ? a.userAnswer : undefined });
    if(a){
      html += Quiz.feedbackHTML(q, a);
      html += `<button class="btn primary block" data-action="run-next" data-tid="${t.id}">${run.idx < run.questions.length - 1 ? 'Next question' : 'See result'} ${M.icon.arrow}</button>`;
    } else html += `<button class="btn primary block" data-action="run-check" data-tid="${t.id}">Check answer</button>`;
    return stageCard(stageIcon(run.stage), title, run.stage === 'challenge' ? 'A problem you haven’t seen. Use what you know in a new way.' : '', html);
  }

  function fixHTML(t){
    const f = t.pendingFix[0]; const fr = t.fixRun;
    const cname = Mastery.conceptName(t, f.concept);
    if(L.inflight['fix-' + t.id]) return stageCard('target', 'Fixing: ' + cname, '', M.loadingHTML(f.tries ? 'Trying a different way to explain it…' : 'Finding your weak concept…', 'Reteach → then a completely fresh question on the same idea'));
    const err = L.errors['fix-' + t.id];
    if(!fr || fr.concept !== f.concept){
      return stageCard('target', 'Fix your weak spot: ' + cname, `Mistake type: ${f.errorType}${f.misses > 1 ? ` · missed ${f.misses}×` : ''}`,
        `${err ? M.errorHTML(err.message, 'make-fix', 'Try again', `data-tid="${t.id}"`) : ''}
        <div class="example small"><div class="eyebrow">What went wrong</div><div><b>Question:</b> ${M.esc(f.stem)}</div><div><b>Your answer:</b> ${M.esc(f.userAnswer || '—')}</div><div><b>Correct:</b> ${M.esc(f.correctAnswer)}</div></div>
        ${f.tries >= 3 ? `<div class="notice warn small">${M.icon.info}<div>This one is stubborn, and that's normal. Try the AI Coach for a back-and-forth explanation, then come back for a fresh question.</div></div>` : ''}
        <div class="row"><button class="btn primary" data-action="make-fix" data-tid="${t.id}">${f.tries ? 'Explain it a different way' : 'Reteach me'}</button>${f.tries >= 2 ? `<a class="btn" href="#coach" data-action="coach-topic" data-tid="${t.id}">Ask the Coach</a>` : ''}</div>`);
    }
    let inner = `${fr.diagnosis ? `<div class="notice small">${M.icon.info}<div><b>Diagnosis:</b> ${M.esc(fr.diagnosis)}</div></div>` : ''}
      <div class="tiny muted">Teaching method: ${M.esc(fr.method)}${f.tries ? ` · attempt ${f.tries + 1}` : ''}</div>
      <div class="prose">${M.md(fr.reteach)}</div>
      ${fr.visual ? `<div class="player" style="box-shadow:none"><div class="stage">${Visuals.render(fr.visual)}</div></div>` : ''}
      <hr class="divider"><div class="eyebrow">Fresh retest: same idea, new question</div>
      ${Quiz.render(fr.question, { locked: fr.phase === 'result' && !!fr.result, chosen: fr.result ? fr.result.userAnswer : undefined })}`;
    if(fr.phase === 'result' && fr.result){
      inner += Quiz.feedbackHTML(fr.question, fr.result, { selfTag:false });
      inner += fr.result.correct ? `<div class="notice ok">${M.icon.check}<div><b>Fixed.</b> “${M.esc(cname)}” is cleared from your weak list. Next questions will be harder.</div></div><button class="btn primary block" data-action="fix-continue" data-tid="${t.id}">Continue ${M.icon.arrow}</button>`
        : `<button class="btn primary block" data-action="make-fix" data-tid="${t.id}">Try a different explanation</button>`;
    } else inner += `<button class="btn primary block" data-action="check-fix" data-tid="${t.id}">Check answer</button>`;
    return stageCard('target', 'Fix: ' + cname, t.pendingFix.length > 1 ? `${t.pendingFix.length} weak spots to fix` : '', inner);
  }

  function teachbackHTML(t){
    const tb = t.teachback;
    let inner = `<p>“<b>Teach ${M.esc(t.title)} to me as if you are the teacher.</b>” Explain the main ideas, give an example, and warn me about a common mistake.</p>
      <textarea class="textarea" id="tb-text" rows="9" placeholder="Start like a teacher: “Today we’re going to learn…”">${tb && !tb.result.correct ? M.esc(tb.text) : ''}</textarea>
      <div class="hint">Typed only: this page isn’t allowed to use your microphone. Tip: your phone keyboard’s dictation button works for speaking your answer.</div>`;
    if(tb && tb.result && !tb.result.correct){
      const r = tb.result;
      inner = `<div class="feedback partial"><div class="fh">Not quite teacher-ready yet</div>${r.feedback ? `<div>${M.esc(r.feedback)}</div>` : ''}${r.missing && r.missing.length ? `<div class="small"><b>Missing:</b> ${r.missing.map(M.esc).join('; ')}</div>` : ''}${r.misconceptions && r.misconceptions.length ? `<div class="small"><b>Misconceptions:</b> ${r.misconceptions.map(M.esc).join('; ')}</div>` : ''}${r.followUp ? `<div class="small"><b>A student might ask:</b> ${M.esc(r.followUp)}</div>` : ''}${r.note ? `<div class="tiny muted">${M.esc(r.note)}</div>` : ''}</div>` + inner;
    }
    inner += `<button class="btn primary block" data-action="eval-tb" data-tid="${t.id}">Check my teaching</button>`;
    return stageCard('teacher', 'Teach it back', 'If you can teach it, you know it.', inner);
  }

  function refreshHTML(t){
    const k = 'refresher-' + t.id;
    if(!t.refresher && !L.inflight[k]) L.makeRefresher(t);
    if(L.inflight[k]) return stageCard('repeat', 'Refresh: ' + t.title, '', M.loadingHTML('Preparing revision…', 'A short refresher aimed at what faded'));
    return stageCard('repeat', 'This topic is AT RISK', t.atRiskReason === 'overdue' ? 'It has been a long time since your last check. Your history is kept, this is just a refresh.' : 'Your last review showed some forgetting. Your history is kept, this is just a refresh.',
      `${L.errors[k] ? M.errorHTML(L.errors[k].message, 'retry-refresher', 'Try again', `data-tid="${t.id}"`) : ''}<div class="prose">${M.md(t.refresher || '')}</div><button class="btn primary block" data-action="start-stage" data-tid="${t.id}" data-stage="refresh">Take the recheck (2 questions)</button>`);
  }

  function doneHTML(t){
    const pl = Mastery.percentLabel(t);
    return stageCard('trophy', t.retainedAt ? 'Mastered and retained · 102%' : 'Mastered · 100%', pl.note,
      `${evidenceListHTML(t)}
      <div class="notice">${M.icon.calendar}<div>Next spaced review: <b>${t.review ? M.relDay(t.review.due) : '—'}</b>. It’ll show up on your dashboard. Retrieval, not rereading.</div></div>
      <div class="row"><button class="btn" data-action="topic-tab" data-tid="${t.id}" data-tab="sheet">Open revision sheet</button><button class="btn" data-action="start-stage" data-tid="${t.id}" data-stage="review">Revise early</button>${t.path && t.path.index < t.path.parts.length - 1 ? `<button class="btn primary" data-action="start-part" data-tid="${t.id}" data-i="${t.path.index + 1}">Next part: ${M.esc(t.path.parts[t.path.index + 1])}</button>` : ''}</div>`);
  }

  function evidenceListHTML(t){
    return `<div class="ev-list">${Mastery.EVIDENCE.map(e => { const on = t.ev[e.key]; return `<div class="ev-row ${on ? 'on' : ''}"><span class="mark">${on ? '✓' : ''}</span><div><div>${e.label}</div><div class="why">${on ? 'Shown ' + M.fmtDate(on.at) + (on.detail ? ' · ' + M.esc(on.detail) : '') : e.how}</div></div></div>`; }).join('')}${t.retainedAt ? `<div class="ev-row on"><span class="mark" style="background:var(--gold)">+</span><div><div>Retention (102%)</div><div class="why">Passed a spaced review on ${M.fmtDate(t.retainedAt)}</div></div></div>` : ''}</div>`;
  }

  /* ---------- lesson (teacher + reading) ---------- */
  function renderLesson(body, t, inStudy){
    const k = 'lesson-' + t.id;
    if(!t.lesson && !L.inflight[k] && !L.errors[k]) L.buildLesson(t);
    if(L.inflight[k] || (!t.lesson && !L.errors[k])){ body.insertAdjacentHTML('beforeend', stageCard('book', 'Your lesson', '', M.loadingHTML('Building your lesson…', 'Basic → Mastery, personalised from your check. About 30–60 seconds.'))); return; }
    if(!t.lesson){ body.insertAdjacentHTML('beforeend', stageCard('book', 'Your lesson', '', M.errorHTML(L.errors[k].message, 'retry-lesson', 'Try again', `data-tid="${t.id}"`))); return; }
    const mode = L.readMode[t.id] || 'teacher';
    const d = t.diagnostic && t.diagnostic.result;
    const qc = t.lesson.qc;
    let html = '';
    if(inStudy && d) html += `<div class="notice small">${M.icon.info}<div>Starting point: ${d.right}/${d.n} on the check.${d.weak.length ? ' Extra care on: ' + d.weak.map(id => M.esc(Mastery.conceptName(t, id))).join(', ') + '.' : ''}${d.known.length ? ' Kept brief: ' + d.known.map(id => M.esc(Mastery.conceptName(t, id))).join(', ') + '.' : ''}</div></div>`;
    html += `<div class="chips"><button class="chip ${mode === 'teacher' ? 'on' : ''}" data-action="lesson-mode" data-tid="${t.id}" data-mode="teacher">${M.icon.teacher} Teacher lesson</button><button class="chip ${mode === 'read' ? 'on' : ''}" data-action="lesson-mode" data-tid="${t.id}" data-mode="read">${M.icon.book} Read & check</button></div>`;
    if(qc) html += `<div class="qc">${qcChip(qc.concepts[0] === qc.concepts[1], `${qc.concepts[0]}/${qc.concepts[1]} concepts covered`)}${qcChip(qc.levels >= 3, `${qc.levels} levels`)}${qcChip(qc.checkpoints[0] >= Math.min(3, qc.checkpoints[1]), `${qc.checkpoints[0]} checkpoints`)}${qc.quotes ? qcChip(qc.quotes[0] === qc.quotes[1], `${qc.quotes[0]}/${qc.quotes[1]} source quotes verified`) : ''}${qc.missing && qc.missing.length ? `<span class="tag warn">Not covered: ${M.esc(qc.missing.join(', '))}. Ask the Coach</span>` : ''}</div>`;
    html += `<div id="lessonMain"></div>`;
    const cps = t.lesson.sections.filter(s => s.checkpoint); const answered = Math.min(cps.length, Object.keys(t.lessonProgress.checkpoints).length);
    if(!t.lessonProgress.done) html += `<div class="card soft stack-sm"><div class="row-between"><b id="cpCount">Lesson checkpoints: ${answered}/${cps.length}</b><span class="tiny muted">Answer them in “Read & check” or during the teacher lesson</span></div><div class="score-bar"><i id="cpBar" style="width:${cps.length ? answered / cps.length * 100 : 100}%"></i></div><button class="btn primary block" id="finishLesson" data-action="finish-lesson" data-tid="${t.id}" ${answered < Math.min(cps.length, Math.ceil(cps.length * 0.6)) ? 'disabled' : ''}>I’ve learned it. Start proving it ${M.icon.arrow}</button><div class="hint">Finishing the lesson doesn’t mean mastery. Next you’ll prove it with practice, a hard test, teach-back and a challenge.</div></div>`;
    body.insertAdjacentHTML('beforeend', html);
    const main = body.querySelector('#lessonMain');
    if(mode === 'teacher') renderTeacher(main, t); else main.innerHTML = readingHTML(t);
  }
  L.updateCp = (t) => {
    const cps = t.lesson.sections.filter(s => s.checkpoint); const answered = Math.min(cps.length, Object.keys(t.lessonProgress.checkpoints).length);
    const c = document.getElementById('cpCount'), b = document.getElementById('cpBar'), f = document.getElementById('finishLesson');
    if(c) c.textContent = `Lesson checkpoints: ${answered}/${cps.length}`; if(b) b.style.width = (cps.length ? answered / cps.length * 100 : 100) + '%';
    if(f) f.disabled = answered < Math.min(cps.length, Math.ceil(cps.length * 0.6));
  };
  const qcChip = (ok, text) => `<span class="tag ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} ${M.esc(text)}</span>`;

  function renderTeacher(main, t){
    const k = 'scenes-' + t.id;
    if(!t.scenes){
      if(L.inflight[k]){ main.innerHTML = `<div class="card">${M.loadingHTML('Preparing your teacher lesson…', 'Scenes, board visuals matched to the subject, narration and checkpoints')}</div>`; return; }
      main.innerHTML = `<div class="player"><div class="stage" style="display:grid;place-items:center;padding:16px"><div style="text-align:center;max-width:440px" class="stack-sm"><div class="chalk" style="font-size:1.6rem;color:var(--chalk-y)">${M.esc(t.title)}</div><div style="color:var(--chalk-dim)">A narrated board lesson by ${Video.TEACHER.name}: visuals that match this subject, a natural voice (your browser’s speech) and checkpoints that pause for you.</div>${L.errors[k] ? `<div style="color:var(--chalk-r)">${M.esc(L.errors[k].message)}</div>` : ''}<div><button class="btn primary" data-action="build-scenes" data-tid="${t.id}">${M.icon.play} Prepare teacher lesson</button></div></div></div></div>`;
      return;
    }
    main.innerHTML = `<div id="playerHost"></div><div class="row" style="margin-top:10px"><button class="btn sm" data-action="copy-script" data-tid="${t.id}">${M.icon.copy} Copy script for HeyGen (optional, paid)</button><button class="btn ghost sm" data-action="rebuild-scenes" data-tid="${t.id}">Remake lesson</button></div><p class="hint">Want a real human presenter video? Paste the script into HeyGen or a similar tool. That’s optional and paid. This board lesson is free.</p>`;
    Video.mount(main.querySelector('#playerHost'), t, t.scenes, {
      onCheckpoint(q, r){ const tt = Store.topic(t.id); Mastery.record(tt, q, r, 'checkpoint'); tt.lessonProgress.started = true; tt.lessonProgress.checkpoints[q.id] = r.correct ? 1 : 0; Store.saveTopic(tt); L.updateCp(tt); },
      onFinish(){ M.toast('Lesson finished. Answer any remaining checkpoints, then start proving it.'); },
    });
  }

  function readingHTML(t){
    return `<div class="card stack">${t.lesson.sections.map((s, i) => {
      const cp = s.checkpoint; const done = cp && t.lessonProgress.checkpoints[cp.id] !== undefined;
      return `<section class="lesson-sec"><div class="row"><span class="level-tag">${M.esc(s.level)}</span>${t.source ? (s.origin === 'source' ? '<span class="tag src">Source content</span>' : s.origin === 'unverified' ? '<span class="tag warn">Quote not found in your source: treat as extra</span>' : '<span class="tag extra">Extra explanation</span>') : ''}</div>
        <h3>${M.esc(s.heading)}</h3>
        ${s.origin === 'source' && s.sourceQuote ? `<div class="src-quote">“${M.esc(s.sourceQuote)}” <span class="tag ok">✓ verified in your source</span></div>` : ''}
        <div class="prose">${M.md(s.body)}</div>
        ${s.example ? `<div class="example"><div class="eyebrow">Example</div><div class="prose">${M.md(s.example)}</div></div>` : ''}
        ${cp ? `<div class="card soft" data-cp-wrap="${cp.id}"><div class="eyebrow" style="margin-bottom:8px">Checkpoint${done ? (t.lessonProgress.checkpoints[cp.id] ? ' · ✓ correct' : ' · answered') : ''}</div>${done ? Quiz.stemHTML(cp) : Quiz.render(cp)}${done ? `<div class="small muted" style="margin-top:8px"><b>Answer:</b> ${M.esc(Quiz.answerText(cp))}. ${M.esc(cp.explanation || '')}</div>` : `<div style="margin-top:10px"><button class="btn sm primary" data-action="cp-check" data-tid="${t.id}" data-sec="${i}">Check</button></div>`}</div>` : ''}
      </section>`; }).join('')}
      ${t.lesson.summary ? `<section class="lesson-sec"><div class="eyebrow">Recap</div><div class="prose">${M.md(t.lesson.summary)}</div></section>` : ''}
    </div>`;
  }

  function proofHTML(t){
    const pl = Mastery.percentLabel(t);
    const recent = t.attempts.slice(-12).reverse();
    const weak = Mastery.weakConcepts(t);
    return `<div class="grid grid-2">
      <div class="card stack"><div class="row-between"><h2>Mastery proof</h2><div class="kpi" style="text-align:right"><span class="v">${pl.v}</span><span class="k">${M.esc(pl.note)}</span></div></div>${evidenceListHTML(t)}<p class="hint">No percentages from clicks or watch-time. Each proof needs a specific kind of correct answer. 102% = mastered + passed a spaced review later.</p></div>
      <div class="stack">
        <div class="card stack-sm"><h3>Concepts</h3>${t.concepts.map(c => { const s = t.conceptStats[c.id]; const w = weak.find(x => x.id === c.id); return `<div class="row-between small"><span>${M.esc(c.name)}</span><span class="tag ${w ? 'bad' : s && s.right ? 'ok' : ''}">${w ? 'weak' : s && s.right ? 'solid' : 'untested'}</span></div>`; }).join('')}</div>
        <div class="card stack-sm"><h3>Recent answers</h3>${recent.length ? recent.map(a => `<div class="row small" style="flex-wrap:nowrap"><span class="tag ${a.correct ? 'ok' : 'bad'}">${a.correct ? '✓' : '✗'}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${M.esc(a.stem || '')}</span><span class="tiny muted">${M.esc(a.stage)}</span></div>`).join('') : '<p class="muted small">No answers yet.</p>'}</div>
        ${t.review && t.review.history && t.review.history.length ? `<div class="card stack-sm"><h3>Revision history</h3>${t.review.history.map(h => `<div class="row-between small"><span>${M.fmtDate(h.at)}</span><span class="tag ${h.passed ? 'ok' : 'bad'}">${h.right}/${h.n} ${h.passed ? 'retained' : 'faded'}</span></div>`).join('')}</div>` : ''}
        <button class="btn danger sm" data-action="delete-topic" data-tid="${t.id}" style="align-self:flex-start">${M.icon.trash} Delete this lesson</button>
      </div></div>`;
  }

  function sheetHTML(t){
    const k = 'sheet-' + t.id;
    if(!t.masteredAt && !t.sheet) return `<div class="card">${M.emptyHTML('note', 'Your one-page revision sheet unlocks when you master this topic.<br>It includes the mistakes <b>you</b> actually made.')}</div>`;
    if(L.inflight[k]) return `<div class="card">${M.loadingHTML('Creating your one-page mastery sheet…')}</div>`;
    if(!t.sheet) return `<div class="card">${L.errors[k] ? M.errorHTML(L.errors[k].message, 'build-sheet', 'Try again', `data-tid="${t.id}"`) : `<button class="btn primary" data-action="build-sheet" data-tid="${t.id}">Create revision sheet</button>`}</div>`;
    const s = t.sheet; const list = (title, arr) => arr && arr.length ? `<div class="stack-sm"><h3>${title}</h3><ul>${arr.map(x => `<li>${M.esc(x)}</li>`).join('')}</ul></div>` : '';
    return `<div class="card msheet"><div class="row-between"><div><div class="eyebrow">One-page mastery sheet</div><h2>${M.esc(t.title)}</h2></div><button class="btn sm" data-action="copy-sheet" data-tid="${t.id}">${M.icon.copy} Copy</button></div>
      <div class="grid grid-2">${list('Key concepts', s.keyConcepts)}${s.definitions && s.definitions.length ? `<div class="stack-sm"><h3>Definitions</h3><ul>${s.definitions.map(d => `<li><b>${M.esc(d.term)}</b>: ${M.esc(d.meaning)}</li>`).join('')}</ul></div>` : ''}${list('Formulas', s.formulas)}${list('Important facts', s.facts)}${list('Common mistakes', s.mistakes)}${list('Tricky points', s.tricky)}${list('Memory hooks', s.hooks)}${list('Important questions', s.questions)}</div>
      ${s.visual ? `<div class="player" style="box-shadow:none"><div class="stage">${Visuals.render(s.visual)}</div></div>` : ''}</div>`;
  }

  function topicNotesHTML(t){
    const n = Store.state.notes.find(n => n.topicId === t.id && !n.sheetOf);
    return `<div class="card stack-sm"><label class="label" for="tnote">My notes for this topic</label><textarea class="textarea" id="tnote" rows="10" data-tid="${t.id}" placeholder="Write in your own words. Writing it yourself helps you remember.">${n ? M.esc(n.body) : ''}</textarea><div class="hint">Saved automatically.</div></div>`;
  }

  document.addEventListener('input', M.debounce((e) => {
    if(e.target && e.target.id === 'tnote'){
      const tid = e.target.dataset.tid; const t = Store.topic(tid); if(!t) return;
      let n = Store.state.notes.find(n => n.topicId === tid && !n.sheetOf);
      if(!n){ n = { id: M.uid('n'), title: 'Notes: ' + t.title, body: '', topicId: tid, created: Date.now() }; Store.state.notes.unshift(n); }
      n.body = e.target.value; n.updated = Date.now(); Store.touch('notes');
    }
  }, 500));

  /* ================= actions ================= */
  const T = el => Store.topic(el.dataset.tid);
  M.action('topic-tab', el => { L.tab[el.dataset.tid] = el.dataset.tab; M.render(); });
  M.action('lesson-mode', el => { L.readMode[el.dataset.tid] = el.dataset.mode; M.render(); });
  M.action('retry-plan', el => { const t = T(el); delete L.errors['plan-' + t.id]; L.plan(t); M.render(); });
  M.action('retry-lesson', el => { const t = T(el); delete L.errors['lesson-' + t.id]; L.buildLesson(t); M.render(); });
  M.action('retry-refresher', el => { const t = T(el); delete L.errors['refresher-' + t.id]; L.makeRefresher(t); M.render(); });
  M.action('pick-level', el => { const t = T(el); const lv = el.dataset.level; if(lv){ Store.state.profile.level = lv; Store.touch('profile'); t.level = lv; } t.levelAsked = true; Store.saveTopic(t); L.plan(t); M.render(); });
  M.action('start-part', el => L.startPart(T(el), Number(el.dataset.i)));
  M.action('diag-check', async el => {
    const t = T(el); const q = t.diagnostic.questions.find(q => q.id === el.dataset.qid); const root = el.closest('.stage-card');
    const ans = Quiz.readAnswer(root, q); if(ans === null){ M.toast('Answer, or tap “I don’t know yet”.'); return; }
    el.disabled = true; el.textContent = 'Checking…';
    let r; try { r = await Quiz.grade(q, ans, t); } catch(e){ r = Quiz.basicGrade(q, ans); }
    t.diagnostic.answers[q.id] = { correct: r.correct, score: r.score }; Mastery.record(t, q, r, 'diagnose'); t.lessonProgress.started = true;
    Store.saveTopic(t); M.render();
  });
  M.action('diag-idk', el => { const t = T(el); const q = t.diagnostic.questions.find(q => q.id === el.dataset.qid); t.diagnostic.answers[q.id] = { correct:false, idk:true }; t.lessonProgress.started = true; Store.saveTopic(t); M.render(); });
  M.action('finish-diag', el => L.finishDiagnostic(T(el)));
  M.action('skip-diag', el => { const t = T(el); t.diagnostic = t.diagnostic || { questions:[], answers:{} }; t.diagnostic.done = true; t.diagnostic.skipped = true; t.diagnostic.result = { right:0, n:0, known:[], weak:[] }; t.lessonProgress.started = true; Store.saveTopic(t); M.render(); });
  M.action('cp-check', async el => {
    const t = T(el); const sec = t.lesson.sections[Number(el.dataset.sec)]; const q = sec.checkpoint; const root = el.closest('[data-cp-wrap]');
    const ans = Quiz.readAnswer(root, q); if(ans === null){ M.toast('Answer the checkpoint first.'); return; }
    el.disabled = true; el.textContent = 'Checking…';
    let r; try { r = await Quiz.grade(q, ans, t); } catch(e){ el.disabled = false; el.textContent = 'Check'; M.toast(e.message); return; }
    Mastery.record(t, q, r, 'checkpoint'); t.lessonProgress.started = true; t.lessonProgress.checkpoints[q.id] = r.correct ? 1 : 0; Store.saveTopic(t);
    if(q.options) Quiz.lockOptions(root, q, ans);
    el.parentElement.outerHTML = Quiz.feedbackHTML(q, r, { selfTag:false });
    L.updateCp(t);
  });
  M.action('finish-lesson', el => { const t = T(el); t.lessonProgress.done = true; t.lessonProgress.doneAt = Date.now(); Store.saveTopic(t); M.render(); });
  M.action('build-scenes', el => { L.buildScenes(T(el)); M.render(); });
  M.action('rebuild-scenes', el => { const t = T(el); if(t.builtin) return M.toast('The built-in lesson has a fixed script.'); t.scenes = null; Store.saveTopic(t); L.buildScenes(t); M.render(); });
  M.action('copy-script', el => { const t = T(el); M.copy(Video.script(t, t.scenes)); });
  M.action('start-stage', el => { const t = T(el); L.makeRun(t, el.dataset.stage); M.render(); });
  M.action('run-check', el => L.checkRun(el));
  M.action('run-next', el => L.nextRun(el.dataset.tid));
  M.action('quit-run', el => { const t = T(el); t.run = null; Store.saveTopic(t); M.render(); });
  M.action('make-fix', el => { const t = T(el); t.fixRun = null; delete L.errors['fix-' + t.id]; L.makeFix(t); M.render(); });
  M.action('check-fix', el => L.checkFix(el));
  M.action('fix-continue', el => { const t = T(el); t.fixRun = null; Store.saveTopic(t); M.render(); });
  M.action('eval-tb', el => L.evalTeachback(el));
  M.action('award', el => L.award(T(el)));
  M.action('build-sheet', el => { L.buildSheet(T(el)); M.render(); });
  M.action('copy-sheet', el => { const n = Store.state.notes.find(n => n.sheetOf === el.dataset.tid); M.copy(n ? n.title + '\n\n' + n.body : ''); });
  M.action('delete-topic', el => {
    if(el.dataset.confirm !== '1'){ el.dataset.confirm = '1'; el.innerHTML = `${M.icon.trash} Tap again to delete permanently`; setTimeout(() => { if(el.isConnected){ el.dataset.confirm = ''; el.innerHTML = `${M.icon.trash} Delete this lesson`; } }, 4000); return; }
    Store.removeTopic(el.dataset.tid); M.toast('Lesson deleted'); M.go('lessons');
  });
  M.action('coach-topic', el => { Coach.setContext(el.dataset.tid); M.go('coach'); });
})();
