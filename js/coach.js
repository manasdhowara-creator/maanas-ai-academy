/* coach.js — AI Coach: a persistent tutor (English / Easy English / Hinglish) that explains, questions, detects confusion,
   draws simple diagrams, quizzes, reteaches and challenges — with the learner's topic, weak spots and mistakes as context. */
(function(){
  const LS = 'maa.coach';
  const Coach = window.Coach = { turns: [], topicId: null, ctl: null, busy: false };
  try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if(s){ Coach.turns = s.turns || []; Coach.topicId = s.topicId || null; } } catch(_){}
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ turns: Coach.turns.slice(-40), topicId: Coach.topicId })); } catch(_){} };

  Coach.setContext = (tid) => { if(Coach.topicId !== tid){ Coach.topicId = tid; Coach.turns = []; save(); } };

  function rules(){
    const t = Coach.topicId && Store.topic(Coach.topicId);
    const mist = Store.state.mistakes.filter(m => !m.resolved && (!t || m.topicId === t.id)).slice(-5).map(m => `- ${m.conceptName} (${m.errorType}): "${m.stem.slice(0, 100)}"`).join('\n');
    return `You are the AI Coach inside "Maanas AI Academy" (motto: Learn it. Prove it. Master it.). You are a TUTOR, not an answer machine.
${AI.learner(t || null)}
${t ? `CURRENT TOPIC: ${t.title} (${t.subject}). Concepts: ${t.concepts.map(c => c.name).join('; ')}. Status: ${Mastery.status(t).label}.` : 'No specific topic selected.'}
${mist ? 'RECENT UNRESOLVED MISTAKES:\n' + mist : ''}
HOW TO COACH:
- Keep replies focused (usually under 170 words) unless asked for depth. Use short paragraphs and bullets.
- End most replies with ONE quick question that checks understanding or moves the learner forward.
- If the learner seems confused (says they don't get it, gives a wrong answer, repeats a question), change the approach: analogy, real-life example, worked example or a diagram. Never just repeat the same explanation.
- For homework or test-style questions, guide with hints and questions first. Give the full answer only if they are still stuck after trying, or they explicitly ask to check their work.
- To draw a diagram, output a fenced block exactly like:
\`\`\`flow
Step one -> Step two -> Step three
\`\`\`
- When asked to quiz: ask ONE question at a time, wait for the answer, then give feedback.
- When asked to challenge: give a harder, unfamiliar problem.
- Be accurate. If unsure, say so. Never invent sources, statistics or quotes.
- Plain Unicode for maths (×, ², √). No LaTeX.`;
  }

  M.route('coach', (view) => {
    const topics = Store.topicsList();
    const lang = Store.state.profile.language || 'English';
    view.innerHTML = `<div class="stack">
      <div class="row-between"><div><div class="eyebrow">AI Coach</div><h1>Ask anything. I’ll teach, not just tell.</h1></div>${Coach.turns.length ? `<button class="btn sm" data-action="coach-clear">New chat</button>` : ''}</div>
      <div class="grid grid-2">
        <div class="field"><label for="coachTopic">Topic</label><select class="select" id="coachTopic"><option value="">General (no topic)</option>${topics.map(t => `<option value="${t.id}" ${t.id === Coach.topicId ? 'selected' : ''}>${M.esc(t.title)}</option>`).join('')}</select></div>
        <div class="field"><span class="label">Language</span><div class="chips">${['English','Easy English','Hinglish'].map(l => `<button class="chip ${l === lang ? 'on' : ''}" data-action="coach-lang" data-lang="${l}">${l}</button>`).join('')}</div></div>
      </div>
      ${!AI.ready() ? `<div class="notice warn">${M.icon.info}<div>${M.esc(AI.friendly(AI.status === 'denied' ? 'not_granted' : 'offline'))} Offline, you can still study the built-in lesson, use the Coding Lab, revise and review your mistakes.</div></div>` : ''}
      <div class="chat" id="chat">${Coach.turns.length ? Coach.turns.map(msgHTML).join('') : welcomeHTML()}</div>
      <div class="chips" id="quick">${['Explain it simply','Give me a real-life example','Draw a diagram','Quiz me','I’m confused','Challenge me'].map(q => `<button class="chip" data-action="coach-quick" data-q="${q}">${q}</button>`).join('')}</div>
      <form class="composer" id="coachForm"><textarea class="textarea" id="coachInput" rows="1" placeholder="Ask a doubt, paste a question, or say “quiz me”…" aria-label="Message the coach"></textarea><button class="btn primary" id="coachSend" type="submit" aria-label="Send">${Coach.busy ? M.icon.stop : M.icon.arrow}</button></form>
    </div>`;
    const input = view.querySelector('#coachInput');
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });
    input.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 960px)').matches){ e.preventDefault(); view.querySelector('#coachForm').requestSubmit(); } });
    view.querySelector('#coachForm').addEventListener('submit', e => { e.preventDefault(); if(Coach.busy){ Coach.ctl && Coach.ctl.abort(); return; } send(input.value); input.value = ''; input.style.height = ''; });
    view.querySelector('#coachTopic').addEventListener('change', e => { Coach.setContext(e.target.value || null); M.render(); });
    scrollEnd();
  });

  function welcomeHTML(){
    const t = Coach.topicId && Store.topic(Coach.topicId);
    return `<div class="msg ai"><div class="prose"><p>Hi${Store.state.profile.name ? ' ' + M.esc(Store.state.profile.name) : ''}! ${t ? `We’re on <b>${M.esc(t.title)}</b>. What’s confusing you?` : 'What would you like to understand today?'}</p><p class="small muted">I’ll explain, ask you questions to check you’ve got it, and switch approach if something doesn’t click.</p></div></div>`;
  }
  const msgHTML = m => m.role === 'user' ? `<div class="msg user">${M.esc(m.content)}</div>` : `<div class="msg ai"><div class="prose">${M.md(m.content)}</div></div>`;
  const scrollEnd = () => setTimeout(() => { const f = document.getElementById('coachForm'); if(f) f.scrollIntoView({ block:'end' }); }, 30);

  async function send(text){
    text = String(text || '').trim(); if(!text) return;
    if(!AI.ready()){ M.toast(AI.friendly('offline')); return; }
    Coach.turns.push({ role:'user', content: text }); save();
    const chat = document.getElementById('chat');
    if(Coach.turns.length === 1) chat.innerHTML = '';
    chat.insertAdjacentHTML('beforeend', msgHTML({ role:'user', content: text }) + `<div class="msg ai" id="pending"><div class="prose"><p class="muted">Thinking…</p></div></div>`);
    scrollEnd();
    Coach.busy = true; setSend(true); Coach.ctl = new AbortController();
    const bubble = document.getElementById('pending');
    const history = Coach.turns.slice(-14);
    const input = [{ role:'user', content: rules() }, ...history];
    if(input[1] && input[1].role === 'assistant') input.splice(1, 1);
    try {
      const reply = await AI.text(input, { cache:false, signal: Coach.ctl.signal, onText: ({ text }) => { bubble.querySelector('.prose').innerHTML = M.md(text); } });
      Coach.turns.push({ role:'assistant', content: reply }); save();
      bubble.querySelector('.prose').innerHTML = M.md(reply); bubble.removeAttribute('id');
    } catch(e){
      if(e.partial){ Coach.turns.push({ role:'assistant', content: e.partial + (e.code === 'cancelled' ? '' : '\n\n_(interrupted)_') }); save(); bubble.querySelector('.prose').innerHTML = M.md(e.partial); }
      else bubble.innerHTML = `<div class="small">${M.esc(e.message)}</div>`;
      bubble.removeAttribute('id');
    } finally { Coach.busy = false; setSend(false); scrollEnd(); }
  }
  function setSend(busy){ const b = document.getElementById('coachSend'); if(b){ b.innerHTML = busy ? M.icon.stop : M.icon.arrow; b.setAttribute('aria-label', busy ? 'Stop' : 'Send'); } }

  M.action('coach-quick', el => send(el.dataset.q));
  M.action('coach-clear', () => { Coach.turns = []; save(); M.render(); });
  M.action('coach-lang', el => { Store.state.profile.language = el.dataset.lang; Store.touch('profile'); M.render(); });
})();
