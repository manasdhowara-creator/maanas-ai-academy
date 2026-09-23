/* coding.js — Coding Engine: browser Coding Lab. JavaScript runs in a sandboxed Web Worker (no DOM, no network, no storage,
   hard timeout); HTML/CSS runs in a sandboxed iframe (scripts only, no same-origin access). Visible + hidden tests,
   runtime error detection, static security review, optional AI review. Nothing ever reaches a server. */
(function(){
  const J = (id, title, level, fn, prompt, starter, tests, hidden) => ({ id, kind:'js', title, level, fn, prompt, starter, tests, hidden });
  const CH = [
    J('sum','Sum of an array','Easy','sumArray','Write `sumArray(nums)` that returns the sum of all numbers in the array. An empty array returns 0.','function sumArray(nums) {\n  // your code here\n}\n', [[[[1,2,3]],6],[[[]],0],[[[-5,5,10]],10]], [[[[0.5,0.25]],0.75],[[[100]],100]]),
    J('rev','Reverse a string','Easy','reverseString','Write `reverseString(s)` that returns the string backwards.','function reverseString(s) {\n  \n}\n', [[['hello'],'olleh'],[[''],'']], [[['ab c'],'c ba'],[['racecar'],'racecar']]),
    J('vowels','Count the vowels','Easy','countVowels','Write `countVowels(s)` that counts a, e, i, o, u (upper or lower case).','function countVowels(s) {\n  \n}\n', [[['hello'],2],[['AEIOU'],5]], [[['rhythm'],0],[['Programming Is Fun'],5]]),
    J('max','Largest number','Easy','maxOf','Write `maxOf(nums)` that returns the largest number, or `null` for an empty array. Try it without `Math.max`.','function maxOf(nums) {\n  \n}\n', [[[[3,9,2]],9],[[[-4,-2,-8]],-2]], [[[[7]],7],[[[]],null]]),
    J('pal','Palindrome check','Medium','isPalindrome','Write `isPalindrome(s)` that returns true if the text reads the same backwards, ignoring case, spaces and punctuation.','function isPalindrome(s) {\n  \n}\n', [[['Racecar'],true],[['hello'],false]], [[['A man, a plan, a canal: Panama'],true],[[''],true]]),
    J('fizz','FizzBuzz array','Medium','fizzBuzz','Write `fizzBuzz(n)` returning an array from 1 to n where multiples of 3 are "Fizz", of 5 are "Buzz", of both are "FizzBuzz", else the number.','function fizzBuzz(n) {\n  const out = [];\n  \n  return out;\n}\n', [[[5],[1,2,'Fizz',4,'Buzz']],[[0],[]]], [[[15],[1,2,'Fizz',4,'Buzz','Fizz',7,8,'Fizz','Buzz',11,'Fizz',13,14,'FizzBuzz']]]),
    J('cap','Capitalize words','Medium','capitalizeWords','Write `capitalizeWords(s)` that makes the first letter of every word uppercase and leaves the rest unchanged.','function capitalizeWords(s) {\n  \n}\n', [[['hello world'],'Hello World']], [[['javaScript is fun'],'JavaScript Is Fun'],[[''],'']]),
    J('uniq','Remove duplicates','Medium','unique','Write `unique(arr)` that removes duplicates, keeping the first occurrence order.','function unique(arr) {\n  \n}\n', [[[[1,2,2,3,1]],[1,2,3]]], [[[['a','b','a']],['a','b']],[[[]],[]]]),
    J('second','Second largest','Hard','secondLargest','Write `secondLargest(nums)` returning the second largest DISTINCT number, or `null` if there isn’t one.','function secondLargest(nums) {\n  \n}\n', [[[[5,1,4,5]],4],[[[10,20]],10]], [[[[2,2]],null],[[[-1,-3,-2]],-2]]),
    J('chunk','Chunk an array','Hard','chunk','Write `chunk(arr, size)` that splits an array into groups of `size` (the last group may be smaller).','function chunk(arr, size) {\n  \n}\n', [[[[1,2,3,4,5],2],[[1,2],[3,4],[5]]]], [[[[],3],[]],[[[1,2,3],3],[[1,2,3]]],[[[1,2,3],1],[[1],[2],[3]]]]),
    J('freq','Word frequency','Hard','wordFrequency','Write `wordFrequency(s)` returning an object counting each word (lower-cased). Empty text returns {}.','function wordFrequency(s) {\n  \n}\n', [[['the cat the'],{ the:2, cat:1 }]], [[['Hi hi HI'],{ hi:3 }],[[''],{}]]),
    { id:'card', kind:'html', title:'Profile card (HTML + CSS)', level:'Easy', prompt:'Build a profile card: an `<h1>` with a name, a `<p>` with a short bio, and a `<button class="btn">Follow</button>` with rounded corners (border-radius of 8px or more).', starter:'<div class="card">\n  <h1></h1>\n  <p></p>\n  <button class="btn">Follow</button>\n</div>\n<style>\n  .card { font-family: sans-serif; padding: 16px; }\n  .btn { }\n</style>\n',
      tests:[['Has a heading with text',"(document.querySelector('h1')||{}).textContent?.trim().length>0"],['Has a paragraph with text',"(document.querySelector('p')||{}).textContent?.trim().length>0"],['Button says Follow',"/^follow$/i.test((document.querySelector('button.btn')||{}).textContent?.trim()||'')"]], hidden:[['Button corners rounded ≥ 8px',"parseFloat(getComputedStyle(document.querySelector('button.btn')).borderTopLeftRadius)>=8"]] },
    { id:'center', kind:'html', title:'Center a box (CSS)', level:'Easy', prompt:'Make a `<div id="box">` that is exactly 200px wide and 200px tall and is centred horizontally on the page.', starter:'<div id="box"></div>\n<style>\n  #box { background: teal; }\n</style>\n',
      tests:[['Box is 200px wide',"Math.round(document.getElementById('box').getBoundingClientRect().width)===200"],['Box is 200px tall',"Math.round(document.getElementById('box').getBoundingClientRect().height)===200"]], hidden:[['Box is horizontally centred',"(()=>{const r=document.getElementById('box').getBoundingClientRect();return Math.abs(r.left-(document.documentElement.clientWidth-r.right))<=2&&r.left>0})()"]] },
    { id:'form', kind:'html', title:'Accessible sign-up form', level:'Medium', prompt:'Create a form with an email field `<input id="email" type="email" required>`, a `<label for="email">` for it, and a submit button.', starter:'<form>\n  \n</form>\n',
      tests:[['Email input exists with type="email"',"(document.getElementById('email')||{}).type==='email'"],['Label is connected to the input',"!!document.querySelector('label[for=\"email\"]')"]], hidden:[['Input is required',"!!document.getElementById('email')?.required"],['Has a submit button',"!!document.querySelector('form button:not([type=button]), form input[type=submit]')"]] },
    { id:'counter', kind:'html', title:'Click counter (HTML + JS)', level:'Medium', prompt:'Make a `<button id="inc">` and a `<span id="count">` that starts at 0. Each click adds 1 to the number shown.', starter:'<button id="inc">+1</button>\n<span id="count">0</span>\n<script>\n  // your code here\n</script>\n',
      tests:[['Count starts at 0',"document.getElementById('count').textContent.trim()==='0'"]], hidden:[['One click shows 1',"(()=>{document.getElementById('inc').click();return document.getElementById('count').textContent.trim()==='1'})()"],['Three clicks show 3',"(()=>{const b=document.getElementById('inc');b.click();b.click();return document.getElementById('count').textContent.trim()==='3'})()"]] },
  ];
  const C = window.Coding = { CH, state: {} };
  const byId = id => CH.find(c => c.id === id);
  const draft = (id, v) => { const d = Store.state.coding.drafts; if(v === undefined) return d[id]; d[id] = v; saveDraft(); };
  const saveDraft = M.debounce(() => Store.touch('profile'), 1500);

  /* ---------- static security review ---------- */
  const RULES = [
    [/\beval\s*\(/, 'Uses eval(): it runs any text as code. Avoid it; it’s a common injection risk.'],
    [/new\s+Function\s*\(/, 'Uses new Function(), which works like eval. Avoid running strings as code.'],
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/, 'Tries to use the network. Network access is blocked in the lab. In real apps, never send user data to unknown servers.'],
    [/localStorage|sessionStorage|document\.cookie|indexedDB/, 'Reads or writes browser storage or cookies. That’s not needed here, and it’s risky with sensitive data.'],
    [/\.innerHTML\s*=/, 'Sets innerHTML. If the text comes from a user, it can inject scripts (XSS). Prefer textContent.'],
    [/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/, 'Has an infinite loop pattern. Make sure there’s a way out, or it will hit the time limit.'],
    [/<script[^>]+src\s*=\s*["']?https?:/i, 'Loads an external script. Only load code from sources you trust.'],
    [/target=["']_blank["'](?![^>]*rel=)/i, 'Opens links in a new tab without rel="noopener". Add it to protect your page.'],
    [/\bon(click|load|error|mouseover)\s*=\s*["']/i, 'Uses inline event handlers. addEventListener keeps code cleaner and safer.'],
    [/(password|api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{6,}/i, 'Looks like a secret or password in the code. Never put secrets in front-end code.'],
  ];
  C.security = code => RULES.filter(([re]) => re.test(code)).map(([, msg]) => msg);

  /* ---------- JS runner: Web Worker from a blob, learner code embedded as script (no eval), hard timeout ---------- */
  const PRELUDE = `const __post = m => postMessage(m);
const __fmt = v => { try { if (typeof v === 'string') return v; if (v === undefined) return 'undefined'; if (typeof v === 'function') return '[Function]'; return JSON.stringify(v); } catch (e) { return String(v); } };
console.log = (...a) => __post({ t: 'log', s: a.map(__fmt).join(' ') });
console.info = console.log; console.warn = (...a) => __post({ t: 'warn', s: a.map(__fmt).join(' ') }); console.error = (...a) => __post({ t: 'err', s: a.map(__fmt).join(' ') });
try { self.fetch = () => { throw new Error('Network access is disabled in the Coding Lab'); }; } catch (e) {}
try { self.XMLHttpRequest = undefined; } catch (e) {} try { self.WebSocket = undefined; } catch (e) {}
try { self.importScripts = () => { throw new Error('importScripts is disabled in the Coding Lab'); }; } catch (e) {}
try { Object.defineProperty(self, 'indexedDB', { value: undefined }); } catch (e) {} try { Object.defineProperty(self, 'caches', { value: undefined }); } catch (e) {}
`;
  const PRELUDE_LINES = PRELUDE.split('\n').length - 1;
  function harness(ch, tests){
    return `
;(function(){
  const __eq = (a, b) => { if (a === b) return true; if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9; if (a && b && typeof a === 'object' && typeof b === 'object') { if (Array.isArray(a) !== Array.isArray(b)) return false; const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; return ka.every(k => __eq(a[k], b[k])); } return false; };
  let fn; try { fn = typeof ${ch.fn} === 'function' ? ${ch.fn} : undefined; } catch (e) { fn = undefined; }
  if (!fn) { __post({ t: 'missing' }); return; }
  const tests = ${JSON.stringify(tests)};
  const res = tests.map(([args, exp, hidden]) => { try { const got = fn(...JSON.parse(JSON.stringify(args))); return { args, exp, got: got === undefined ? '__undef' : got, pass: __eq(got, exp), hidden }; } catch (e) { return { args, exp, err: String(e && e.message || e), pass: false, hidden }; } });
  __post({ t: 'tests', res });
})();`;
  }
  C.runJS = (ch, code, includeHidden) => new Promise(resolve => {
    const tests = ch.tests.map(t => [t[0], t[1], false]).concat(includeHidden ? ch.hidden.map(t => [t[0], t[1], true]) : []);
    const src = PRELUDE + code + '\n' + (ch.fn ? harness(ch, tests) : '');
    const out = { logs: [], tests: null, error: null, timeout: false, missing: false };
    let w;
    try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); }
    catch(e){ out.error = 'The sandbox could not start in this browser: ' + e.message; return resolve(out); }
    const done = () => { clearTimeout(timer); w.terminate(); resolve(out); };
    const timer = setTimeout(() => { out.timeout = true; done(); }, 2500);
    w.onmessage = e => { const m = e.data; if(m.t === 'log' || m.t === 'warn' || m.t === 'err') out.logs.push(m); else if(m.t === 'tests'){ out.tests = m.res; done(); } else if(m.t === 'missing'){ out.missing = true; done(); } };
    w.onerror = e => { e.preventDefault(); const line = e.lineno ? e.lineno - PRELUDE_LINES : null; out.error = (e.message || 'Error').replace(/^Uncaught /, '') + (line && line > 0 && line <= code.split('\n').length ? ` (line ${line})` : ''); done(); };
    if(!ch.fn) setTimeout(() => { if(!out.error && !out.timeout){ done(); } }, 600);
  });

  /* ---------- HTML runner: sandboxed iframe (allow-scripts only) + postMessage tests ---------- */
  C.runHTML = (frame, ch, code, includeHidden) => new Promise(resolve => {
    const tests = (ch.tests || []).map(t => [t[0], t[1], false]).concat(includeHidden ? (ch.hidden || []).map(t => [t[0], t[1], true]) : []);
    const token = M.uid('tk');
    const runner = `<script>window.addEventListener('load',function(){setTimeout(function(){var T=[${tests.map(t => `[${JSON.stringify(t[0])},function(){return (${t[1]})},${t[2]}]`).join(',')}];var r=T.map(function(t){try{return{name:t[0],pass:!!t[1](),hidden:t[2]}}catch(e){return{name:t[0],pass:false,err:String(e.message||e),hidden:t[2]}}});parent.postMessage({token:${JSON.stringify(token)},res:r},'*')},50)});window.onerror=function(m,s,l){parent.postMessage({token:${JSON.stringify(token)},error:m+' (line '+l+')'},'*')};<\/script>`;
    const onMsg = e => { if(e.source !== frame.contentWindow || !e.data || e.data.token !== token) return; if(e.data.error){ err = e.data.error; return; } window.removeEventListener('message', onMsg); clearTimeout(timer); resolve({ tests: e.data.res, error: err }); };
    let err = null;
    window.addEventListener('message', onMsg);
    const timer = setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ tests: null, error: err, timeout: true }); }, 3500);
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${code}${tests.length ? runner : ''}</body></html>`;
  });

  /* ---------- views ---------- */
  M.route('coding', (view, id) => {
    if(id === 'play') return renderEditor(view, { id:'play', kind: C.state.playKind || 'js', title:'Free playground', level:'', prompt:'Try anything. JavaScript runs in a locked sandbox. HTML/CSS shows a live preview.', starter: C.state.playKind === 'html' ? '<h1>Hello</h1>\n<style>h1{color:teal}</style>\n' : 'console.log("Hello from the sandbox!");\n', tests:[], hidden:[] });
    const ch = id && byId(id);
    if(ch) return renderEditor(view, ch);
    const solved = Store.state.coding.solved;
    const next = CH.find(c => !solved[c.id]);
    view.innerHTML = `<div class="stack">
      <div><div class="eyebrow">Coding Lab</div><h1>Write real code. Prove it with tests.</h1><p class="muted" style="margin-top:6px">JavaScript, HTML and CSS run safely in your browser: sandboxed, no network, with a time limit. Pass the visible tests, then the hidden ones.</p></div>
      <div class="row"><span class="tag ok">${Object.keys(solved).length}/${CH.length} solved</span>${next ? `<a class="btn primary" href="#coding-${next.id}">${Object.keys(solved).length ? 'Next challenge' : 'Start coding'}: ${M.esc(next.title)} ${M.icon.arrow}</a>` : ''}<a class="btn" href="#coding-play">Free playground</a></div>
      <div class="grid grid-3">${CH.map(c => `<a class="card card-link stack-sm" href="#coding-${c.id}"><div class="row-between"><span class="tag">${c.kind === 'js' ? 'JavaScript' : 'HTML/CSS'}</span>${solved[c.id] ? '<span class="tag ok">✓ solved</span>' : `<span class="tag">${c.level}</span>`}</div><h3>${M.esc(c.title)}</h3><p class="small muted">${M.esc(c.prompt.replace(/`/g, '').slice(0, 90))}…</p></a>`).join('')}</div>
    </div>`;
  });

  function renderEditor(view, ch){
    const code = draft(ch.id) ?? ch.starter;
    const idx = CH.indexOf(ch), next = CH[idx + 1];
    view.innerHTML = `<div class="stack">
      <a class="btn ghost sm" href="#coding" style="align-self:flex-start;padding-left:0">${M.icon.back} Coding Lab</a>
      <div class="row-between"><div><div class="row"><span class="tag">${ch.kind === 'js' ? 'JavaScript' : 'HTML/CSS'}</span>${ch.level ? `<span class="tag">${ch.level}</span>` : ''}${Store.state.coding.solved[ch.id] ? '<span class="tag ok">✓ solved</span>' : ''}</div><h1 style="font-size:clamp(1.4rem,4.5vw,2rem);margin-top:6px">${M.esc(ch.title)}</h1></div>${ch.id === 'play' ? `<div class="chips"><button class="chip ${ch.kind === 'js' ? 'on' : ''}" data-action="play-kind" data-k="js">JS</button><button class="chip ${ch.kind === 'html' ? 'on' : ''}" data-action="play-kind" data-k="html">HTML/CSS</button></div>` : ''}</div>
      <div class="prose">${M.md(ch.prompt)}</div>
      ${ch.tests.length ? `<details class="fold"><summary>Visible tests (${ch.tests.length}) · hidden tests: ${ch.hidden.length}</summary><div class="test-list">${ch.tests.map(t => `<div class="test mono">${ch.kind === 'js' ? `${ch.fn}(${t[0].map(a => JSON.stringify(a)).join(', ')}) → ${JSON.stringify(t[1])}` : M.esc(t[0])}</div>`).join('')}</div></details>` : ''}
      <div class="editor-wrap"><textarea class="editor" id="ed" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Code editor">${M.esc(code)}</textarea>
        <div class="editor-keys">${['Tab','{','}','(',')','[',']',';','=','"',"'",'`','<','>','/','=>'].map(k => `<button type="button" data-key="${M.esc(k)}">${M.esc(k)}</button>`).join('')}</div></div>
      <div class="row"><button class="btn primary" data-action="code-run" data-id="${ch.id}">${M.icon.play} Run</button>${ch.tests.length ? `<button class="btn" data-action="code-submit" data-id="${ch.id}">${M.icon.check} Submit (all tests)</button>` : ''}<button class="btn" data-action="code-review" data-id="${ch.id}">${M.icon.spark} AI review</button><button class="btn ghost" data-action="code-reset" data-id="${ch.id}">Reset</button></div>
      ${ch.kind === 'html' ? `<div class="stack-sm"><span class="label">Preview (sandboxed)</span><iframe class="preview-frame" id="pv" sandbox="allow-scripts" title="Preview"></iframe></div>` : ''}
      <div class="stack-sm"><span class="label">Console</span><div class="console" id="con"><span class="dim">Run your code to see output here.</span></div></div>
      <div id="tests"></div><div id="sec"></div><div id="rev"></div>
      ${next && ch.id !== 'play' ? `<a class="btn ghost" href="#coding-${next.id}" style="align-self:flex-start">Next challenge: ${M.esc(next.title)} ${M.icon.arrow}</a>` : ''}
    </div>`;
    const ed = view.querySelector('#ed');
    ed.addEventListener('input', () => draft(ch.id, ed.value));
    ed.addEventListener('keydown', e => { if(e.key === 'Tab'){ e.preventDefault(); insert(ed, '  '); } });
    view.querySelector('.editor-keys').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; insert(ed, b.dataset.key === 'Tab' ? '  ' : b.dataset.key); ed.focus(); });
    C.current = ch;
  }
  function insert(ed, s){ const a = ed.selectionStart, b = ed.selectionEnd; ed.value = ed.value.slice(0, a) + s + ed.value.slice(b); ed.selectionStart = ed.selectionEnd = a + s.length; ed.dispatchEvent(new Event('input')); }

  async function run(chId, full){
    const ch = chId === 'play' ? C.current : byId(chId); const code = document.getElementById('ed').value;
    const con = document.getElementById('con'), tbox = document.getElementById('tests'), sec = document.getElementById('sec');
    con.innerHTML = '<span class="dim">Running in sandbox…</span>'; tbox.innerHTML = '';
    const warns = C.security(code);
    sec.innerHTML = warns.length ? `<div class="card stack-sm"><div class="row">${M.icon.shield}<b>Security review</b></div>${warns.map(w => `<div class="notice warn small">${M.icon.alert}<div>${M.esc(w)}</div></div>`).join('')}</div>` : `<div class="notice ok small">${M.icon.shield}<div><b>Security review:</b> no risky patterns found.</div></div>`;
    let res;
    if(ch.kind === 'js'){
      res = await C.runJS(ch, code, full);
      let log = res.logs.map(l => `<div class="${l.t === 'err' ? 'err' : ''}">${M.esc(l.s)}</div>`).join('');
      if(res.error) log += `<div class="err">✗ Error: ${M.esc(res.error)}</div>`;
      if(res.timeout) log += `<div class="err">✗ Timed out after 2.5 s. Check for an infinite loop.</div>`;
      if(res.missing) log += `<div class="err">✗ No function named ${M.esc(ch.fn)} was found. Keep the name exactly as given.</div>`;
      con.innerHTML = log || '<span class="dim">(no console output)</span>';
    } else {
      const frame = document.getElementById('pv');
      res = await C.runHTML(frame, ch, code, full);
      con.innerHTML = res.error ? `<div class="err">✗ ${M.esc(res.error)}</div>` : res.timeout && ch.tests.length ? '<div class="err">The preview tests could not run in this view.</div>' : '<span class="ok">Preview updated.</span>';
    }
    if(res.tests){
      const pass = res.tests.filter(t => t.pass).length;
      tbox.innerHTML = `<div class="card stack-sm"><div class="row-between"><b>Tests: ${pass}/${res.tests.length} passed</b>${full ? '<span class="tag">incl. hidden</span>' : ''}</div><div class="test-list">${res.tests.map(t => `<div class="test ${t.pass ? 'pass' : 'fail'}"><span>${t.pass ? '✓' : '✗'}</span><div class="mono">${t.hidden ? '<b>Hidden test</b>' + (t.pass ? '' : ch.kind === 'js' ? `: ${ch.fn}(${t.args.map(a => JSON.stringify(a)).join(', ')}) expected ${JSON.stringify(t.exp)}` : '') : ch.kind === 'js' ? `${ch.fn}(${t.args.map(a => JSON.stringify(a)).join(', ')})` : M.esc(t.name)}${t.hidden && ch.kind === 'html' ? ': ' + M.esc(t.name) : ''}${!t.pass && ch.kind === 'js' && !t.hidden ? ` → got ${t.err ? 'error: ' + M.esc(t.err) : M.esc(t.got === '__undef' ? 'undefined' : JSON.stringify(t.got))}, expected ${M.esc(JSON.stringify(t.exp))}` : ''}${!t.pass && t.err && ch.kind === 'html' ? ' · ' + M.esc(t.err) : ''}</div></div>`).join('')}</div></div>`;
      if(full && pass === res.tests.length && ch.id !== 'play'){
        const s = Store.state.coding.solved; s[ch.id] = { at: Date.now(), attempts: ((s[ch.id] || {}).attempts || 0) + 1 }; Store.touch('profile');
        tbox.insertAdjacentHTML('beforeend', `<div class="notice ok" style="margin-top:10px">${M.icon.check}<div><b>Solved: every visible and hidden test passes.</b> Try “AI review” for code-quality feedback, or move to the next challenge.</div></div>`);
      }
    }
    C.last = { code, res };
  }

  M.action('code-run', el => run(el.dataset.id, false));
  M.action('code-submit', el => run(el.dataset.id, true));
  M.action('code-reset', el => { const ch = el.dataset.id === 'play' ? C.current : byId(el.dataset.id); draft(ch.id, ch.starter); document.getElementById('ed').value = ch.starter; });
  M.action('play-kind', el => { C.state.playKind = el.dataset.k; delete Store.state.coding.drafts.play; M.render(); });
  M.action('code-review', async el => {
    const ch = el.dataset.id === 'play' ? C.current : byId(el.dataset.id); const box = document.getElementById('rev'); const code = document.getElementById('ed').value;
    if(!AI.ready()){ box.innerHTML = M.errorHTML(AI.friendly('offline') + ' Tests and the security review still work offline.'); return; }
    box.innerHTML = `<div class="card">${M.loadingHTML('Reviewing your code…')}</div>`;
    const results = C.last && C.last.code === code && C.last.res.tests ? C.last.res.tests.map(t => (t.pass ? 'PASS' : 'FAIL') + (t.hidden ? ' (hidden)' : '')).join(', ') : 'not run yet';
    try {
      const r = await AI.json(`You are a kind senior engineer reviewing a learner's code. The automated tests decide correctness. Your job is code quality, clarity, edge cases and security. Don't rewrite the whole solution. Give hints the learner can apply.
${AI.learner()}
CHALLENGE: ${ch.title}. ${ch.prompt}
TEST RESULTS: ${results}
CODE:
\`\`\`
${code.slice(0, 6000)}
\`\`\`
Reply ONLY JSON {"summary":"1-2 sentences","strengths":["…"],"issues":[{"line":number or null,"issue":"…","hint":"…"}],"security":["…"],"next":"one concrete next step or stretch goal"}`, { tier:'default', nocache:true });
      box.innerHTML = `<div class="card stack-sm"><div class="row">${M.icon.spark}<b>AI review</b><span class="tag">advice. The tests decide correctness</span></div><p>${M.esc(r.summary || '')}</p>${(r.strengths || []).length ? `<div class="small"><b>Good</b><ul style="margin:0;padding-left:1.2em">${r.strengths.map(s => `<li>${M.esc(s)}</li>`).join('')}</ul></div>` : ''}${(r.issues || []).length ? `<div class="small"><b>Improve</b><ul style="margin:0;padding-left:1.2em">${r.issues.map(i => `<li>${i.line ? `<span class="tag">line ${M.esc(i.line)}</span> ` : ''}${M.esc(i.issue)}: <i>${M.esc(i.hint || '')}</i></li>`).join('')}</ul></div>` : ''}${(r.security || []).length ? `<div class="small"><b>Security</b><ul style="margin:0;padding-left:1.2em">${r.security.map(s => `<li>${M.esc(s)}</li>`).join('')}</ul></div>` : ''}${r.next ? `<div class="small"><b>Next:</b> ${M.esc(r.next)}</div>` : ''}</div>`;
    } catch(e){ box.innerHTML = M.errorHTML(e.message); }
  });
})();
