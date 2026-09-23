/* labs.js — AI Labs: the AI Mastery Path (modular curriculum → each module runs the full mastery loop),
   AI Tool Practice Labs (LEARN → DO → SUBMIT → EVALUATE → IMPROVE) and Projects + Capstone (guided, checkpointed). */
(function(){
  const TRACKS = [
    { name:'Foundations', mods:[['found','AI Foundations','What AI is and isn’t, how it learns, where it fails'],['ml','Machine Learning','Training, features, overfitting, supervised vs unsupervised'],['dl','Deep Learning','Neural networks, layers, gradient descent, backprop intuition'],['genai','Generative AI','How models generate text, images and audio'],['llm','LLMs','Tokens, context windows, next-token prediction, hallucination'],['transformers','Transformers','Attention, embeddings, why transformers won']] },
    { name:'Using AI well', mods:[['prompt','Prompt Engineering','Role, context, constraints, examples, output formats, iteration'],['context','Context Engineering','Choosing what the model sees: documents, memory, instructions'],['tools','AI Tools','Choosing the right tool for the job'],['toolmastery','AI Tool Mastery','Expert workflows across chat, design, video and slides tools'],['apis','AI APIs','Requests, JSON outputs, keys, cost and errors'],['automation','Automation','Triggers, workflows, human approval points'],['rag','RAG','Retrieval-augmented generation: chunking, embeddings, grounding'],['agents','Agents','Tools, planning loops, memory, failure modes']] },
    { name:'Building', mods:[['coding','Coding for AI','Python/JS basics for calling models and handling data'],['proto','Prototyping','From idea to a working demo in a day'],['building','Building','Shipping reliable AI features'],['product','AI Product Thinking','Users, problems, MVP scope, success metrics']] },
    { name:'Research & evaluation', mods:[['airesearch','AI Research','Reading papers, claims vs evidence'],['research','Research','Asking good questions, verifying sources'],['eval','Evaluation','Test sets, rubrics, human vs automated grading'],['bench','Benchmarking','What benchmarks measure, and what they miss'],['redteam','Red Teaming','Finding failures safely and responsibly']] },
    { name:'Safety & strategy', mods:[['privacy','Privacy','Personal data, consent, minimisation'],['security','Security','Prompt injection, data leaks, secrets'],['responsible','Responsible AI','Bias, fairness, transparency, accountability'],['strategy','AI Strategy','Where AI creates value, build vs buy, risks'],['emerging','Emerging AI','Recent directions (the AI teacher’s knowledge has a cutoff, so verify anything recent)']] },
  ];
  const TOOLS = [
    { id:'claude', name:'Claude', url:'https://claude.ai', learn:['Give role + context + task + constraints + output format','Show one example of the output you want','Ask it to think step by step for hard problems','Iterate: diagnose what went wrong, then change one thing'], task:'Write a prompt that makes Claude generate a 5-question quiz (mixed types, with answers) on a topic you’re studying. Run it, improve it once, and submit: your final prompt, a short piece of the output, and what you changed after the first try.', rubric:['Clear task and audience','Relevant context provided','Constraints (count, difficulty, types)','Output format specified','Includes an example or a quality bar','Shows iteration: what changed and why','Learner checked the output for accuracy'] },
    { id:'chatgpt', name:'ChatGPT', url:'https://chatgpt.com', learn:['Same prompt, different models → different strengths','Compare on criteria, not vibes','Check facts independently'], task:'Run the SAME prompt in ChatGPT and in Claude. Submit the prompt, 3 concrete differences you saw in the outputs, the criteria you used to judge, and which you’d use for this task and why.', rubric:['Identical prompt used (fair test)','Concrete, specific differences','Explicit judging criteria','Accuracy checked, not just style','Reasoned, honest verdict'] },
    { id:'heygen', name:'HeyGen', url:'https://www.heygen.com', learn:['Script first: hook → explain → example → recap','Write what’s ON SCREEN for every line','Short sentences read better aloud'], task:'Write a 45–60 second explainer script on a topic you have MASTERED, split into scenes with on-screen notes. Produce it in HeyGen if you can (or just submit the storyboard). Submit the script + scene list (+ link if made).', rubric:['Content is accurate','Strong hook in the first line','Clear structure (hook, explain, example, recap)','On-screen visual notes for each scene','Fits 45–60 seconds (~120–160 words)'] },
    { id:'canva', name:'Canva', url:'https://www.canva.com', learn:['One message per design','Visual hierarchy: size, weight, colour, space','High contrast for readability'], task:'Design a one-page infographic of one of your mastery sheets. Submit a description of your layout (what’s biggest, what order the eye follows), a screenshot if you can, and the link.', rubric:['Clear visual hierarchy','Readable text and good contrast','Content accurate and concise','Uncluttered layout','Accessible (not colour-only meaning)'] },
    { id:'adobe', name:'Adobe Express / Firefly', url:'https://www.adobe.com/express/', learn:['Specific image prompts: subject, style, lighting, composition','Never imitate real brands or copyrighted characters','Always check generated text in images'], task:'Create a social post announcing a study group. If you generate an image, submit the exact prompt you used, the edits you made, and why. Add a screenshot if you can.', rubric:['Purpose is clear at a glance','Specific, well-formed image prompt','Ethical use (original, no copyrighted characters)','Legible text','Edits improved the result'] },
    { id:'miro', name:'Miro', url:'https://miro.com', learn:['Concept maps: nodes are ideas, links are labelled relations','Top-down: big idea → sub-ideas → examples'], task:'Build a concept map of a topic with at least 8 nodes and labelled links. Submit it as text: one link per line in the form “A → relation → B”.', rubric:['At least 8 relevant concepts','Links are labelled with correct relations','Clear hierarchy','Covers the key ideas','No factual errors'] },
    { id:'gamma', name:'Gamma', url:'https://gamma.app', learn:['Outline first, then generate','AI decks need fact-checking and trimming','Fewer words per slide'], task:'Write a 6-slide outline, generate a deck from it in Gamma, then improve it by hand. Submit your outline, what the AI got wrong or weak, and what you fixed.', rubric:['Logical 6-slide outline','Critical review of the AI output','Facts checked','Concrete improvements made','Slides are concise'] },
    { id:'apis', name:'AI APIs', url:'https://docs.claude.com', learn:['Never put API keys in front-end code','Ask for JSON and validate it','Handle errors, rate limits and retries','Estimate cost per request'], task:'Write (no need to run) code or pseudocode that calls a chat-model API and gets back JSON: include the instructions, a JSON shape example, how you store the API key safely, how you validate the response, and what happens on an error.', rubric:['Requests structured JSON output','Validates the response','API key kept out of client code','Error and retry handling','Cost/token awareness'] },
    { id:'connectors', name:'AI Apps & Connectors', url:'https://claude.ai', learn:['Least privilege: give access only to what’s needed','Human approval before sending or deleting','Plan for failures'], task:'Design an automation where an AI app uses connectors (e.g. email, drive, calendar). Describe the trigger, exactly what data it can access, each step, where a human approves, and the privacy risks.', rubric:['Clear trigger and goal','Least-privilege data access','Human-in-the-loop approval points','Failure handling','Privacy risks identified and mitigated'] },
    { id:'skills', name:'AI Skills', url:'https://docs.claude.com', learn:['A skill is a reusable instruction pack for a repeated task','Say WHEN to use it and exactly HOW','Include examples and quality checks'], task:'Write a reusable skill (instruction file) for a task you repeat. Include: name, when to use it, step-by-step procedure, output format, one example, and quality checks.', rubric:['Clear trigger (when to use)','Step-by-step procedure','Defined output format','Includes an example','Built-in quality checks'] },
  ];
  const PROJECTS = [
    { id:'quizpack', name:'Prompt pack: quiz generator', goal:'Build a set of prompts that generate reliable, high-quality quizzes, and prove it with an evaluation.', req:['3 prompts (easy/medium/hard quizzes)','A 5-point quality rubric','Test on 3 different topics','Evidence of iteration'], cps:['Write your 3 prompts and explain the design choices','Write your quality rubric and test plan','Run the tests: report scores per topic and the failures you found','Final version: what changed, and the before/after quality'] },
    { id:'rag', name:'Mini RAG, by hand', goal:'Understand retrieval-augmented generation by doing each step manually.', req:['One real document (2+ pages)','Chunking strategy','5 test questions','Grounded answers with quotes'], cps:['Describe your document and chunking strategy (size, overlap, why)','Write 5 questions and which chunks should answer each','Get answers using ONLY the chunks, then mark each claim as supported or not','Reflect: where would retrieval fail, and how would you fix it?'] },
    { id:'webtool', name:'Build a flashcard web tool', goal:'Use the Coding Lab to build a working flashcard app in HTML/CSS/JS.', req:['Add cards (question/answer)','Flip to reveal','Next/previous','Clean, mobile-friendly layout'], cps:['Plan: features, data structure, and screens','Paste your working HTML/JS (built in the Coding Lab playground)','Test report: what you tested and the bugs you fixed','Improvement: one feature you added after feedback'] },
    { id:'evalmodel', name:'Evaluate and red-team a model', goal:'Measure an AI model’s quality and find its failure modes responsibly.', req:['10-item test set with expected answers','Scoring rubric','Run on 2 models or 2 prompts','3 red-team prompts (safe, responsible)'], cps:['Your 10-item test set and rubric','Results table and your analysis','Red-team findings (what failed and why), shared responsibly','Recommendations and limitations of your evaluation'] },
  ];
  const CAPSTONE = { id:'capstone', name:'Capstone: your own AI product', goal:'Independently design, prototype and evaluate an AI product that solves a real problem. The AI guides you; it won’t build it for you.', req:['A real problem and real users','MVP scope','Architecture','A working prototype (any tool)','Evaluation with evidence'], cps:['Problem and users: who has it, how you know','Requirements and MVP scope (what you are NOT building)','Architecture: data, model(s), prompts/tools, human checks','Prototype: what you built and how to use it','Testing and evaluation: test set, results, failures','Reflection: what you’d improve, risks, and what you learned'] };

  const Labs = window.Labs = { TRACKS, TOOLS, PROJECTS, CAPSTONE, busy: {} };

  async function evaluate({ title, task, rubric, text, image, context }){
    if(!AI.ready()) throw new Error(AI.friendly('offline') + ' Your submission is saved. Evaluate it when the AI is on.');
    const prompt = `You are a demanding but encouraging instructor evaluating a learner's practical submission. Guide; do not do the work for them.
${AI.learner()}
ACTIVITY: ${title}
TASK: ${task}
${context ? 'CONTEXT (earlier checkpoints): ' + context.slice(0, 3000) : ''}
RUBRIC: ${rubric.map((r, i) => `${i + 1}. ${r}`).join(' ')}
SUBMISSION: """${text.slice(0, 7000)}"""${image ? '\n(A screenshot is attached. Evaluate what it shows.)' : ''}
Judge only what is actually in the submission. Reply ONLY JSON {"score":0-1,"verdict":"strong|good|needs work","criteria":[{"criterion":"…","met":true|false,"note":"short"}],"strengths":["…"],"improve":["specific next actions, most important first"],"question":"one question that pushes their thinking"}`;
    const r = await AI.json(prompt, { tier:'default', nocache:true, images: image || undefined });
    r.score = M.clamp(Number(r.score) || 0, 0, 1); return r;
  }
  const resultHTML = r => `<div class="feedback ${r.score >= 0.7 ? 'ok' : r.score >= 0.4 ? 'partial' : 'bad'}"><div class="fh">${r.score >= 0.7 ? 'Passed' : 'Not passed yet'} · ${M.esc(r.verdict || '')}</div>
    ${(r.criteria || []).length ? `<div class="stack-sm">${r.criteria.map(c => `<div class="row small" style="flex-wrap:nowrap;align-items:flex-start"><span class="tag ${c.met ? 'ok' : 'bad'}">${c.met ? '✓' : '✗'}</span><span><b>${M.esc(c.criterion)}</b>${c.note ? ': ' + M.esc(c.note) : ''}</span></div>`).join('')}</div>` : ''}
    ${(r.improve || []).length ? `<div class="small"><b>Improve next</b><ul style="margin:0;padding-left:1.2em">${r.improve.map(x => `<li>${M.esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.question ? `<div class="small"><b>Think about:</b> ${M.esc(r.question)}</div>` : ''}</div>`;

  function moduleTopic(id){ return Store.topicsList().find(t => t.aiModule === id); }

  M.route('labs', (view, param) => {
    if(param && param.startsWith('tool_')) return renderTool(view, TOOLS.find(t => t.id === param.slice(5)));
    if(param && param.startsWith('proj_')) return renderProject(view, param.slice(5) === 'capstone' ? CAPSTONE : PROJECTS.find(p => p.id === param.slice(5)));
    const tab = Labs.tab || 'path';
    const total = TRACKS.reduce((a, t) => a + t.mods.length, 0); const mastered = TRACKS.reduce((a, t) => a + t.mods.filter(m => { const x = moduleTopic(m[0]); return x && x.masteredAt; }).length, 0);
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">AI Labs</div><h1>Become excellent with AI.</h1><p class="muted" style="margin-top:6px">Learn the concepts with full mastery loops, practise on real tools, then build real projects and a capstone.</p></div>
      <div class="chips">${[['path','AI Mastery Path'],['tools','Tool Practice Labs'],['projects','Projects & Capstone']].map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-action="labs-tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="labsBody"></div></div>`;
    const b = view.querySelector('#labsBody');
    if(tab === 'path'){
      b.innerHTML = `<div class="stack"><div class="row"><span class="tag ok">${mastered}/${total} modules mastered</span><span class="hint">Each module is a full lesson: diagnose → learn → prove → master → revise.</span></div>
      ${!AI.ready() ? `<div class="notice warn small">${M.icon.info}<div>AI modules are generated live and need the AI teacher. ${M.esc(AI.friendly('offline'))}</div></div>` : ''}
      ${TRACKS.map((tr, ti) => `<div class="card stack-sm"><h3>${ti + 1}. ${tr.name}</h3>${tr.mods.map(([id, name, goal]) => { const t = moduleTopic(id); return `<div class="mini-item" style="cursor:default"><div class="grow"><div class="t">${M.esc(name)}</div><div class="s">${M.esc(goal)}</div></div>${t ? `${M.pill(Mastery.status(t))}<a class="btn sm" href="#topic-${t.id}">Open</a>` : `<button class="btn sm" data-action="ai-mod" data-id="${id}">Start</button>`}</div>`; }).join('')}</div>`).join('')}
      <div class="card stack-sm"><h3>6. Prove it</h3><div class="mini-item" style="cursor:default"><div class="grow"><div class="t">Teach-back</div><div class="s">Built into every module: you teach it back before it counts as mastered.</div></div></div><div class="mini-item" style="cursor:default"><div class="grow"><div class="t">Projects & Capstone</div><div class="s">Real builds, guided by checkpoints.</div></div><button class="btn sm" data-action="labs-tab" data-tab="projects">Open</button></div></div></div>`;
    } else if(tab === 'tools'){
      b.innerHTML = `<div class="stack"><div class="notice small">${M.icon.info}<div>You do the task in the real tool (it opens in a new tab), then submit what you made here for evaluation against a rubric. Many of these tools have free plans, but limits change, so check each tool’s current pricing.</div></div>
      <div class="grid grid-3">${TOOLS.map(t => { const s = Store.state.labs[t.id]; return `<a class="card card-link stack-sm" href="#labs-tool_${t.id}"><div class="row-between"><h3>${M.esc(t.name)}</h3>${s && s.best >= 0.7 ? '<span class="tag ok">✓ passed</span>' : s ? `<span class="tag warn">${s.attempts.length} attempt${s.attempts.length > 1 ? 's' : ''}</span>` : ''}</div><p class="small muted">${M.esc(t.task.slice(0, 96))}…</p></a>`; }).join('')}</div></div>`;
    } else {
      const done = p => { const s = Store.state.projects[p.id]; return s ? p.cps.filter((_, i) => s.cps && s.cps[i] && s.cps[i].passed).length : 0; };
      b.innerHTML = `<div class="grid grid-2">${PROJECTS.concat([CAPSTONE]).map(p => `<a class="card card-link stack-sm" href="#labs-proj_${p.id}"><div class="row-between"><h3>${M.esc(p.name)}</h3><span class="tag ${done(p) === p.cps.length ? 'ok' : ''}">${done(p)}/${p.cps.length} checkpoints</span></div><p class="small muted">${M.esc(p.goal)}</p></a>`).join('')}</div>`;
    }
  });
  M.action('labs-tab', el => { Labs.tab = el.dataset.tab; M.go('labs'); M.render(); });
  M.action('ai-mod', el => {
    if(!AI.ready()){ M.toast(AI.friendly('offline')); return; }
    const mod = TRACKS.flatMap(t => t.mods).find(m => m[0] === el.dataset.id);
    const t = Mastery.newTopic({ title: mod[1], query: `AI Mastery Path module "${mod[1]}": ${mod[2]}`, aiModule: mod[0], planned: false, subject:'AI', subjectKind:'ai' });
    Store.saveTopic(t); M.go('topic-' + t.id);
  });

  function imgInput(){ return AI.canSeeImages() ? `<label class="btn sm upload-btn">${M.icon.upload} Attach screenshot (optional)<input type="file" id="labImg" accept="image/*"></label><span class="hint" id="labImgName"></span>` : ''; }
  function bindImg(view){ const f = view.querySelector('#labImg'); if(f) f.addEventListener('change', () => { view.querySelector('#labImgName').textContent = f.files[0] ? f.files[0].name : ''; }); }

  function renderTool(view, tool){
    if(!tool){ M.go('labs'); return; }
    const s = Store.state.labs[tool.id] || { attempts: [], best: 0 }; const last = s.attempts[s.attempts.length - 1];
    view.innerHTML = `<div class="stack">
      <a class="btn ghost sm" href="#labs" data-action="labs-tab" data-tab="tools" style="align-self:flex-start;padding-left:0">${M.icon.back} Tool labs</a>
      <div class="row-between"><h1>${M.esc(tool.name)} lab</h1>${s.best >= 0.7 ? '<span class="tag ok">✓ passed</span>' : ''}</div>
      <div class="steps-bar">${['Learn','Do','Submit','Evaluate','Improve'].map((x, i) => `<span class="${i === 0 || (i <= 2) || (last && i <= 3) || (last && last.result && last.result.score < 0.7 && i === 4) ? 'done' : ''}">${x}</span>`).join('')}</div>
      <div class="card stack-sm"><h3>1 · Learn</h3><ul class="small" style="margin:0;padding-left:1.2em">${tool.learn.map(x => `<li>${M.esc(x)}</li>`).join('')}</ul></div>
      <div class="card stack-sm"><h3>2 · Do</h3><p>${M.esc(tool.task)}</p><div><a class="btn sm" href="${tool.url}" target="_blank" rel="noopener">${M.icon.link} Open ${M.esc(tool.name)}</a></div>
        <details class="fold"><summary>How it will be evaluated</summary><div><ul class="small" style="margin:0;padding-left:1.2em">${tool.rubric.map(x => `<li>${M.esc(x)}</li>`).join('')}</ul></div></details></div>
      <div class="card stack-sm"><h3>3 · Submit</h3><textarea class="textarea" id="labText" rows="8" placeholder="Paste your prompt, output, script, notes or code…">${last ? M.esc(last.text) : ''}</textarea><div class="row">${imgInput()}</div>
        <button class="btn primary" data-action="lab-submit" data-id="${tool.id}" ${Labs.busy[tool.id] ? 'disabled' : ''}>${Labs.busy[tool.id] ? 'Evaluating…' : last ? 'Resubmit improved version' : 'Submit for evaluation'}</button></div>
      ${Labs.err && Labs.err[tool.id] ? M.errorHTML(Labs.err[tool.id]) : ''}
      ${last && last.result ? `<div class="stack-sm"><h3>4 · Evaluation (attempt ${s.attempts.length})</h3>${resultHTML(last.result)}${last.result.score < 0.7 ? '<p class="small"><b>5 · Improve:</b> apply the feedback above, edit your submission, and resubmit.</p>' : ''}</div>` : ''}
    </div>`;
    bindImg(view);
  }
  M.action('lab-submit', async el => {
    const tool = TOOLS.find(t => t.id === el.dataset.id); const text = document.getElementById('labText').value.trim(); const img = document.getElementById('labImg');
    if(text.length < 40){ M.toast('Add more detail to your submission.'); return; }
    const s = Store.state.labs[tool.id] = Store.state.labs[tool.id] || { attempts: [], best: 0 };
    const att = { text, at: Date.now(), result: null }; s.attempts.push(att); if(s.attempts.length > 8) s.attempts.shift(); Store.touch('profile');
    Labs.busy[tool.id] = true; Labs.err = Labs.err || {}; delete Labs.err[tool.id]; M.render();
    try { att.result = await evaluate({ title: tool.name + ' lab', task: tool.task, rubric: tool.rubric, text, image: img && img.files[0] ? img.files[0] : null }); s.best = Math.max(s.best, att.result.score); Store.touch('profile'); }
    catch(e){ Labs.err[tool.id] = e.message; }
    delete Labs.busy[tool.id]; M.render();
  });

  function renderProject(view, p){
    if(!p){ M.go('labs'); return; }
    const s = Store.state.projects[p.id] || { cps: {} };
    const firstOpen = p.cps.findIndex((_, i) => !(s.cps[i] && s.cps[i].passed));
    view.innerHTML = `<div class="stack">
      <a class="btn ghost sm" href="#labs" data-action="labs-tab" data-tab="projects" style="align-self:flex-start;padding-left:0">${M.icon.back} Projects</a>
      <div><div class="eyebrow">${p.id === 'capstone' ? 'Capstone · independent' : 'Project'}</div><h1>${M.esc(p.name)}</h1><p class="muted" style="margin-top:6px">${M.esc(p.goal)}</p></div>
      <div class="card stack-sm"><h3>Requirements</h3><ul class="small" style="margin:0;padding-left:1.2em">${p.req.map(x => `<li>${M.esc(x)}</li>`).join('')}</ul>${p.id === 'webtool' ? '<a class="btn sm" href="#coding-play" style="align-self:flex-start">Open Coding Lab playground</a>' : ''}</div>
      ${firstOpen === -1 ? `<div class="notice ok">${M.icon.trophy}<div><b>Final result: every checkpoint passed.</b> This project is complete. Keep your submissions as a portfolio piece.</div></div>` : ''}
      ${p.cps.map((cp, i) => { const c = s.cps[i]; const locked = i > (firstOpen === -1 ? p.cps.length : firstOpen); return `<div class="card stack-sm" style="${locked ? 'opacity:.55' : ''}"><div class="row-between"><h3>Checkpoint ${i + 1}</h3>${c && c.passed ? '<span class="tag ok">✓ passed</span>' : locked ? '<span class="tag">locked</span>' : ''}</div><p>${M.esc(cp)}</p>
        ${locked ? '' : `<textarea class="textarea" id="cp-${i}" rows="6" placeholder="Your work for this checkpoint…">${c ? M.esc(c.text) : ''}</textarea><div class="row"><button class="btn ${c && c.passed ? '' : 'primary'} sm" data-action="proj-submit" data-id="${p.id}" data-i="${i}" ${Labs.busy[p.id + i] ? 'disabled' : ''}>${Labs.busy[p.id + i] ? 'Evaluating…' : c ? 'Resubmit' : 'Submit checkpoint'}</button></div>${Labs.err && Labs.err[p.id + i] ? M.errorHTML(Labs.err[p.id + i]) : ''}${c && c.result ? resultHTML(c.result) : ''}`}</div>`; }).join('')}
    </div>`;
  }
  M.action('proj-submit', async el => {
    const p = el.dataset.id === 'capstone' ? CAPSTONE : PROJECTS.find(x => x.id === el.dataset.id); const i = Number(el.dataset.i);
    const text = document.getElementById('cp-' + i).value.trim(); if(text.length < 60){ M.toast('Add more detail. Show your actual work.'); return; }
    const s = Store.state.projects[p.id] = Store.state.projects[p.id] || { cps: {} };
    s.cps[i] = { text, at: Date.now(), result: null, passed: false }; Store.touch('profile');
    Labs.busy[p.id + i] = true; Labs.err = Labs.err || {}; delete Labs.err[p.id + i]; M.render();
    const ctx = p.cps.slice(0, i).map((c, j) => s.cps[j] ? `CP${j + 1} (${c}): ${s.cps[j].text.slice(0, 500)}` : '').join('\n');
    try { const r = await evaluate({ title: `${p.name}: checkpoint ${i + 1}`, task: p.cps[i] + '. Project goal: ' + p.goal + '. Requirements: ' + p.req.join('; '), rubric: ['Directly addresses the checkpoint','Specific and concrete (real work, not generic)','Correct and well-reasoned','Consistent with earlier checkpoints','Shows independent thinking'], text, context: ctx });
      s.cps[i].result = r; s.cps[i].passed = r.score >= 0.7; Store.touch('profile'); }
    catch(e){ Labs.err[p.id + i] = e.message; }
    delete Labs.busy[p.id + i]; M.render();
  });
})();
