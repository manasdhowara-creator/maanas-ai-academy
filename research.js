/* research.js — Research Engine: QUESTION → SEARCH → COLLECT → VERIFY → COMPARE → ANALYZE → CONCLUDE.
   The page cannot browse, so it never invents sources: you add real sources, claims are extracted with exact quotes,
   and every quote is checked word-for-word against the source text before it can be used. */
(function(){
  const STEPS = ['Question','Search','Collect','Verify','Compare','Analyze','Conclude'];
  const R = window.Research = { busy: {}, err: {} };
  const find = id => Store.state.research.find(p => p.id === id);
  const save = () => Store.touch('research');

  M.route('research', (view, id) => {
    if(id && find(id)) return renderProject(view, find(id));
    const list = Store.state.research.slice().reverse();
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Research Lab</div><h1>Answer a question with evidence, not guesses.</h1><p class="muted" style="margin-top:6px">You bring real sources. Every claim is tied to an exact quote that’s checked word-for-word. Source facts and AI interpretation are kept apart.</p></div>
      <form class="card stack-sm" id="rqForm"><label class="label" for="rq">Research question</label><textarea class="textarea" id="rq" rows="2" placeholder="e.g. Does homework improve learning for middle-school students?"></textarea><button class="btn primary" type="submit">Start research</button></form>
      <div class="notice small">${M.icon.info}<div>This lab can’t search the internet itself. It plans your searches, opens them in a new tab, and verifies what you bring back. That’s how it guarantees it never invents a source, URL, statistic or quote.</div></div>
      ${list.length ? `<div class="card"><h3>Your research</h3><div class="mini-list">${list.map(p => `<a class="mini-item" href="#research-${p.id}"><div class="grow"><div class="t">${M.esc(p.question)}</div><div class="s">${p.sources.length} sources · ${p.claims.filter(c => c.verified).length} verified claims · ${p.synthesis ? 'concluded' : 'in progress'}</div></div>${M.icon.arrow}</a>`).join('')}</div></div>` : ''}
    </div>`;
    view.querySelector('#rqForm').addEventListener('submit', e => { e.preventDefault(); const q = view.querySelector('#rq').value.trim(); if(q.length < 8){ M.toast('Write a full question.'); return; }
      const p = { id: M.uid('r'), question: q, subqs: [], queries: [], sources: [], claims: [], synthesis: null, created: Date.now() }; Store.state.research.push(p); save(); M.go('research-' + p.id); });
  });

  function stepIndex(p){ if(p.synthesis) return 6; if(p.claims.length) return 4; if(p.sources.length) return 3; if(p.queries.length) return 2; return 1; }

  function renderProject(view, p){
    const si = stepIndex(p);
    const verified = p.claims.filter(c => c.verified), rejected = p.claims.filter(c => !c.verified);
    const busy = k => R.busy[p.id + k];
    view.innerHTML = `<div class="stack">
      <a class="btn ghost sm" href="#research" style="align-self:flex-start;padding-left:0">${M.icon.back} Research Lab</a>
      <div><div class="eyebrow">Research question</div><h1 style="font-size:clamp(1.4rem,4.5vw,2rem)">${M.esc(p.question)}</h1></div>
      <div class="steps-bar">${STEPS.map((s, i) => `<span class="${i < si ? 'done' : i === si ? 'on' : ''}">${i + 1}. ${s}</span>`).join('')}</div>

      <div class="card stack-sm"><div class="row-between"><h3>2 · Search plan</h3><button class="btn sm" data-action="rs-plan" data-pid="${p.id}" ${busy('plan') ? 'disabled' : ''}>${p.queries.length ? 'Re-plan' : 'Plan my search'}</button></div>
        ${busy('plan') ? M.loadingHTML('Planning your search…') : ''}${R.err[p.id + 'plan'] ? M.errorHTML(R.err[p.id + 'plan']) : ''}
        ${p.subqs.length ? `<div class="small"><b>Sub-questions</b><ul style="margin:4px 0;padding-left:1.2em">${p.subqs.map(s => `<li>${M.esc(s)}</li>`).join('')}</ul></div>` : ''}
        ${(p.queries.length ? p.queries : [p.question]).map(q => `<div class="row small" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:8px"><span class="mono" style="flex:1;min-width:180px">${M.esc(q)}</span><span class="row"><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(q)}">Google</a><a class="btn sm" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=${encodeURIComponent(q)}">Scholar</a><a class="btn sm" target="_blank" rel="noopener" href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}">Wikipedia</a></span></div>`).join('')}
        ${p.sourceTips ? `<div class="hint">${M.esc(p.sourceTips)}</div>` : ''}
      </div>

      <div class="card stack-sm"><h3>3 · Collect sources</h3><p class="small muted">Paste the relevant text from each source (or upload a PDF). The text you paste is the only thing that counts as evidence.</p>
        ${p.sources.map(s => `<div class="row small" style="border-top:1px solid var(--line);padding-top:8px;flex-wrap:nowrap"><span class="tag">${s.label}</span><div style="flex:1;min-width:0"><b>${M.esc(s.title)}</b>${s.url ? ` · <a href="${M.esc(s.url)}" target="_blank" rel="noopener">link</a>` : ''}<div class="tiny muted">${s.text.length.toLocaleString()} characters</div></div><button class="icon-btn" data-action="rs-del" data-pid="${p.id}" data-sid="${s.id}" aria-label="Remove source">${M.icon.trash}</button></div>`).join('')}
        <details class="fold" ${p.sources.length ? '' : 'open'}><summary>Add a source</summary><div class="stack-sm">
          <input class="input" id="rsTitle" placeholder="Title (e.g. WHO report 2023, or article headline)">
          <input class="input" id="rsUrl" placeholder="URL (optional)" inputmode="url">
          <textarea class="textarea" id="rsText" rows="5" placeholder="Paste the source text here (at least a paragraph)…"></textarea>
          <div class="row"><button class="btn primary sm" data-action="rs-add" data-pid="${p.id}">Add source</button><label class="btn sm upload-btn">${M.icon.upload} Upload PDF/text<input type="file" id="rsFile" accept=".pdf,.txt,.md,application/pdf,text/plain"></label></div>
          <div id="rsFileStatus" class="hint"></div>
        </div></details>
      </div>

      <div class="card stack-sm"><div class="row-between"><h3>4 · Verify claims</h3><button class="btn sm primary" data-action="rs-verify" data-pid="${p.id}" ${!p.sources.length || busy('verify') ? 'disabled' : ''}>Extract & verify</button></div>
        ${busy('verify') ? M.loadingHTML(R.busy[p.id + 'verify'] === true ? 'Checking claims against your sources…' : R.busy[p.id + 'verify']) : ''}${R.err[p.id + 'verify'] ? M.errorHTML(R.err[p.id + 'verify']) : ''}
        ${p.claims.length ? `<div class="row"><span class="tag ok">✓ ${verified.length} quote-verified</span>${rejected.length ? `<span class="tag bad">✗ ${rejected.length} rejected (quote not found)</span>` : ''}</div>` : ''}
        ${verified.map(c => claimHTML(p, c)).join('')}
        ${rejected.length ? `<details class="fold"><summary>Rejected claims (${rejected.length})</summary><div class="stack-sm">${rejected.map(c => claimHTML(p, c)).join('')}<p class="hint">These were proposed by the AI, but their quotes don’t appear in your source text, so they’re excluded from the analysis.</p></div></details>` : ''}
      </div>

      <div class="card stack-sm"><div class="row-between"><h3>5–7 · Compare, analyze, conclude</h3><button class="btn sm primary" data-action="rs-conclude" data-pid="${p.id}" ${!verified.length || busy('conclude') ? 'disabled' : ''}>Compare & conclude</button></div>
        ${busy('conclude') ? M.loadingHTML('Comparing sources and drawing a conclusion…') : ''}${R.err[p.id + 'conclude'] ? M.errorHTML(R.err[p.id + 'conclude']) : ''}
        ${p.synthesis ? synthHTML(p) : '<p class="small muted">Uses only quote-verified claims.</p>'}
      </div>
      <button class="btn danger sm" data-action="rs-delete" data-pid="${p.id}" style="align-self:flex-start">${M.icon.trash} Delete research</button>
    </div>`;
    const f = view.querySelector('#rsFile');
    if(f) f.addEventListener('change', async () => {
      const file = f.files[0]; if(!file) return; const st = view.querySelector('#rsFileStatus');
      try { const book = await Source.read(file, m => st.textContent = m); if(book.scanned) throw new Error('This PDF is scanned (only images). Paste the text instead.');
        view.querySelector('#rsText').value = book.pages.join('\n\n').slice(0, 40000); if(!view.querySelector('#rsTitle').value) view.querySelector('#rsTitle').value = file.name.replace(/\.[^.]+$/, ''); st.textContent = 'Loaded. Check the title, then tap “Add source”.'; }
      catch(e){ st.textContent = e.message; }
    });
  }

  function claimHTML(p, c){
    const s = p.sources.find(s => s.id === c.sourceId);
    return `<div class="claim ${c.verified ? '' : 'bad'}"><div class="row"><span class="tag">${s ? s.label : '?'}</span><span class="tag ${c.verified ? 'ok' : 'bad'}">${c.verified ? '✓ quote verified' : '✗ not found'}</span>${c.strength ? `<span class="tag">${M.esc(c.strength)}</span>` : ''}</div><div><b>${M.esc(c.claim)}</b></div><div class="src-quote">“${M.esc(c.quote)}”</div></div>`;
  }
  function synthHTML(p){
    const s = p.synthesis; const lab = x => (x || []).map(l => `<span class="tag">${M.esc(l)}</span>`).join(' ');
    return `<div class="stack">
      <div class="card soft stack-sm"><div class="row"><span class="eyebrow">Conclusion</span><span class="tag ${s.confidence === 'high' ? 'ok' : s.confidence === 'low' ? 'bad' : 'warn'}">confidence: ${M.esc(s.confidence || 'medium')}</span></div><div class="prose">${M.md(s.answer)}</div></div>
      <div class="stack-sm"><div class="row"><span class="tag src">From your sources · verified</span></div>${(s.fromSources || []).map(x => `<div class="small">• ${M.esc(x.point)} ${lab(x.cites)}</div>`).join('') || '<p class="small muted">—</p>'}</div>
      ${s.conflicts && s.conflicts.length ? `<div class="stack-sm"><div class="row"><span class="tag warn">Conflicts between sources</span></div>${s.conflicts.map(c => `<div class="small"><b>${M.esc(c.issue)}</b>${(c.sides || []).map(sd => `<div>– ${M.esc(sd.position)} ${lab(sd.cites)}</div>`).join('')}</div>`).join('')}</div>` : ''}
      <div class="stack-sm"><div class="row"><span class="tag extra">AI interpretation (not from sources)</span></div><div class="prose small">${M.md(s.interpretation || '—')}</div></div>
      ${s.gaps && s.gaps.length ? `<div class="stack-sm"><div class="row"><span class="tag bad">Evidence gaps</span></div><ul class="small" style="margin:0;padding-left:1.2em">${s.gaps.map(g => `<li>${M.esc(g)}</li>`).join('')}</ul></div>` : ''}
      ${s.uncertainty ? `<div class="small"><b>Uncertainty:</b> ${M.esc(s.uncertainty)}</div>` : ''}
    </div>`;
  }

  async function job(p, k, fn){
    if(!AI.ready()){ R.err[p.id + k] = AI.friendly('offline'); M.render(); return; }
    R.busy[p.id + k] = true; delete R.err[p.id + k]; M.render();
    try { await fn(); save(); } catch(e){ R.err[p.id + k] = e.message; }
    finally { delete R.busy[p.id + k]; if(M.current.name === 'research') M.render(); }
  }

  M.action('rs-plan', el => { const p = find(el.dataset.pid); job(p, 'plan', async () => {
    const r = await AI.json(`Help plan research for: "${p.question}". Break it into 2-4 sub-questions and 4-6 precise web search queries (include one for systematic reviews/meta-analyses and one for counter-evidence). Suggest what kinds of sources are most reliable here. Do NOT cite or invent any specific source.
Reply ONLY JSON {"subqs":["…"],"queries":["…"],"sourceTips":"one sentence"}`, { tier:'quick' });
    p.subqs = (r.subqs || []).map(String).slice(0, 4); p.queries = (r.queries || []).map(String).slice(0, 6); p.sourceTips = String(r.sourceTips || '');
  }); });

  M.action('rs-add', el => {
    const p = find(el.dataset.pid); const v = id => document.getElementById(id).value.trim();
    const title = v('rsTitle') || 'Untitled source', url = v('rsUrl'), text = v('rsText');
    if(text.length < 150){ M.toast('Paste more of the source text (at least a paragraph).'); return; }
    if(url && !/^https?:\/\//i.test(url)){ M.toast('The URL should start with http:// or https://'); return; }
    p.sources.push({ id: M.uid('s'), label: 'S' + (p.sources.length + 1), title, url, text: text.slice(0, 40000), added: Date.now() });
    p.synthesis = null; save(); M.render();
  });
  M.action('rs-del', el => { const p = find(el.dataset.pid); p.sources = p.sources.filter(s => s.id !== el.dataset.sid); p.claims = p.claims.filter(c => c.sourceId !== el.dataset.sid); p.synthesis = null; save(); M.render(); });
  M.action('rs-delete', el => { if(el.dataset.confirm !== '1'){ el.dataset.confirm = '1'; el.textContent = 'Tap again to delete'; return; } Store.state.research = Store.state.research.filter(p => p.id !== el.dataset.pid); save(); M.go('research'); });

  M.action('rs-verify', el => { const p = find(el.dataset.pid); job(p, 'verify', async () => {
    const claims = [];
    for(const [i, s] of p.sources.slice(0, 8).entries()){
      R.busy[p.id + 'verify'] = `Extracting claims from ${s.label} (${i + 1} of ${Math.min(8, p.sources.length)})…`; if(M.current.name === 'research') M.render();
      const r = await AI.json(`Extract the 2-6 claims in this SOURCE that are most relevant to the question. For each, copy an EXACT supporting quote (a contiguous sentence or phrase, 12-300 characters, copied character-for-character from the source; do not paraphrase or join separate sentences). Rate evidence strength (e.g. "study data", "expert opinion", "anecdote").
QUESTION: ${p.question}
SOURCE ${s.label} — ${s.title}:
"""${s.text.slice(0, 14000)}"""
Reply ONLY JSON {"claims":[{"claim":"…","quote":"exact text","strength":"…"}]}`, { tier:'default' });
      (r.claims || []).slice(0, 6).forEach(c => { if(!c || !c.quote) return; claims.push({ sourceId: s.id, claim: String(c.claim || '').slice(0, 300), quote: String(c.quote).slice(0, 400), strength: String(c.strength || '').slice(0, 40), verified: Source.verify(c.quote, s.text) }); });
    }
    p.claims = claims; p.synthesis = null;
  }); });

  M.action('rs-conclude', el => { const p = find(el.dataset.pid); job(p, 'conclude', async () => {
    const v = p.claims.filter(c => c.verified); const labels = new Set(p.sources.map(s => s.label));
    const list = v.map(c => { const s = p.sources.find(s => s.id === c.sourceId); return `[${s.label}] (${s.title}; ${c.strength}) ${c.claim} — "${c.quote}"`; }).join('\n');
    const r = await AI.json(`Answer the research question using ONLY these verified claims. Compare sources, find agreements and conflicts, name evidence gaps, and state uncertainty honestly. Keep your own interpretation separate from what the sources say. Never introduce facts, numbers or sources that are not in the list.
QUESTION: ${p.question}
VERIFIED CLAIMS:
${list}
Reply ONLY JSON {"answer":"2-4 sentence conclusion, careful and hedged where needed","confidence":"low|medium|high","fromSources":[{"point":"…","cites":["S1"]}],"conflicts":[{"issue":"…","sides":[{"position":"…","cites":["S2"]}]}],"interpretation":"your reasoning/interpretation beyond the sources (clearly an interpretation)","gaps":["what evidence is missing"],"uncertainty":"one sentence"}`, { tier:'default' });
    const clean = arr => (arr || []).map(String).filter(l => labels.has(l));
    p.synthesis = { answer: String(r.answer || ''), confidence: ['low','medium','high'].includes(r.confidence) ? r.confidence : 'medium', fromSources: (r.fromSources || []).map(x => ({ point: String(x.point || ''), cites: clean(x.cites) })).filter(x => x.cites.length), conflicts: (r.conflicts || []).map(c => ({ issue: String(c.issue || ''), sides: (c.sides || []).map(sd => ({ position: String(sd.position || ''), cites: clean(sd.cites) })) })), interpretation: String(r.interpretation || ''), gaps: (r.gaps || []).map(String), uncertainty: String(r.uncertainty || ''), at: Date.now() };
  }); });
})();
