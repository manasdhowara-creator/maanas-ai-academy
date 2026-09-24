/* views.js — Dashboard, Learn (search-first + PDF), My Lessons, Revise, Mistake Bank, Progress, Notes, Settings, navigation. */
(function(){
  const V = window.Views = {};
  const NAV = [
    { g:'Study', items:[['dashboard','Dashboard','home'],['learn','Learn','search'],['lessons','My Lessons','book'],['revise','Revise','repeat'],['tests','Tests','test'],['war','Exam War Room','calendar']] },
    { g:'Support', items:[['coach','AI Coach','chat'],['mistakes','Mistake Bank','alert'],['progress','Progress','chart'],['notes','Notes','note'],['formulas','Formula Bank','layers']] },
    { g:'Labs', items:[['labs','AI Labs','brain'],['research','Research','flask'],['coding','Coding','code']] },
    { g:'', items:[['settings','Settings','gear']] },
  ];
  const TABS = [['dashboard','Home','home'],['learn','Learn','search'],['revise','Revise','repeat'],['coach','Coach','chat']];
  const EXAMPLES = ['Class 8 Science - Force','Photosynthesis','Machine Learning','Teach me Python from zero','Class 8 Maths - Linear Equations'];

  /* ---------- navigation ---------- */
  V.nav = () => {
    const cur = M.current.name === 'home' ? (Store.topicsList().length ? 'dashboard' : 'learn') : M.current.name === 'topic' ? 'lessons' : M.current.name;
    const due = Revision.due().length, mis = Store.state.mistakes.filter(m => !m.resolved).length;
    const badge = id => id === 'revise' && due ? `<span class="count">${due}</span>` : id === 'mistakes' && mis ? `<span class="count" style="background:var(--muted)">${mis}</span>` : '';
    document.getElementById('sideNav').innerHTML = NAV.map(g => (g.g ? `<div class="side-group">${g.g}</div>` : '<div style="height:10px"></div>') + g.items.map(([id, label, ic]) => `<a class="side-link ${cur === id ? 'active' : ''}" href="#${id}" ${cur === id ? 'aria-current="page"' : ''}>${M.icon[ic]}<span>${label}</span>${badge(id)}</a>`).join('')).join('');
    const inTabs = TABS.some(t => t[0] === cur);
    document.getElementById('tabbar').innerHTML = TABS.map(([id, label, ic]) => `<a class="tab ${cur === id ? 'active' : ''}" href="#${id}">${M.icon[ic]}<span>${label}</span>${id === 'revise' && due ? '<span class="dot"></span>' : ''}</a>`).join('') + `<button class="tab ${!inTabs ? 'active' : ''}" data-action="open-sheet">${M.icon.grid}<span>More</span></button>`;
    document.getElementById('sideFoot').innerHTML = `${Store.sync === 'account' ? '✓ Saved to your account' : Store.sync === 'connecting' ? 'Connecting…' : 'Saved on this device'}<br><span style="opacity:.8">Learn it. Prove it. Master it.</span>`;
    const pill = document.getElementById('aiPill');
    pill.className = 'ai-pill ' + (AI.status === 'on' ? 'on' : AI.status === 'checking' ? '' : 'off');
    pill.textContent = AI.status === 'on' ? '● AI teacher on' : AI.status === 'checking' ? 'AI: checking…' : '● AI off: offline mode';
  };
  M.action('open-sheet', () => {
    const all = NAV.flatMap(g => g.items);
    document.getElementById('sheetPanel').innerHTML = `<div class="row-between"><h2>All sections</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">${M.icon.x}</button></div><div class="sheet-grid">${all.map(([id, label, ic]) => `<a class="sheet-item" href="#${id}" data-action="sheet-go" data-to="${id}">${M.icon[ic]}<span>${label}</span></a>`).join('')}</div>`;
    document.getElementById('sheet').hidden = false;
  });
  M.action('close-sheet', () => { document.getElementById('sheet').hidden = true; });
  M.action('sheet-go', el => { document.getElementById('sheet').hidden = true; M.go(el.dataset.to); });
  document.getElementById('aiPill').addEventListener('click', () => M.go('settings'));

  /* ---------- shared search box ---------- */
  const searchHTML = (big) => `<form class="searchbox" id="searchForm" role="search">${M.icon.search}<input id="q" type="search" enterkeyhint="go" autocomplete="off" placeholder="${big ? 'e.g. Class 8 Science - Force' : 'Learn something new…'}" aria-label="What do you want to learn?"><button class="btn primary" type="submit">Learn</button></form>`;
  function bindSearch(view){
    const f = view.querySelector('#searchForm'); if(!f) return;
    f.addEventListener('submit', e => { e.preventDefault(); Lesson.startSearch(view.querySelector('#q').value); });
  }
  M.action('example', el => { const q = document.getElementById('q'); if(q){ q.value = el.dataset.q; } Lesson.startSearch(el.dataset.q); });

  /* ================= HOME / DASHBOARD ================= */
  M.route('home', (view) => { if(Store.topicsList().length) M.routes.dashboard(view); else M.routes.learn(view); });
  M.route('dashboard', (view) => {
    const topics = Store.topicsList();
    if(!topics.length) return M.routes.learn(view);
    const p = Store.state.profile; const todo = Mastery.todo(); const top = todo[0];
    const due = Revision.due(); const weak = Mastery.repeatedWeak()[0];
    const today = M.startOfDay(Date.now());
    const ansToday = topics.reduce((a, t) => a + t.attempts.filter(x => x.at >= today).length, 0);
    const proofsToday = topics.reduce((a, t) => a + Object.values(t.ev || {}).filter(e => e.at >= today).length, 0);
    const masteredToday = topics.filter(t => t.masteredAt >= today).length;
    const mastered = topics.filter(t => t.masteredAt).length, retained = topics.filter(t => t.retainedAt).length;
    const examDays = Store.state.examPlan.date ? M.daysUntil(new Date(Store.state.examPlan.date + 'T09:00:00').getTime()) : null;
    const testPick = todo.find(x => ['practice','hard','apply','challenge'].includes(x.n.stage));
    const hr = new Date().getHours();
    view.innerHTML = `<div class="stack">
      <div class="row-between"><div><div class="eyebrow">${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${p.name ? ', ' + M.esc(p.name) : ''}</div><h1 style="font-size:clamp(1.5rem,5vw,2.1rem)">What should I do now?</h1></div>${examDays !== null && examDays >= 0 ? `<a class="tag warn" href="#war" style="text-decoration:none;font-size:.85rem;padding:6px 10px">${M.icon.calendar.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} Exam ${examDays === 0 ? 'today' : `in ${examDays} day${examDays > 1 ? 's' : ''}`}</a>` : ''}</div>
      ${top ? `<div class="now-card"><div class="grid-lines"></div><div class="eyebrow">Next best step</div><h2>${M.esc(top.n.label)}: ${M.esc(top.t.title)}</h2><p>${M.esc(top.n.why)}</p><div class="row" style="margin-top:14px"><a class="btn primary" href="#topic-${top.t.id}">${M.icon.play} Start now</a>${M.pill(Mastery.status(top.t)).replace('class="pill', 'style="background:rgba(255,255,255,.12);color:inherit" class="pill')}</div></div>`
        : `<div class="now-card"><div class="grid-lines"></div><div class="eyebrow">All caught up</div><h2>Everything is mastered or scheduled.</h2><p>Learn something new, or take a mock exam to stay sharp.</p></div>`}
      <div class="grid grid-3">
        <div class="card stack-sm"><div class="row-between"><h3>Revision due</h3><span class="tag ${due.length ? 'warn' : 'ok'}">${due.length}</span></div>${due.length ? `<div class="mini-list">${due.slice(0, 3).map(t => `<a class="mini-item" href="#topic-${t.id}"><div class="grow"><div class="t">${M.esc(t.title)}</div><div class="s">${t.atRisk ? 'At risk: refresh needed' : 'Due ' + M.relDay(t.review.due)}</div></div>${M.pill(Mastery.status(t))}</a>`).join('')}</div>` : `<p class="small muted">Nothing due. ${Revision.upcoming()[0] ? 'Next: ' + M.esc(Revision.upcoming()[0].title) + ' ' + M.relDay(Revision.upcoming()[0].review.due) + '.' : 'Master a topic to schedule revision.'}</p>`}</div>
        <div class="card stack-sm"><h3>Weak concept</h3>${weak ? `<p><b>${M.esc(weak.conceptName)}</b></p><p class="small muted">${M.esc(weak.topicTitle)} · missed ${weak.n}× · mostly ${M.esc(Object.entries(weak.types).sort((a, b) => b[1] - a[1])[0][0])}</p><button class="btn sm" data-action="fix-concept" data-tid="${weak.topicId}" data-c="${M.esc(weak.concept)}">Fix it now</button>` : '<p class="small muted">No repeated weak spots right now.</p>'}</div>
        <div class="card stack-sm"><h3>Today’s test</h3>${testPick ? `<p><b>${M.esc(testPick.n.label)}</b></p><p class="small muted">${M.esc(testPick.t.title)}</p><a class="btn sm" href="#topic-${testPick.t.id}">Take it</a>` : `<p class="small muted">Try a timed mock exam across your topics.</p><a class="btn sm" href="#tests">Exam Mode</a>`}</div>
      </div>
      <div class="grid grid-2">
        <div class="card stack-sm"><h3>Today’s mastery</h3><div class="row" style="gap:24px"><div class="kpi"><span class="v">${ansToday}</span><span class="k">answers today</span></div><div class="kpi"><span class="v">${proofsToday}</span><span class="k">proofs earned</span></div><div class="kpi"><span class="v">${masteredToday}</span><span class="k">topics mastered</span></div></div></div>
        <div class="card stack-sm"><h3>Overall</h3><div class="row" style="gap:24px"><div class="kpi"><span class="v">${mastered}/${topics.length}</span><span class="k">topics mastered (100%)</span></div><div class="kpi"><span class="v">${retained}</span><span class="k">retained later (102%)</span></div></div><a class="btn ghost sm" href="#progress" style="align-self:flex-start;padding-left:0">See progress ${M.icon.arrow}</a></div>
      </div>
      ${todo.length > 1 ? `<div class="card"><h3>Up next</h3><div class="mini-list">${todo.slice(1, 5).map(x => `<a class="mini-item" href="#topic-${x.t.id}"><div class="grow"><div class="t">${M.esc(x.t.title)}</div><div class="s">${M.esc(x.n.label)}</div></div>${M.pill(Mastery.status(x.t))}</a>`).join('')}</div></div>` : ''}
      <div class="stack-sm"><div class="eyebrow">Learn something new</div>${searchHTML(false)}</div>
    </div>`;
    bindSearch(view);
  });
  M.action('fix-concept', el => {
    const t = Store.topic(el.dataset.tid); if(!t) return; const c = el.dataset.c;
    if(!t.pendingFix.some(f => f.concept === c)){ const m = Store.state.mistakes.filter(m => m.topicId === t.id && m.concept === c && !m.resolved).slice(-1)[0];
      t.pendingFix.unshift({ concept: c, errorType: m ? m.errorType : 'concept misunderstanding', stem: m ? m.stem : '', userAnswer: m ? m.userAnswer : '', correctAnswer: m ? m.correct : '', explanation: m ? m.explanation : '', feedback:'', tries:0, methodIdx:0, misses: 1, at: Date.now() }); }
    else { const i = t.pendingFix.findIndex(f => f.concept === c); t.pendingFix.unshift(t.pendingFix.splice(i, 1)[0]); }
    if(!t.lessonProgress.done){ t.lessonProgress.done = true; } if(!t.diagnostic){ t.diagnostic = { questions:[], answers:{}, done:true }; } else t.diagnostic.done = true;
    t.fixRun = null; Lesson.tab[t.id] = 'study'; Store.saveTopic(t); M.go('topic-' + t.id);
  });

  /* ================= LEARN ================= */
  V.book = null; V.bookErr = null; V.bookBusy = null; V.offlineMiss = null;
  M.on('offline-miss', q => { V.offlineMiss = q; if(M.current.name === 'learn' || M.current.name === 'home') M.render(); });
  M.route('learn', (view) => {
    const p = Store.state.profile;
    const firstTime = !p.onboarded;
    view.innerHTML = `<div class="stack">
      <div class="hero"><h1>What do you want to <span>learn</span>?</h1><p class="tagline"><b>Learn it.</b> Prove it. Master it.</p>${searchHTML(true)}
        <div class="or-upload"><span class="small muted">or</span><label class="btn sm upload-btn">${M.icon.upload} Upload a book / PDF <span class="muted" style="font-weight:400">(optional)</span><input type="file" id="bookFile" accept=".pdf,.txt,.md,application/pdf,text/plain"></label><button class="btn ghost sm" data-action="paste-toggle">Paste notes</button></div>
        <div class="chips" style="margin-top:14px">${EXAMPLES.map(e => `<button class="chip" data-action="example" data-q="${M.esc(e)}">${M.esc(e)}</button>`).join('')}</div>
      </div>
      ${V.offlineMiss ? `<div class="notice warn">${M.icon.info}<div class="stack-sm"><div><b>“${M.esc(V.offlineMiss)}” needs the AI teacher</b>, and it isn’t available here. ${M.esc(AI.friendly(AI.status === 'denied' ? 'not_granted' : 'offline'))}</div><div>Meanwhile, these work fully offline: the built-in lesson below, the Coding Lab, revision and your notes.</div></div></div>` : ''}
      <div id="pasteBox" hidden class="card stack-sm"><label class="label" for="pasteText">Paste your notes or a chapter</label><input class="input" id="pasteTitle" placeholder="Title (e.g. Chapter 3: Coal and Petroleum)"><textarea class="textarea" id="pasteText" rows="8" placeholder="Paste text here…"></textarea><button class="btn primary" data-action="paste-study">Study this</button></div>
      <div id="bookBox">${bookHTML()}</div>
      ${firstTime ? onboardHTML() : ''}
      <div class="grid grid-2">
        <div class="card stack-sm"><div class="row-between"><h3>Built-in lesson</h3><span class="tag">works offline</span></div><p class="small muted">Class 8 Science · Force and Pressure. A complete mastery loop you can try even without the AI teacher.</p><button class="btn sm" data-action="builtin" style="align-self:flex-start">Open lesson</button></div>
        <div class="card stack-sm"><h3>Or explore</h3><div class="chips">${(p.subjects.length ? p.subjects : ['Maths','Science','Social Science','English']).map(s => `<button class="chip" data-action="subject-seed" data-s="${M.esc(s)}">${M.esc(s)}</button>`).join('')}<a class="chip" href="#labs">AI Mastery Path</a><a class="chip" href="#coding">Coding</a></div></div>
      </div>
    </div>`;
    bindSearch(view);
    view.querySelector('#bookFile').addEventListener('change', e => { const f = e.target.files[0]; if(f) readBook(f); });
    const ob = view.querySelector('#obForm'); if(ob) bindOnboard(ob);
  });
  M.action('builtin', () => Lesson.startBuiltin('force'));
  M.action('paste-toggle', () => { const b = document.getElementById('pasteBox'); b.hidden = !b.hidden; if(!b.hidden) document.getElementById('pasteTitle').focus(); });
  M.action('subject-seed', el => { const q = document.getElementById('q'); const lv = Store.state.profile.level; q.value = `${lv && lv.startsWith('Class') ? lv + ' ' : ''}${el.dataset.s} - `; q.focus(); });
  M.action('paste-study', () => {
    const title = document.getElementById('pasteTitle').value.trim() || 'My notes'; const text = document.getElementById('pasteText').value.trim();
    if(text.length < 300){ M.toast('Paste a bit more text (at least a few paragraphs).'); return; }
    if(!AI.ready()){ M.toast(AI.friendly('offline')); return; }
    Lesson.startSource({ name: 'Pasted notes' }, { title, start: 1, end: 1 }, text);
  });

  async function readBook(file){
    V.book = null; V.bookErr = null; V.bookBusy = 'Reading your source…'; paintBook();
    try {
      const book = await Source.read(file, m => { V.bookBusy = m; paintBook(); });
      book.structure = Source.chapters(book); V.book = book;
    } catch(e){ V.bookErr = e.message; }
    V.bookBusy = null; paintBook();
  }
  function paintBook(){ const b = document.getElementById('bookBox'); if(b) b.innerHTML = bookHTML(); }
  function bookHTML(){
    if(V.bookBusy) return `<div class="card">${M.loadingHTML(V.bookBusy, 'Everything is processed in your browser')}</div>`;
    if(V.bookErr) return M.errorHTML(V.bookErr + ' You can also paste the text instead.');
    const b = V.book; if(!b) return '';
    const st = b.structure; const methodText = { outline:'from the PDF’s table of contents', headings:'from chapter headings in the text', ai:'detected by AI from the page text', whole:'short file, studied as one unit', chunks:'no chapters found, split into page ranges' }[st.method];
    return `<div class="card stack-sm">
      <div class="row-between"><div><div class="eyebrow">Your source</div><h3>${M.esc(b.name)}</h3><div class="small muted">${b.pages.length}${b.totalPages > b.pages.length ? ' of ' + b.totalPages : ''} pages · chapters ${methodText}</div></div><button class="btn ghost sm" data-action="book-close">Close</button></div>
      ${b.scanned ? `<div class="notice warn small">${M.icon.info}<div>This looks like a <b>scanned PDF</b> (images, almost no text). ${AI.ready() && AI.canSeeImages() ? 'Pick a chapter and the AI will read the page images (up to 20 pages at a time).' : 'Reading scanned pages needs the AI with image support, which isn’t available here. Use a text-based PDF or paste the text.'}</div></div>` : ''}
      ${(st.method === 'chunks' || st.method === 'whole') && AI.ready() && !b.scanned ? `<button class="btn sm" data-action="book-ai" style="align-self:flex-start">Detect chapters with AI</button>` : ''}
      <div class="mini-list">${st.list.map((c, i) => `<div class="mini-item" style="cursor:default"><div class="grow"><div class="t">${M.esc(c.title)}</div><div class="s">Pages ${c.start}–${c.end}${c.sections && c.sections.length ? ' · ' + c.sections.slice(0, 4).map(M.esc).join(' · ') : ''}</div></div><button class="btn sm primary" data-action="book-study" data-i="${i}">Study</button></div>`).join('')}</div>
      <p class="hint">The lesson will teach from this source. Anything added beyond it is labelled “Extra explanation”, and source quotes are checked word-for-word.</p>
    </div>`;
  }
  M.action('book-close', () => { V.book = null; paintBook(); });
  M.action('book-ai', async () => { const b = V.book; V.bookBusy = 'Detecting book → chapter structure…'; paintBook(); try { b.structure = await Source.chaptersAI(b); } catch(e){ M.toast(e.message); } V.bookBusy = null; paintBook(); });
  M.action('book-study', async el => {
    const b = V.book; const ch = b.structure.list[Number(el.dataset.i)];
    if(!AI.ready()){ M.toast('Teaching from your own PDF needs the AI teacher. ' + AI.friendly('offline')); return; }
    let text = Source.text(b, ch);
    if(b.scanned || text.length < 200){
      V.bookBusy = 'Reading scanned pages…'; paintBook();
      try { text = await Source.ocr(b, ch, m => { V.bookBusy = m; paintBook(); }); } catch(e){ V.bookBusy = null; V.bookErr = e.message; paintBook(); return; }
      V.bookBusy = null;
    }
    if(text.length < 200){ V.bookErr = 'This chapter has too little readable text to teach from.'; paintBook(); return; }
    Lesson.startSource(b, ch, text);
  });

  /* onboarding: short, skippable, never blocks learning */
  function onboardHTML(){
    const p = Store.state.profile;
    const levels = ['Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','College','Working professional'];
    return `<form class="card stack" id="obForm"><div class="row-between"><div><h3>Personalise in 20 seconds</h3><p class="small muted">Optional. You can start learning right away.</p></div><button type="button" class="btn ghost sm" data-action="ob-skip">Skip</button></div>
      <div class="grid grid-2"><div class="field"><label for="obName">Your name</label><input class="input" id="obName" value="${M.esc(p.name)}" autocomplete="given-name"></div>
      <div class="field"><label for="obLevel">Class / level</label><select class="select" id="obLevel"><option value="">Choose…</option>${levels.map(l => `<option ${p.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="field"><span class="label">Subjects</span><div class="chips" id="obSubj">${['Maths','Science','Social Science','English','Hindi','Computer Science','AI','Coding'].map(s => `<button type="button" class="chip ${p.subjects.includes(s) ? 'on' : ''}" data-action="chip-toggle">${s}</button>`).join('')}</div></div>
      <div class="grid grid-2"><div class="field"><span class="label">Language</span><div class="chips" id="obLang">${['English','Easy English','Hinglish'].map(l => `<button type="button" class="chip ${p.language === l ? 'on' : ''}" data-action="chip-one">${l}</button>`).join('')}</div></div>
      <div class="field"><span class="label">I learn best with</span><div class="chips" id="obPref">${[['mixed','A mix'],['visual','Visuals'],['examples','Examples'],['steps','Step-by-step']].map(([k, l]) => `<button type="button" class="chip ${p.pref === k ? 'on' : ''}" data-action="chip-one" data-k="${k}">${l}</button>`).join('')}</div></div></div>
      <div class="field" style="max-width:280px"><label for="obExam">Exam date (if any)</label><input class="input" type="date" id="obExam" value="${M.esc(Store.state.examPlan.date || '')}"></div>
      <button class="btn primary" type="submit">Save</button></form>`;
  }
  function bindOnboard(f){
    f.addEventListener('submit', e => { e.preventDefault(); const p = Store.state.profile;
      p.name = f.querySelector('#obName').value.trim(); p.level = f.querySelector('#obLevel').value;
      p.subjects = [...f.querySelectorAll('#obSubj .chip.on')].map(c => c.textContent.trim());
      p.language = (f.querySelector('#obLang .chip.on') || {}).textContent || 'English';
      p.pref = ((f.querySelector('#obPref .chip.on') || {}).dataset || {}).k || 'mixed';
      const d = f.querySelector('#obExam').value; if(d){ Store.state.examPlan.date = d; p.examDate = d; }
      p.onboarded = true; Store.touch('profile'); M.toast('Saved. Lessons will now fit you.'); M.render(); });
  }
  M.action('ob-skip', () => { Store.state.profile.onboarded = true; Store.touch('profile'); M.render(); });

  /* ================= MY LESSONS ================= */
  M.route('lessons', (view) => {
    const topics = Store.topicsList(); const f = V.lessonFilter || 'all';
    const groups = { all: () => true, active: t => !t.masteredAt, mastered: t => !!t.masteredAt, attention: t => ['unstable','risk','review'].includes(Mastery.statusKey(t)) || t.pendingFix.length };
    const list = topics.filter(groups[f]);
    view.innerHTML = `<div class="stack">
      <div class="row-between"><div><div class="eyebrow">My lessons</div><h1>${topics.length ? M.plural(topics.length, 'topic') : 'No lessons yet'}</h1></div><a class="btn primary" href="#learn">${M.icon.plus} New</a></div>
      ${topics.length ? `<div class="chips">${[['all','All'],['active','In progress'],['attention','Needs attention'],['mastered','Mastered']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-action="lesson-filter" data-f="${k}">${l}</button>`).join('')}</div>` : ''}
      ${list.length ? `<div class="grid grid-2">${list.map(t => { const n = Mastery.nextStep(t); return `<a class="card card-link stack-sm" href="#topic-${t.id}"><div class="row-between">${M.pill(Mastery.status(t))}<span class="tiny muted">${M.esc(t.subject)}${t.level ? ' · ' + M.esc(t.level) : ''}</span></div><h3>${M.esc(t.title)}</h3>${t.planned ? `<div class="evidence" aria-label="Mastery proofs">${Mastery.EVIDENCE.map(e => `<span class="ev ${t.ev[e.key] ? 'on' : ''}"><i></i>${e.short}</span>`).join('')}</div>` : ''}<div class="small"><b>Next:</b> ${M.esc(n.label)}</div></a>`; }).join('')}</div>`
        : M.emptyHTML('book', topics.length ? 'Nothing in this filter.' : 'Search any topic to create your first mastery lesson.', topics.length ? '' : '<a class="btn primary" href="#learn">What do you want to learn?</a>')}
    </div>`;
  });
  M.action('lesson-filter', el => { V.lessonFilter = el.dataset.f; M.render(); });

  /* ================= REVISE ================= */
  M.route('revise', (view) => {
    const due = Revision.due(), up = Revision.upcoming();
    const active = Store.topicsList().filter(t => !t.masteredAt && t.planned);
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Revise</div><h1>${due.length ? `${M.plural(due.length, 'topic')} to revise` : 'Nothing due right now'}</h1><p class="muted" style="margin-top:6px">Spaced retrieval: weak topics come back sooner, strong ones later. Every review is recall, explaining and applying, never just rereading. Older topics get mixed in.</p></div>
      ${due.length ? `<div class="card"><div class="mini-list">${due.map(t => `<div class="mini-item" style="cursor:default"><div class="grow"><div class="t">${M.esc(t.title)}</div><div class="s">${t.atRisk ? (t.atRiskReason === 'overdue' ? 'Long overdue: forgetting likely' : 'Last review showed forgetting') : 'Due ' + M.relDay(t.review.due)} · interval ${t.review.interval} day${t.review.interval > 1 ? 's' : ''}</div></div>${M.pill(Mastery.status(t))}<button class="btn sm primary" data-action="revise-now" data-tid="${t.id}">${t.atRisk ? 'Refresh' : 'Revise'}</button></div>`).join('')}</div></div>` : ''}
      ${up.length ? `<div class="card"><h3>Coming up</h3><div class="mini-list">${up.slice(0, 12).map(t => `<a class="mini-item" href="#topic-${t.id}"><div class="grow"><div class="t">${M.esc(t.title)}</div><div class="s">${t.retainedAt ? '102% · retained' : 'Mastered'} · next ${M.relDay(t.review.due)}</div></div><span class="tag">${M.fmtDate(t.review.due)}</span></a>`).join('')}</div></div>` : ''}
      ${!due.length && !up.length ? M.emptyHTML('repeat', 'Revision starts automatically once you master a topic.' + (active.length ? '' : ''), active.length ? `<a class="btn" href="#topic-${active[0].id}">Continue ${M.esc(active[0].title)}</a>` : '<a class="btn primary" href="#learn">Learn something</a>') : ''}
    </div>`;
  });
  M.action('revise-now', el => { const t = Store.topic(el.dataset.tid); Lesson.tab[t.id] = 'study'; if(!t.atRisk && !t.pendingFix.length) Lesson.makeRun(t, 'review'); M.go('topic-' + t.id); });

  /* ================= MISTAKE BANK ================= */
  M.route('mistakes', (view) => {
    const all = Store.state.mistakes; const open = all.filter(m => !m.resolved);
    const f = V.mistakeFilter || 'open'; const list = (f === 'open' ? open : all).slice().reverse();
    const types = Mastery.topErrorTypes(); const maxT = types.length ? types[0][1] : 1;
    const rep = Mastery.repeatedWeak().filter(r => r.n >= 1).slice(0, 6);
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Mistake Bank</div><h1>${open.length ? `${open.length} mistake${open.length > 1 ? 's' : ''} to learn from` : all.length ? 'All mistakes fixed' : 'No mistakes yet'}</h1><p class="muted" style="margin-top:6px">Every meaningful mistake is saved and classified. Patterns become your Mistake DNA and trigger targeted fixes. A mistake is resolved only when you answer a fresh question on it correctly.</p></div>
      ${all.length ? `<div class="grid grid-2">
        <div class="card stack-sm"><h3>Your Mistake DNA</h3><p class="small muted">What kind of mistakes you make (all time)</p><div class="bars">${types.slice(0, 8).map(([k, n]) => `<div class="bar-row"><span>${M.esc(k)}</span><span class="track"><i style="width:${n / maxT * 100}%"></i></span><span class="n">${n}</span></div>`).join('')}</div></div>
        <div class="card stack-sm"><h3>Repeated weak concepts</h3>${rep.length ? rep.map(r => `<div class="mini-item" style="cursor:default"><div class="grow"><div class="t">${M.esc(r.conceptName)}</div><div class="s">${M.esc(r.topicTitle)} · ${r.n}× · ${M.esc(Object.keys(r.types).join(', '))}</div></div><button class="btn sm ${r.n >= 2 ? 'primary' : ''}" data-action="fix-concept" data-tid="${r.topicId}" data-c="${M.esc(r.concept)}">Fix</button></div>`).join('') : '<p class="small muted">None open. Nice.</p>'}</div>
      </div>
      <div class="chips"><button class="chip ${f === 'open' ? 'on' : ''}" data-action="mistake-filter" data-f="open">Open (${open.length})</button><button class="chip ${f === 'all' ? 'on' : ''}" data-action="mistake-filter" data-f="all">All (${all.length})</button></div>
      <div class="stack-sm">${list.slice(0, 60).map(m => `<details class="fold"><summary><span class="row" style="flex-wrap:nowrap;min-width:0"><span class="tag ${m.resolved ? 'ok' : 'bad'}">${m.resolved ? 'fixed' : M.esc(m.errorType)}</span><span style="font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${M.esc(m.stem.slice(0, 90))}</span></span></summary><div class="stack-sm small"><div><b>Topic:</b> <a href="#topic-${m.topicId}">${M.esc(m.topicTitle)}</a> · ${M.esc(m.conceptName)} · ${M.fmtDate(m.at)}</div><div><b>Question:</b> ${M.esc(m.stem)}</div><div><b>Your answer:</b> ${M.esc(m.userAnswer || '—')}</div><div><b>Correct:</b> ${M.esc(m.correct)}</div>${m.explanation ? `<div><b>Why:</b> ${M.esc(m.explanation)}</div>` : ''}<div class="muted">Type: ${M.esc(m.errorType)}${m.selfTagged ? ' (you tagged this)' : ''} · stage: ${M.esc(m.stage)}</div>${!m.resolved ? `<button class="btn sm" data-action="fix-concept" data-tid="${m.topicId}" data-c="${M.esc(m.concept)}" style="align-self:flex-start">Fix this concept</button>` : ''}</div></details>`).join('')}</div>` : M.emptyHTML('alert', 'Mistakes you make in practice, tests and revision will appear here, organised so you can fix them.')}
    </div>`;
  });
  M.action('mistake-filter', el => { V.mistakeFilter = el.dataset.f; M.render(); });

  /* ================= PROGRESS ================= */
  M.route('progress', (view) => {
    const topics = Store.topicsList();
    const counts = {}; topics.forEach(t => { const k = Mastery.statusKey(t); counts[k] = (counts[k] || 0) + 1; });
    const atts = topics.flatMap(t => t.attempts).sort((a, b) => a.at - b.at);
    const last = atts.slice(-20), prev = atts.slice(-40, -20);
    const acc = a => a.length ? Math.round(a.filter(x => x.correct).length / a.length * 100) : null;
    const subj = {}; topics.forEach(t => { const s = subj[t.subject] = subj[t.subject] || { n:0, m:0, r:0 }; s.n++; if(t.masteredAt) s.m++; if(t.retainedAt) s.r++; });
    const mastered = topics.filter(t => t.masteredAt).length, retained = topics.filter(t => t.retainedAt).length;
    const evTotals = Mastery.EVIDENCE.map(e => [e.label, topics.filter(t => t.ev[e.key]).length]);
    const LABELS = { 'not-started':'Not started', learning:'Learning', practicing:'Practicing', unstable:'Unstable', near:'Near mastery', mastered:'Mastered', review:'Review due', risk:'At risk' };
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Progress</div><h1>Am I improving?</h1></div>
      ${topics.length ? `<div class="grid grid-3">
        <div class="card kpi"><span class="v">${acc(last) ?? '—'}${acc(last) !== null ? '%' : ''}</span><span class="k">accuracy on your last ${last.length} answers${acc(prev) !== null ? ` (previous ${prev.length}: ${acc(prev)}%)` : ''}</span></div>
        <div class="card kpi"><span class="v">${mastered}/${topics.length}</span><span class="k">topics at 100%: every proof shown</span></div>
        <div class="card kpi"><span class="v">${retained}</span><span class="k">topics at 102%: mastered and retained on a later review</span></div>
      </div>
      <div class="grid grid-2">
        <div class="card stack-sm"><h3>Where each topic stands</h3>${Object.keys(LABELS).filter(k => counts[k]).map(k => `<div class="row-between small"><span class="pill s-${k}">${LABELS[k]}</span><b>${counts[k]}</b></div>`).join('')}</div>
        <div class="card stack-sm"><h3>Proofs earned across topics</h3>${evTotals.map(([l, n]) => `<div class="stack-sm"><div class="row-between small"><span>${l}</span><b>${n}/${topics.length}</b></div><div class="score-bar"><i style="width:${n / topics.length * 100}%;background:var(--ok)"></i></div></div>`).join('')}</div>
      </div>
      <div class="card"><h3>By subject</h3><div class="table-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>Subject</th><th>Topics</th><th>Mastered</th><th>Retained</th></tr></thead><tbody>${Object.entries(subj).map(([k, s]) => `<tr><td>${M.esc(k)}</td><td class="num">${s.n}</td><td class="num">${s.m}</td><td class="num">${s.r}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>All topics</h3><div class="mini-list">${topics.map(t => `<a class="mini-item" href="#topic-${t.id}"><div class="grow"><div class="t">${M.esc(t.title)}</div><div class="s">${Mastery.percentLabel(t).v} · ${M.esc(Mastery.nextStep(t).label)}</div></div>${M.pill(Mastery.status(t))}</a>`).join('')}</div></div>
      <p class="hint">No points, badges or streaks. Progress here only counts answers you actually gave and proofs you actually earned.</p>`
      : M.emptyHTML('chart', 'Your progress appears after your first answers.', '<a class="btn primary" href="#learn">Start learning</a>')}
    </div>`;
  });

  /* ================= NOTES ================= */
  M.route('notes', (view, id) => {
    const notes = Store.state.notes;
    if(id){ const n = notes.find(n => n.id === id); if(n) return noteEditor(view, n); }
    const q = V.noteQ || '';
    const list = notes.filter(n => !q || M.norm(n.title + ' ' + n.body).includes(M.norm(q)));
    view.innerHTML = `<div class="stack">
      <div class="row-between"><div><div class="eyebrow">Notes</div><h1>Your notes</h1></div><button class="btn primary" data-action="note-new">${M.icon.plus} New note</button></div>
      <input class="input" id="noteSearch" type="search" placeholder="Search notes…" value="${M.esc(q)}" aria-label="Search notes">
      ${list.length ? `<div class="grid grid-2">${list.map(n => `<a class="card card-link stack-sm" href="#notes-${n.id}"><div class="row-between"><h3>${M.esc(n.title)}</h3>${n.sheetOf ? '<span class="tag ok">mastery sheet</span>' : ''}</div><p class="small muted" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical">${M.esc(n.body.replace(/[#*_`>-]/g, '').slice(0, 220))}</p><span class="tiny muted">${M.fmtDate(n.updated || n.created)}</span></a>`).join('')}</div>` : M.emptyHTML('note', q ? 'No notes match.' : 'Notes you write, and the mastery sheets you earn, live here.')}
    </div>`;
    const s = view.querySelector('#noteSearch'); s.addEventListener('input', M.debounce(() => { V.noteQ = s.value; M.render(); setTimeout(() => { const el = document.getElementById('noteSearch'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); }, 300));
  });
  function noteEditor(view, n){
    const prev = V.notePreview;
    view.innerHTML = `<div class="stack">
      <a class="btn ghost sm" href="#notes" style="align-self:flex-start;padding-left:0">${M.icon.back} Notes</a>
      <input class="input" id="noteTitle" value="${M.esc(n.title)}" aria-label="Note title" style="font-family:var(--f-display);font-size:1.3rem;font-weight:650">
      <div class="chips"><button class="chip ${!prev ? 'on' : ''}" data-action="note-mode" data-p="0">Write</button><button class="chip ${prev ? 'on' : ''}" data-action="note-mode" data-p="1">Preview</button>${n.topicId && Store.topic(n.topicId) ? `<a class="chip" href="#topic-${n.topicId}">Open topic</a>` : ''}</div>
      ${prev ? `<div class="card prose">${M.md(n.body)}</div>` : `<textarea class="textarea" id="noteBody" rows="16" placeholder="Write in your own words. Markdown works: **bold**, - lists, # headings">${M.esc(n.body)}</textarea>`}
      <div class="row-between"><span class="hint">Saved automatically</span><button class="btn danger sm" data-action="note-del" data-id="${n.id}">${M.icon.trash} Delete</button></div>
    </div>`;
    const save = M.debounce(() => { n.title = view.querySelector('#noteTitle').value || 'Untitled'; const b = view.querySelector('#noteBody'); if(b) n.body = b.value; n.updated = Date.now(); Store.touch('notes'); }, 500);
    view.querySelector('#noteTitle').addEventListener('input', save); const b = view.querySelector('#noteBody'); if(b) b.addEventListener('input', save);
  }
  M.action('note-new', () => { const n = { id: M.uid('n'), title: 'Untitled note', body: '', created: Date.now(), updated: Date.now() }; Store.state.notes.unshift(n); Store.touch('notes'); V.notePreview = false; M.go('notes-' + n.id); });
  M.action('note-mode', el => { V.notePreview = el.dataset.p === '1'; M.render(); });
  M.action('note-del', el => { if(el.dataset.confirm !== '1'){ el.dataset.confirm = '1'; el.textContent = 'Tap again to delete'; return; } Store.state.notes = Store.state.notes.filter(n => n.id !== el.dataset.id); Store.touch('notes'); M.go('notes'); });

  /* ================= FORMULA BANK ================= */
  M.route('formulas', (view) => {
    const all = Store.state.formulas;
    const q = V.formulaQ || '', subj = V.formulaSubject || '', onlyBk = !!V.formulaBookmarkOnly;
    const subjects = [...new Set(all.map(f => f.subject).filter(Boolean))].sort();
    let list = all.filter(f => (!subj || f.subject === subj) && (!onlyBk || f.bookmarked) && (!q || M.norm(f.formula + ' ' + f.topic + ' ' + (f.whenToUse||'')).includes(M.norm(q))));
    list = list.slice().sort((a, b) => (b.bookmarked - a.bookmarked) || (b.created - a.created));
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Formula Bank</div><h1>${all.length ? `${all.length} formula${all.length > 1 ? 's' : ''} from your chapters` : 'No formulas yet'}</h1><p class="muted" style="margin-top:6px">Formulas are extracted automatically whenever you build Master Notes for a numerical topic. Theory subjects show Key Facts instead — nothing is forced here.</p></div>
      ${all.length ? `<input class="input" id="formulaSearch" type="search" placeholder="Search formulas, topics…" value="${M.esc(q)}" aria-label="Search formula bank">
      <div class="chips">
        <button class="chip ${!subj ? 'on' : ''}" data-action="formula-subject" data-s="">All subjects</button>
        ${subjects.map(s => `<button class="chip ${subj === s ? 'on' : ''}" data-action="formula-subject" data-s="${M.esc(s)}">${M.esc(s)}</button>`).join('')}
        <button class="chip ${onlyBk ? 'on' : ''}" data-action="formula-bookmark-only">${M.icon.flag} Bookmarked</button>
      </div>
      ${list.length ? `<div class="grid grid-2">${list.map(f => `<div class="stack-sm">
          <div class="row-between"><a class="small" href="#topic-${f.topicId}">${M.esc(f.topic)}</a><button class="icon-btn" data-action="formula-bookmark" data-id="${f.id}" aria-label="${f.bookmarked ? 'Remove bookmark' : 'Bookmark'}" style="${f.bookmarked ? 'color:var(--warn)' : ''}">${M.icon.flag}</button></div>
          ${Lesson.formulaCardHTML(f)}
        </div>`).join('')}</div>` : M.emptyHTML('layers', 'No formulas match this filter.')}` : M.emptyHTML('layers', 'Study a numerical topic and build its Master Notes — formulas show up here automatically, ready to search, bookmark and revise.', '<a class="btn primary" href="#learn">Learn something</a>')}
    </div>`;
    const s = view.querySelector('#formulaSearch');
    if(s) s.addEventListener('input', M.debounce(() => { V.formulaQ = s.value; M.render(); setTimeout(() => { const el = document.getElementById('formulaSearch'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); }, 300));
  });
  M.action('formula-subject', el => { V.formulaSubject = el.dataset.s; M.render(); });
  M.action('formula-bookmark-only', () => { V.formulaBookmarkOnly = !V.formulaBookmarkOnly; M.render(); });
  M.action('formula-bookmark', el => { const f = Store.state.formulas.find(f => f.id === el.dataset.id); if(!f) return; f.bookmarked = !f.bookmarked; Store.touch('formulas'); M.render(); });

  /* ================= SETTINGS ================= */
  M.route('settings', (view) => {
    const p = Store.state.profile; const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    let theme = 'system'; try { theme = localStorage.getItem('maa.theme') || 'system'; } catch(_){}
    const levels = ['','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','College','Working professional'];
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Settings</div><h1>Settings</h1></div>
      <div class="card stack"><h3>You</h3>
        <div class="grid grid-2"><div class="field"><label for="sName">Name</label><input class="input" id="sName" value="${M.esc(p.name)}"></div><div class="field"><label for="sLevel">Class / level</label><select class="select" id="sLevel">${levels.map(l => `<option value="${l}" ${p.level === l ? 'selected' : ''}>${l || 'Not set'}</option>`).join('')}</select></div></div>
        <div class="grid grid-2"><div class="field"><label for="sLang">Language</label><select class="select" id="sLang">${['English','Easy English','Hinglish'].map(l => `<option ${p.language === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="sPref">Learning preference</label><select class="select" id="sPref">${[['mixed','A mix'],['visual','Visuals & diagrams'],['examples','Real-life examples'],['steps','Step-by-step']].map(([k, l]) => `<option value="${k}" ${p.pref === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="field"><label for="sSubj">Subjects (comma separated)</label><input class="input" id="sSubj" value="${M.esc(p.subjects.join(', '))}"></div>
        <div class="field"><label for="sEmail">Your email</label><input class="input" id="sEmail" type="email" placeholder="you@example.com" value="${M.esc(p.email || '')}"><div class="hint">Master Notes and Formula Sheets are emailed here automatically. Only you can see or receive them.</div></div>
        <button class="btn primary" data-action="save-settings" style="align-self:flex-start">Save</button></div>
      <div class="card stack-sm"><h3>Teacher voice</h3>${voices.length ? `<select class="select" id="sVoice"><option value="">Automatic</option>${voices.map(v => `<option value="${M.esc(v.voiceURI)}" ${p.voiceURI === v.voiceURI ? 'selected' : ''}>${M.esc(v.name)} (${M.esc(v.lang)})</option>`).join('')}</select><button class="btn sm" data-action="test-voice" style="align-self:flex-start">${M.icon.volume} Test voice</button>` : '<p class="small muted">Your browser hasn’t provided voices yet (or has none). Lessons still play with captions.</p>'}</div>
      <div class="card stack-sm"><h3>Appearance</h3><div class="chips">${['system','light','dark'].map(t => `<button class="chip ${theme === t ? 'on' : ''}" data-action="set-theme" data-t="${t}">${M.cap(t)}</button>`).join('')}</div></div>
      <div class="card stack-sm"><h3>AI teacher</h3><p class="small">${AI.status === 'on' ? '✓ On. It runs on your own Claude plan through this page. There’s no extra subscription, API key or paid service.' : M.esc(AI.friendly(AI.status === 'denied' ? 'not_granted' : 'offline'))}</p><p class="small muted">Works without AI: the built-in lesson, Coding Lab (tests + security review), spaced revision schedule, Mistake Bank, notes, PDF reading, and exams on the built-in lesson.</p></div>
      <div class="card stack-sm"><h3>Your data</h3><p class="small">${Store.sync === 'account' ? '✓ Saved privately to your account, so it follows you across devices. Also cached on this device.' : 'Saved on this device only (account sync isn’t available in this view).'}</p>
        <div class="row"><button class="btn sm" data-action="export-data">${M.icon.copy} Copy backup</button><button class="btn sm" data-action="import-toggle">Restore from backup</button><button class="btn danger sm" data-action="reset-data">Erase all data</button></div>
        <div id="importBox" hidden class="stack-sm"><textarea class="textarea" id="importText" rows="4" placeholder="Paste a backup here"></textarea><button class="btn sm primary" data-action="import-data" style="align-self:flex-start">Restore</button></div></div>
      <details class="fold"><summary>What’s real in this academy</summary><div class="small stack-sm">
        <p><b>AI lessons, questions, grading, coach, research analysis:</b> real Claude responses, generated live for you.</p>
        <p><b>Teacher lesson:</b> an animated, narrated chalkboard lesson. The voice is your browser’s built-in speech. It is not filmed video, and there’s no human presenter. You can copy the script into HeyGen if you want one (paid, optional).</p>
        <p><b>Mastery:</b> earned only through seven kinds of proven answers, never through clicks or watching.</p>
        <p><b>Research:</b> the lab can’t browse the web. It plans searches, and verifies quotes word-for-word against sources you add.</p>
        <p><b>Coding Lab:</b> your code really runs, sandboxed in your browser (no server).</p>
        <p><b>Voice answers:</b> the page can’t use the microphone, so answers are typed. Your keyboard’s dictation works.</p>
      </div></details>
    </div>`;
  });
  M.action('save-settings', () => { const p = Store.state.profile; const v = id => document.getElementById(id).value;
    p.name = v('sName').trim(); p.level = v('sLevel'); p.language = v('sLang'); p.pref = v('sPref'); p.subjects = v('sSubj').split(',').map(s => s.trim()).filter(Boolean);
    const sv = document.getElementById('sVoice'); if(sv) p.voiceURI = sv.value || null; p.onboarded = true;
    Store.touch('profile'); M.toast('Saved'); });
  M.action('test-voice', () => { try { const sv = document.getElementById('sVoice'); const u = new SpeechSynthesisUtterance('Hello! I am your teacher. Let us master this together.'); const v = speechSynthesis.getVoices().find(x => x.voiceURI === sv.value); if(v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch(_){ M.toast('Voice isn’t available here.'); } });
  M.action('set-theme', el => { const t = el.dataset.t; try { localStorage.setItem('maa.theme', t); } catch(_){} V.applyTheme(); M.render(); });
  V.applyTheme = () => { let t = 'system'; try { t = localStorage.getItem('maa.theme') || 'system'; } catch(_){} if(t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); };
  M.action('export-data', () => M.copy(Store.exportJSON()));
  M.action('import-toggle', () => { const b = document.getElementById('importBox'); b.hidden = !b.hidden; });
  M.action('import-data', () => { try { Store.importJSON(document.getElementById('importText').value); M.toast('Backup restored'); M.go('dashboard'); } catch(e){ M.toast(e.message || 'That backup could not be read.'); } });
  M.action('reset-data', el => {
    if(el.dataset.confirm !== '1'){ el.dataset.confirm = '1'; el.textContent = 'Tap again to erase everything permanently'; setTimeout(() => { if(el.isConnected){ el.dataset.confirm = ''; el.textContent = 'Erase all data'; } }, 5000); return; }
    Store.resetAll(); try { localStorage.removeItem('maa.coach'); localStorage.removeItem('maa.exam'); } catch(_){} M.toast('All data erased'); M.go('learn');
  });
})();
