/* core.js — shared utilities, icons, markdown, router, action delegation */
(function(){
  const M = window.M = {};

  /* ---------- small helpers ---------- */
  M.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  M.uid = (p='') => p + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  M.now = () => Date.now();
  M.DAY = 86400000;
  M.clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  M.shuffle = a => { a = a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  M.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  M.norm = s => String(s ?? '').toLowerCase().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\p{L}\p{N}.\-+/ ]/gu,' ').replace(/\s+/g,' ').trim();
  M.words = s => M.norm(s).split(' ').filter(w => w.length > 2);
  M.similarity = (a,b) => { const A = new Set(M.words(a)), B = new Set(M.words(b)); if(!A.size || !B.size) return 0; let i=0; A.forEach(w => { if(B.has(w)) i++; }); return i / (A.size + B.size - i); };
  M.fmtDate = t => t ? new Date(t).toLocaleDateString(undefined, {day:'numeric', month:'short'}) : '—';
  M.startOfDay = t => { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
  M.daysUntil = t => Math.round((M.startOfDay(t) - M.startOfDay(Date.now())) / M.DAY);
  M.relDay = t => { const d = M.daysUntil(t); if(d === 0) return 'today'; if(d === 1) return 'tomorrow'; if(d === -1) return 'yesterday'; return d > 0 ? `in ${d} days` : `${-d} days ago`; };
  M.plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  M.cap = s => String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1);

  /* ---------- events ---------- */
  const listeners = {};
  M.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  M.emit = (evt, data) => (listeners[evt] || []).forEach(fn => { try { fn(data); } catch(e){ console.error(e); } });

  /* ---------- icons (stroke, 24 grid) ---------- */
  const I = (d, extra='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  M.icon = {
    home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    book: I('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>'),
    layers: I('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
    repeat: I('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>'),
    check: I('<path d="M4 12l5 5L20 6"/>'),
    x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
    test: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    chat: I('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
    alert: I('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    flag: I('<path d="M5 21V4h11l-1.5 4L16 12H5"/>'),
    target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    note: I('<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8 12h8M8 16h6"/>'),
    spark: I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
    flask: I('<path d="M9 3h6M10 3v6L4 20h16L14 9V3"/><path d="M7 15h10"/>'),
    code: I('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
    folder: I('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    grid: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'),
    play: I('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
    pause: I('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'),
    next: I('<path d="M6 5l9 7-9 7z" fill="currentColor"/><path d="M18 5v14"/>'),
    prev: I('<path d="M18 5l-9 7 9 7z" fill="currentColor"/><path d="M6 5v14"/>'),
    expand: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    volume: I('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>'),
    mute: I('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    calendar: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    back: I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    trash: I('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    teacher: I('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20l4-4 4 4"/><path d="M7 9h6M7 12h9"/>'),
    brain: I('<path d="M9 4a3 3 0 00-3 3v.5A3 3 0 004 10.5 3 3 0 005 13a3 3 0 001 5 3 3 0 006 1V5a2 2 0 00-3-1z"/><path d="M15 4a3 3 0 013 3v.5a3 3 0 012 3A3 3 0 0119 13a3 3 0 01-1 5 3 3 0 01-6 1"/>'),
    link: I('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
    copy: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
    shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    trophy: I('<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M10 14h4v3h-4zM8 21h8M12 17v4"/>'),
    more: I('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
    edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    stop: I('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  };

  /* ---------- flow diagram (used by markdown ```flow and visuals) ---------- */
  M._fid = 0;
  M.flowSVG = (steps, opts={}) => {
    steps = steps.filter(Boolean).slice(0, 8);
    if(!steps.length) return '';
    const vertical = opts.vertical ?? steps.length > 4;
    const w = vertical ? 320 : Math.max(360, steps.length * 150), boxW = vertical ? 260 : 128, boxH = 54, gap = vertical ? 26 : 22;
    const h = vertical ? steps.length * (boxH + gap) + 10 : boxH + 30;
    const mid = 'ah' + (++M._fid);
    let s = `<svg class="flow-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Flow: ${M.esc(steps.join(' then '))}" style="width:100%;max-width:${vertical?360:w}px;height:auto">`;
    steps.forEach((t, i) => {
      const x = vertical ? (w - boxW)/2 : 10 + i * (boxW + gap), y = vertical ? 5 + i * (boxH + gap) : 15;
      s += `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="10" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>`;
      s += wrapText(t, x + boxW/2, y + boxH/2, vertical ? 34 : 16, 'var(--ink)', 13);
      if(i < steps.length - 1){
        if(vertical) s += `<path d="M${w/2} ${y+boxH+3} V${y+boxH+gap-4}" stroke="var(--accent)" stroke-width="2" marker-end="url(#${mid})" fill="none"/>`;
        else s += `<path d="M${x+boxW+3} ${y+boxH/2} H${x+boxW+gap-3}" stroke="var(--accent)" stroke-width="2" marker-end="url(#${mid})" fill="none"/>`;
      }
    });
    s += `<defs><marker id="${mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--accent)"/></marker></defs></svg>`;
    return s;
  };
  function wrapText(t, cx, cy, maxChars, fill, size){
    const words = String(t).split(/\s+/); const lines = []; let cur = '';
    words.forEach(w => { if((cur + ' ' + w).trim().length > maxChars && cur){ lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if(cur) lines.push(cur);
    const ls = lines.slice(0, 3); const lh = size * 1.2; const y0 = cy - (ls.length - 1) * lh / 2;
    return `<text text-anchor="middle" dominant-baseline="middle" fill="${fill}" font-size="${size}">${ls.map((l,i) => `<tspan x="${cx}" y="${y0 + i*lh}">${M.esc(l)}</tspan>`).join('')}</text>`;
  }
  M.wrapText = wrapText;

  /* ---------- safe markdown ---------- */
  M.md = (src) => {
    src = String(src ?? '').replace(/\r/g,'');
    const blocks = []; // protect fenced code
    src = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const i = blocks.length;
      if(lang === 'flow'){
        const steps = code.split(/\n|->|→/).map(s => s.trim()).filter(Boolean);
        blocks.push(`<div class="example" style="overflow-x:auto">${M.flowSVG(steps)}</div>`);
      } else blocks.push(`<pre><code>${M.esc(code.replace(/\n$/,''))}</code></pre>`);
      return `\n\u0000B${i}\u0000\n`;
    });
    const inline = s => M.esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = src.split('\n'); let out = ''; let list = null; let para = []; let table = [];
    const flushPara = () => { if(para.length){ out += `<p>${inline(para.join(' '))}</p>`; para = []; } };
    const flushList = () => { if(list){ out += `<${list.type}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.type}>`; list = null; } };
    const flushTable = () => {
      if(table.length){
        const rows = table.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\s*\||\|\s*$/g,'').split('|').map(c => c.trim()));
        out += `<div class="table-wrap"><table class="t"><thead><tr>${rows[0].map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        table = [];
      }
    };
    for(const raw of lines){
      const line = raw.trimEnd();
      const b = line.match(/^\u0000B(\d+)\u0000$/);
      if(b){ flushPara(); flushList(); flushTable(); out += blocks[+b[1]]; continue; }
      if(/^\s*\|.*\|\s*$/.test(line)){ flushPara(); flushList(); table.push(line); continue; } else flushTable();
      let m;
      if(!line.trim()){ flushPara(); flushList(); continue; }
      if((m = line.match(/^#{1,6}\s+(.*)/))){ flushPara(); flushList(); out += `<h4>${inline(m[1])}</h4>`; continue; }
      if((m = line.match(/^\s*>\s?(.*)/))){ flushPara(); flushList(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
      if((m = line.match(/^\s*[-*•]\s+(.*)/))){ flushPara(); if(!list || list.type !== 'ul'){ flushList(); list = {type:'ul', items:[]}; } list.items.push(m[1]); continue; }
      if((m = line.match(/^\s*\d+[.)]\s+(.*)/))){ flushPara(); if(!list || list.type !== 'ol'){ flushList(); list = {type:'ol', items:[]}; } list.items.push(m[1]); continue; }
      flushList(); para.push(line.trim());
    }
    flushPara(); flushList(); flushTable();
    return out;
  };

  /* ---------- toast ---------- */
  let toastT;
  M.toast = (msg, ms=2600) => {
    const el = document.getElementById('toast'); if(!el) return;
    el.textContent = msg; el.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(() => { el.hidden = true; }, ms);
  };

  M.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); M.toast('Copied'); return true; }
    catch { M.toast('Copy was blocked here — select the text and copy it manually.'); return false; }
  };

  /* ---------- UI fragments ---------- */
  M.loadingHTML = (title, sub='') => `<div class="loading" role="status"><div class="spinner"></div><div><div class="lt">${M.esc(title)}</div>${sub ? `<div class="ls">${M.esc(sub)}</div>` : ''}<div class="stream-peek" data-peek></div></div></div>`;
  M.errorHTML = (msg, action, label='Try again', extra='') => `<div class="notice bad">${M.icon.alert}<div class="stack-sm"><div>${M.esc(msg)}</div>${action ? `<div class="row"><button class="btn sm" data-action="${action}" ${extra}>${M.esc(label)}</button></div>` : ''}</div></div>`;
  M.pill = (status) => `<span class="pill s-${status.key}">${M.esc(status.label)}</span>`;
  M.emptyHTML = (icon, text, cta='') => `<div class="empty">${M.icon[icon] || ''}<div>${text}</div>${cta ? `<div style="margin-top:12px">${cta}</div>` : ''}</div>`;

  /* ---------- router ---------- */
  M.routes = {};
  M.route = (name, fn) => { M.routes[name] = fn; };
  M.current = { name: null, param: null };
  M.go = (hash) => { if(location.hash === '#' + hash) M.render(); else location.hash = hash; };
  M.render = () => {
    const h = (location.hash || '').slice(1) || 'home';
    const [name, ...rest] = h.split('-');
    const param = rest.join('-') || null;
    const fn = M.routes[name] || M.routes.home;
    M.current = { name: M.routes[name] ? name : 'home', param };
    const view = document.getElementById('view');
    M.emit('route', M.current);
    try { fn(view, param); }
    catch(e){ console.error(e); view.innerHTML = `<div class="stack"><h2>Something went wrong on this screen</h2>${M.errorHTML(String(e.message || e), 'go-home', 'Go to dashboard')}</div>`; }
    if(M._lastRoute !== h){ window.scrollTo(0, 0); M._lastRoute = h; }
  };
  window.addEventListener('hashchange', M.render);

  /* ---------- action delegation ---------- */
  M.actions = {};
  M.action = (name, fn) => { M.actions[name] = fn; };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if(!el || el.disabled) return;
    const fn = M.actions[el.dataset.action];
    if(fn){ e.preventDefault(); try { fn(el, e); } catch(err){ console.error(err); M.toast('That action failed: ' + (err.message || err)); } }
  });
  M.action('go-home', () => M.go('dashboard'));
  M.action('go', el => M.go(el.dataset.to));
})();
