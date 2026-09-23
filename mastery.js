/* mastery.js — Mastery Engine + Progress Engine.
   Mastery is never a click: it is the sum of seven kinds of evidence, each earned by a specific kind of answer. */
(function(){
  const EVIDENCE = [
    { key:'recall',        short:'Recall',       label:'Recall',               how:'Answered quick-recall checks correctly' },
    { key:'understanding', short:'Explain',      label:'Understanding',        how:'Explained the idea in your own words (graded, not multiple choice)' },
    { key:'practice',      short:'Practice',     label:'Practice',             how:'Passed a mixed practice set, including a written answer' },
    { key:'hard',          short:'Hard',         label:'Hard test',            how:'Passed a hard test with reasoning and multi-step questions' },
    { key:'application',   short:'Apply',        label:'Application',          how:'Solved a real-life / case-based problem' },
    { key:'teachback',     short:'Teach',        label:'Teach-back',           how:'Taught the concept back accurately' },
    { key:'challenge',     short:'Transfer',     label:'Unfamiliar challenge', how:'Solved a new problem you had never seen' },
  ];
  const ERROR_TYPES = ['concept misunderstanding','factual error','calculation error','careless error','misreading','incomplete answer','wrong method','weak reasoning','terminology problem','diagram error','application failure','memory failure','misconception'];
  const STATUS = {
    'not-started': 'Not started', learning:'Learning', practicing:'Practicing', unstable:'Unstable', near:'Near mastery', mastered:'Mastered', review:'Review due', risk:'At risk'
  };
  const OPEN_TYPES = ['short','long','explain','case','teachback','challenge','application','data','diagram'];

  const Mastery = window.Mastery = {
    EVIDENCE, ERROR_TYPES, OPEN_TYPES,

    newTopic(fields){
      return Object.assign({
        id: M.uid('t'), title:'Untitled topic', subject:'General', subjectKind:'general', level: Store.state.profile.level || '',
        created: Date.now(), lastActive: Date.now(), source:null, builtin:null,
        concepts: [], diagnostic: null, lesson: null, lessonProgress: { started:false, checkpoints:{}, done:false }, scenes: null,
        ev: {}, attempts: [], asked: [], pendingFix: [], conceptStats: {}, run: null,
        teachback: null, challenge: null, masteredAt: null, retainedAt: null,
        review: null, atRisk: false, sheet: null, antiGuess: 0, related: []
      }, fields);
    },

    evCount(t){ return EVIDENCE.filter(e => t.ev && t.ev[e.key]).length; },
    isMastered(t){ return !!t.masteredAt; },

    status(t){
      const key = this.statusKey(t);
      return { key, label: STATUS[key] };
    },
    statusKey(t){
      if(t.masteredAt){
        if(t.atRisk) return 'risk';
        if(t.review && t.review.due <= Date.now()) return 'review';
        return 'mastered';
      }
      const n = t.attempts.length;
      if(!n && !(t.lessonProgress && t.lessonProgress.started)) return 'not-started';
      const recent = t.attempts.slice(-6);
      const acc = recent.length ? recent.filter(a => a.correct).length / recent.length : 1;
      if(t.pendingFix.length >= 2 || (recent.length >= 4 && acc < 0.5)) return 'unstable';
      if(this.evCount(t) >= 5) return 'near';
      if(t.attempts.some(a => ['practice','hard','fix','apply'].includes(a.stage))) return 'practicing';
      return 'learning';
    },

    /* 100% = demonstrated mastery. 102% = mastery + passed a spaced retention check (after ≥1 day). */
    percentLabel(t){
      if(t.masteredAt && t.retainedAt) return { v:'102%', note:'Mastered and retained on a later review' };
      if(t.masteredAt) return { v:'100%', note:'All seven proofs shown. 102% unlocks after a passed spaced review' };
      return { v: `${this.evCount(t)}/7`, note:'proofs of mastery shown' };
    },

    nextStep(t){
      const ev = t.ev || {};
      if(!t.diagnostic || !t.diagnostic.done) return { stage:'diagnose', label:'Take the 2-minute check', why:'Find what you already know so the lesson fits you.' };
      if(!t.lessonProgress || !t.lessonProgress.done) return { stage:'learn', label: t.lesson ? 'Continue the lesson' : 'Start the lesson', why:'Learn it step by step, from basics to advanced, with quick checks.' };
      if(t.pendingFix.length) return { stage:'fix', label:'Fix your weak spot', why:`You missed “${this.conceptName(t, t.pendingFix[0].concept)}”. Relearn it a different way, then prove it with a fresh question.` };
      if(!ev.practice) return { stage:'practice', label:'Practice', why:'Mixed questions, including one written answer.' };
      if(!ev.hard) return { stage:'hard', label:'Take the hard test', why:'Reasoning, multi-step and misconception questions.' };
      if(!ev.application) return { stage:'apply', label:'Apply it', why:'Use the idea on a real-life situation.' };
      if(!ev.understanding) return { stage:'explain', label:'Explain it in your words', why:'Guessing can’t fake this one.' };
      if(!ev.teachback) return { stage:'teachback', label:'Teach it back', why:'Teach the concept to me as if you are the teacher.' };
      if(!ev.challenge) return { stage:'challenge', label:'Unfamiliar challenge', why:'A new problem you haven’t seen. The final proof.' };
      if(!ev.recall) return { stage:'recall', label:'Quick recall check', why:'Two fast recall questions.' };
      if(!t.masteredAt) return { stage:'award', label:'Claim mastery', why:'All proofs are in.' };
      if(t.atRisk) return { stage:'refresh', label:'Refresh this topic', why:'Your last check showed forgetting. Quick refresh, then recheck.' };
      if(t.review && t.review.due <= Date.now()) return { stage:'review', label:'Revise now', why:'Spaced retrieval keeps mastery from fading.' };
      return { stage:'done', label:'Mastered', why:`Next review ${t.review ? M.relDay(t.review.due) : 'scheduled'}.` };
    },

    conceptName(t, cid){ const c = (t.concepts || []).find(c => c.id === cid); return c ? c.name : (cid || 'this concept'); },

    /* ---------- recording answers ---------- */
    record(t, q, result, stage){
      const a = { id: q.id, stage, type: q.type, difficulty: q.difficulty || 'medium', concept: q.concept, correct: !!result.correct, score: result.score ?? (result.correct ? 1 : 0), at: Date.now(), errorType: result.correct ? null : (result.errorType || 'concept misunderstanding'), stem: String(q.stem || '').slice(0, 220) };
      t.attempts.push(a); if(t.attempts.length > 300) t.attempts = t.attempts.slice(-300);
      if(q.stem){ t.asked.push(String(q.stem).slice(0, 200)); if(t.asked.length > 120) t.asked = t.asked.slice(-120); }
      const cs = t.conceptStats[q.concept] = t.conceptStats[q.concept] || { right:0, wrong:0, mcqRight:0, openRight:0, openWrong:0 };
      const open = OPEN_TYPES.includes(q.type);
      if(a.correct){ cs.right++; if(open) cs.openRight++; else cs.mcqRight++; }
      else { cs.wrong++; if(open) cs.openWrong++; }
      // anti-guessing signal: objective answers right, written answers wrong on the same concept
      if(cs.mcqRight >= 2 && cs.openWrong >= 1 && cs.openRight === 0) t.antiGuess = Math.max(t.antiGuess || 0, 1);
      if(open && a.correct && cs.openRight >= 1) t.antiGuess = 0;
      // recall evidence (easy / recall items)
      if(a.correct && (a.difficulty === 'easy' || ['checkpoint','diagnose','recall','review'].includes(stage))){
        const n = t.attempts.filter(x => x.correct && (x.difficulty === 'easy' || ['checkpoint','diagnose','recall','review'].includes(x.stage))).length;
        if(n >= 2) this.grant(t, 'recall');
      }
      if(open && a.score >= 0.7 && ['practice','hard','explain','fix','apply','review'].includes(stage)) this.grant(t, 'understanding');
      if(!a.correct && !['diagnose','checkpoint'].includes(stage)){
        this.addFix(t, q, result);
        this.addMistake(t, q, result, stage);
      }
      return a;
    },

    grant(t, key, detail){ if(!t.ev[key]) t.ev[key] = { at: Date.now(), detail: detail || '' }; },

    addFix(t, q, result){
      if(t.pendingFix.some(f => f.concept === q.concept)) { const f = t.pendingFix.find(f => f.concept === q.concept); f.misses = (f.misses||1) + 1; return; }
      t.pendingFix.push({ concept: q.concept, errorType: result.errorType || 'concept misunderstanding', stem: q.stem, userAnswer: result.userAnswer || '', correctAnswer: Quiz.answerText(q), explanation: q.explanation || '', feedback: result.feedback || '', tries: 0, methodIdx: 0, misses: 1, at: Date.now(), difficulty: q.difficulty || 'medium' });
    },

    addMistake(t, q, result, stage){
      Store.state.mistakes.push({
        id: M.uid('m'), topicId: t.id, topicTitle: t.title, concept: q.concept, conceptName: this.conceptName(t, q.concept),
        errorType: result.errorType || 'concept misunderstanding', type: q.type, difficulty: q.difficulty, stage,
        stem: String(q.stem || '').slice(0, 400), userAnswer: String(result.userAnswer || '').slice(0, 400), correct: Quiz.answerText(q).slice(0, 400),
        explanation: String(result.feedback || q.explanation || '').slice(0, 600), at: Date.now(), resolved: false
      });
      Store.touch('mistakes');
    },

    resolveConcept(t, cid){
      t.pendingFix = t.pendingFix.filter(f => f.concept !== cid);
      let changed = false;
      Store.state.mistakes.forEach(m => { if(m.topicId === t.id && m.concept === cid && !m.resolved){ m.resolved = true; m.resolvedAt = Date.now(); changed = true; } });
      if(changed) Store.touch('mistakes');
    },

    /* run-level evidence (practice / hard / apply) with anti-guessing */
    completeRun(t, stage, results){
      const n = results.length, right = results.filter(r => r.correct).length;
      const openRight = results.filter(r => r.correct && OPEN_TYPES.includes(r.type)).length;
      const objRight = results.filter(r => r.correct && !OPEN_TYPES.includes(r.type)).length;
      const openTotal = results.filter(r => OPEN_TYPES.includes(r.type)).length;
      let passed = false, note = '';
      if(stage === 'practice'){ passed = right >= Math.ceil(n * 0.75) && openRight >= 1; }
      if(stage === 'hard'){ passed = right >= Math.ceil(n * 0.66) && openRight >= 1; }
      if(stage === 'apply' || stage === 'explain' || stage === 'recall'){ passed = right === n; }
      if(!passed && objRight >= 2 && openTotal && openRight === 0){ t.antiGuess = 1; note = 'You got the multiple-choice questions right but the written answers weren’t there yet. Next round uses more “explain” questions, so guessing can’t count as mastery.'; }
      const map = { practice:'practice', hard:'hard', apply:'application', explain:'understanding', recall:'recall' };
      if(passed && map[stage]) this.grant(t, map[stage], `${right}/${n}`);
      return { passed, right, n, note };
    },

    checkAward(t){
      if(!t.masteredAt && EVIDENCE.every(e => t.ev[e.key])){
        t.masteredAt = Date.now(); t.atRisk = false;
        Revision.onMastered(t);
        return true;
      }
      return false;
    },

    weakConcepts(t){
      const out = [];
      (t.concepts || []).forEach(c => {
        const s = t.conceptStats[c.id]; const pending = t.pendingFix.some(f => f.concept === c.id);
        if(pending || (s && s.wrong > s.right)) out.push({ id:c.id, name:c.name, wrong: s ? s.wrong : 1, pending });
      });
      return out.sort((a,b) => (b.pending - a.pending) || (b.wrong - a.wrong));
    },

    topErrorTypes(topicId){
      const counts = {};
      Store.state.mistakes.filter(m => !topicId || m.topicId === topicId).forEach(m => counts[m.errorType] = (counts[m.errorType] || 0) + 1);
      return Object.entries(counts).sort((a,b) => b[1] - a[1]);
    },

    /* repeated weak concepts across all topics → targeted remediation */
    repeatedWeak(){
      const map = {};
      Store.state.mistakes.filter(m => !m.resolved).forEach(m => {
        const k = m.topicId + '|' + m.concept;
        (map[k] = map[k] || { topicId:m.topicId, topicTitle:m.topicTitle, concept:m.concept, conceptName:m.conceptName, n:0, types:{} }).n++;
        map[k].types[m.errorType] = (map[k].types[m.errorType] || 0) + 1;
      });
      return Object.values(map).filter(x => Store.topic(x.topicId)).sort((a,b) => b.n - a.n);
    },

    /* What should I do now? — ranked across all topics */
    todo(){
      const items = [];
      Store.topicsList().forEach(t => {
        const s = this.statusKey(t), n = this.nextStep(t);
        let pr = 50;
        if(s === 'risk') pr = 95; else if(s === 'review') pr = 90; else if(t.pendingFix.length) pr = 85;
        else if(s === 'near') pr = 75; else if(s === 'practicing' || s === 'unstable') pr = 70; else if(s === 'learning') pr = 65; else if(s === 'not-started') pr = 40;
        if(n.stage === 'done') return;
        // exam boost
        const plan = Store.state.examPlan;
        if(plan && plan.date && plan.topicIds.includes(t.id)) pr += 8;
        pr += Math.min(5, ((t.lastActive || 0) - (Date.now() - 3*M.DAY)) / M.DAY);
        if(pr > 0) items.push({ t, s, n, pr });
      });
      return items.sort((a,b) => b.pr - a.pr);
    },
  };
})();
