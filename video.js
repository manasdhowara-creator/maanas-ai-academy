/* video.js — Video Engine: topic-specific visual renderers + the narrated chalkboard Teacher Lesson player.
   Honest by design: this is an animated, voice-narrated board lesson (browser speech), not filmed video. */
(function(){
  const W = 800, H = 500;
  const pal = light => light
    ? { fg:'var(--ink)', dim:'var(--muted)', y:'var(--gold)', b:'var(--info)', r:'var(--bad)', g:'var(--ok)', box:'var(--surface-2)', line:'var(--line-2)', font:'var(--f-body)' }
    : { fg:'var(--chalk)', dim:'var(--chalk-dim)', y:'var(--chalk-y)', b:'var(--chalk-b)', r:'var(--chalk-r)', g:'var(--chalk-g)', box:'rgba(255,255,255,.06)', line:'rgba(255,255,255,.25)', font:'var(--f-chalk)' };
  const e = M.esc;
  const T = (x, y, s, p, size=26, anchor='middle', extra='') => `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" fill="${p.color || p.fg}" font-family="${p.font}" font-size="${Math.round(size * 1.22)}" ${extra}>${e(s)}</text>`;
  const rv = (i, base=0.35) => `class="rv" style="animation-delay:${(base * i).toFixed(2)}s"`;
  const arrowDefs = (p, id='va') => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${p.y}"/></marker></defs>`;
  const wrap = (t, cx, cy, max, p, size) => M.wrapText(t, cx, cy, Math.max(6, Math.round(max / 1.15)), p.fg, Math.round(size * 1.2)).replace('<text ', `<text font-family="${p.font}" `);
  const trunc = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const nums = a => a.map(Number).filter(isFinite);

  const R = {
    keypoint(v, p){ return `${wrap(v.text || v.title || '', W/2, H/2 - 20, 30, p, 40)}${v.sub ? `<g ${rv(1)}>${wrap(v.sub, W/2, H/2 + 90, 48, {...p, fg:p.dim}, 24)}</g>` : ''}`; },

    equation(v, p){
      const steps = (v.steps || []).slice(0, 7); const lh = Math.min(64, (H - 60) / Math.max(1, steps.length));
      return steps.map((s, i) => `<g ${rv(i, .7)}>${T(W/2, 40 + lh * (i + .5), trunc(s, 44), { ...p, color: i === (v.highlight ?? steps.length - 1) ? p.y : p.fg }, Math.min(40, lh * .62))}</g>`).join('');
    },

    forces(v, p){
      const cx = W/2, cy = H/2 + 10, bw = 150, bh = 110;
      let s = arrowDefs(p) + `<rect x="${cx-bw/2}" y="${cy-bh/2}" width="${bw}" height="${bh}" rx="10" fill="${p.box}" stroke="${p.fg}" stroke-width="3"/>` + T(cx, cy, trunc(v.object || 'Object', 12), p, 26);
      s += `<line x1="60" y1="${cy+bh/2}" x2="${W-60}" y2="${cy+bh/2}" stroke="${p.dim}" stroke-width="2" stroke-dasharray="6 8"/>`;
      const fs = (v.forces || []).slice(0, 6); const maxSize = Math.max(1, ...nums(fs.map(f => f.size || 1)));
      let nx = 0, ny = 0, allNum = fs.every(f => isFinite(Number(f.size)));
      const counts = {};
      fs.forEach((f, i) => {
        const d = String(f.dir || 'right').toLowerCase(); const k = (counts[d] = (counts[d] || 0) + 1) - 1;
        const len = 60 + 120 * ((Number(f.size) || maxSize * .6) / maxSize); const off = k * 26 - (k ? 0 : 0);
        let x1, y1, x2, y2, lx, ly;
        if(d === 'left'){ x1 = cx - bw/2; y1 = cy - 20 + off; x2 = x1 - len; y2 = y1; lx = x2 - 6; ly = y1 - 18; nx -= Number(f.size)||0; }
        else if(d === 'up'){ x1 = cx - 30 + off*2; y1 = cy - bh/2; x2 = x1; y2 = y1 - Math.min(len, 150); lx = x1 + 10; ly = y2 + 10; ny += Number(f.size)||0; }
        else if(d === 'down'){ x1 = cx + 30 + off*2; y1 = cy + bh/2; x2 = x1; y2 = Math.min(H - 20, y1 + Math.min(len, 90)); lx = x1 + 10; ly = y2 - 10; ny -= Number(f.size)||0; }
        else { x1 = cx + bw/2; y1 = cy - 20 + off; x2 = x1 + len; y2 = y1; lx = x2 + 6; ly = y1 - 18; nx += Number(f.size)||0; }
        const col = [p.y, p.b, p.r, p.g][i % 4];
        s += `<g ${rv(i + 1, .6)}><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="6" marker-end="url(#va)"/>${T(lx, ly, trunc(`${f.label || ''}${f.size !== undefined ? ' ' + f.size + (v.unit ? ' ' + v.unit : ' N') : ''}`, 22), { ...p, color: col }, 22, d === 'left' ? 'end' : 'start')}</g>`;
      });
      const netText = v.note || (allNum && fs.length ? (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9 ? 'Net force = 0 → balanced' : `Net force = ${Math.round(Math.hypot(nx, ny) * 100) / 100} ${v.unit || 'N'} ${Math.abs(nx) >= Math.abs(ny) ? (nx > 0 ? 'to the right' : 'to the left') : (ny > 0 ? 'upward' : 'downward')}`) : '');
      if(netText) s += `<g ${rv(fs.length + 2, .6)}>${T(W/2, 40, trunc(netText, 50), { ...p, color: p.y }, 28)}</g>`;
      return s;
    },

    graph(v, p){
      const pts = (v.points || []).filter(q => Array.isArray(q) && q.length >= 2).map(q => [Number(q[0]), Number(q[1])]).filter(q => isFinite(q[0]) && isFinite(q[1])).slice(0, 40);
      if(pts.length < 2) return R.keypoint({ text: v.title || 'Graph' }, p);
      const x0 = 90, y0 = H - 70, x1 = W - 40, y1 = 40;
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      let xmin = Math.min(0, ...xs), xmax = Math.max(...xs), ymin = Math.min(0, ...ys), ymax = Math.max(...ys);
      if(xmax === xmin) xmax = xmin + 1; if(ymax === ymin) ymax = ymin + 1;
      const X = x => x0 + (x - xmin) / (xmax - xmin) * (x1 - x0), Y = y => y0 - (y - ymin) / (ymax - ymin) * (y0 - y1);
      let s = `<line x1="${x0}" y1="${Y(Math.max(0,ymin))}" x2="${x1}" y2="${Y(Math.max(0,ymin))}" stroke="${p.fg}" stroke-width="2.5"/><line x1="${X(Math.max(0,xmin))}" y1="${y0}" x2="${X(Math.max(0,xmin))}" y2="${y1}" stroke="${p.fg}" stroke-width="2.5"/>`;
      for(let i = 0; i <= 4; i++){ const xv = xmin + (xmax - xmin) * i / 4, yv = ymin + (ymax - ymin) * i / 4; s += T(X(xv), y0 + 22, fmt(xv), { ...p, color: p.dim }, 17) + T(x0 - 12, Y(yv), fmt(yv), { ...p, color: p.dim }, 17, 'end'); s += `<line x1="${x0}" y1="${Y(yv)}" x2="${x1}" y2="${Y(yv)}" stroke="${p.line}" stroke-width="1" stroke-dasharray="3 6"/>`; }
      s += T((x0 + x1)/2, H - 18, trunc(v.xLabel || 'x', 40), p, 21) + `<g transform="translate(26 ${(y0+y1)/2}) rotate(-90)">${T(0, 0, trunc(v.yLabel || 'y', 30), p, 21)}</g>`;
      const d = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`).join(' ');
      s += `<path d="${d}" fill="none" stroke="${p.y}" stroke-width="4" class="draw"/>` + pts.map((q, i) => `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="5" fill="${p.y}" ${rv(i, .12)}/>`).join('');
      if(v.title) s += T(W/2, 22, trunc(v.title, 50), { ...p, color: p.b }, 22);
      return s;
    },

    bars(v, p){
      const items = (v.items || []).slice(0, 8).map(it => ({ label: it.label, value: Number(it.value) })).filter(it => isFinite(it.value));
      if(!items.length) return R.keypoint({ text: v.title || 'Data' }, p);
      const max = Math.max(...items.map(i => i.value), 1), bw = (W - 120) / items.length;
      return items.map((it, i) => { const h = (it.value / max) * (H - 150), x = 70 + i * bw + bw * .15, y = H - 70 - h; const col = [p.y, p.b, p.g, p.r][i % 4];
        return `<g ${rv(i, .3)}><rect x="${x}" y="${y}" width="${bw * .7}" height="${h}" rx="6" fill="${col}" opacity=".85"/>${T(x + bw*.35, y - 16, fmt(it.value) + (v.unit ? ' ' + v.unit : ''), p, 18)}${T(x + bw*.35, H - 45, trunc(it.label, 12), { ...p, color: p.dim }, 17)}</g>`; }).join('') + `<line x1="60" y1="${H-70}" x2="${W-40}" y2="${H-70}" stroke="${p.fg}" stroke-width="2"/>` + (v.title ? T(W/2, 26, trunc(v.title, 50), { ...p, color: p.b }, 22) : '');
    },

    labelled(v, p){
      const parts = (v.parts || []).slice(0, 8); const cx = W/2, cy = H/2;
      let s = `<ellipse cx="${cx}" cy="${cy}" rx="150" ry="105" fill="${p.box}" stroke="${p.g}" stroke-width="3"/><ellipse cx="${cx+20}" cy="${cy-10}" rx="45" ry="32" fill="none" stroke="${p.g}" stroke-width="2" opacity=".6"/>` + T(cx, cy, trunc(v.center || '', 16), p, 28);
      parts.forEach((pt, i) => {
        const a = (-Math.PI / 2) + i * (2 * Math.PI / parts.length);
        const ex = cx + Math.cos(a) * 150, ey = cy + Math.sin(a) * 105, lx = cx + Math.cos(a) * 285, ly = cy + Math.sin(a) * 195;
        const anchor = Math.cos(a) > 0.2 ? 'start' : Math.cos(a) < -0.2 ? 'end' : 'middle';
        s += `<g ${rv(i + 1, .45)}><circle cx="${ex}" cy="${ey}" r="6" fill="${p.y}"/><line x1="${ex}" y1="${ey}" x2="${lx}" y2="${ly}" stroke="${p.y}" stroke-width="2"/>${T(lx + (anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0), ly - 10, trunc(pt.name || pt, 20), { ...p, color: p.y }, 22, anchor)}${pt.note ? T(lx + (anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0), ly + 14, trunc(pt.note, 28), { ...p, color: p.dim }, 16, anchor) : ''}</g>`;
      });
      return s;
    },

    process(v, p){
      const steps = (v.steps || []).slice(0, 7).map(x => typeof x === 'string' ? x : (x.label || x.name || ''));
      let s = arrowDefs(p);
      if(v.cycle && steps.length >= 3){
        const cx = W/2, cy = H/2 + 5, rx = 270, ry = 170;
        steps.forEach((t, i) => {
          const a = -Math.PI/2 + i * 2 * Math.PI / steps.length, a2 = -Math.PI/2 + (i + 1) * 2 * Math.PI / steps.length;
          const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
          const mx1 = cx + Math.cos(a + .28) * rx * .92, my1 = cy + Math.sin(a + .28) * ry * .92, mx2 = cx + Math.cos(a2 - .28) * rx * .92, my2 = cy + Math.sin(a2 - .28) * ry * .92;
          s += `<g ${rv(i, .6)}><rect x="${x-95}" y="${y-30}" width="190" height="60" rx="14" fill="${p.box}" stroke="${p.b}" stroke-width="2.5"/>${wrap(t, x, y, 18, p, 19)}<path d="M${mx1} ${my1} Q${cx + Math.cos((a+a2)/2) * rx * 1.02} ${cy + Math.sin((a+a2)/2) * ry * 1.02} ${mx2} ${my2}" fill="none" stroke="${p.y}" stroke-width="3" marker-end="url(#va)"/></g>`;
        });
        if(v.title) s += T(W/2, H/2, trunc(v.title, 22), { ...p, color: p.y }, 26);
        return s;
      }
      const n = steps.length, rows = n > 4 ? 2 : 1, perRow = Math.ceil(n / rows), bw = Math.min(200, (W - 40) / perRow - 30), bh = 76;
      steps.forEach((t, i) => {
        const r = Math.floor(i / perRow), c = i % perRow; const cc = r % 2 ? perRow - 1 - c : c;
        const x = 20 + cc * ((W - 40) / perRow) + ((W - 40) / perRow - bw) / 2, y = rows === 1 ? H/2 - bh/2 : 90 + r * 190;
        s += `<g ${rv(i, .6)}><rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="14" fill="${p.box}" stroke="${p.b}" stroke-width="2.5"/>${T(x + 18, y + 16, String(i + 1), { ...p, color: p.y }, 18)}${wrap(t, x + bw/2, y + bh/2 + 4, Math.round(bw / 11), p, 19)}`;
        if(i < n - 1){
          const nr = Math.floor((i + 1) / perRow);
          if(nr !== r) s += `<path d="M${x + bw/2} ${y + bh + 4} V${y + 186}" stroke="${p.y}" stroke-width="3" marker-end="url(#va)"/>`;
          else { const dir = r % 2 ? -1 : 1; const ax = dir > 0 ? x + bw + 4 : x - 4; s += `<path d="M${ax} ${y + bh/2} h${dir * (((W - 40) / perRow) - bw - 10)}" stroke="${p.y}" stroke-width="3" marker-end="url(#va)"/>`; }
        }
        s += '</g>';
      });
      return s;
    },

    timeline(v, p){
      const ev = (v.events || []).slice(0, 7); const y = H/2; const x0 = 60, x1 = W - 60;
      let s = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${p.fg}" stroke-width="4"/>`;
      ev.forEach((it, i) => { const x = ev.length === 1 ? W/2 : x0 + i * (x1 - x0) / (ev.length - 1); const up = i % 2 === 0;
        s += `<g ${rv(i, .55)}><circle cx="${x}" cy="${y}" r="10" fill="${p.y}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${up ? y - 60 : y + 60}" stroke="${p.y}" stroke-width="2"/>${T(x, up ? y - 82 : y + 82, trunc(it.when || it.year || '', 14), { ...p, color: p.y }, 22)}${wrap(it.label || '', x, up ? y - 140 : y + 140, 16, p, 17)}</g>`; });
      return s;
    },

    particles(v, p){
      const st = String(v.state || 'solid').toLowerCase(); let s = `<rect x="200" y="70" width="400" height="340" rx="10" fill="none" stroke="${p.fg}" stroke-width="3"/>`;
      const pts = [];
      if(st === 'solid'){ for(let r = 0; r < 6; r++) for(let c = 0; c < 8; c++) pts.push([250 + c * 44, 120 + r * 50]); }
      else if(st === 'liquid'){ for(let i = 0; i < 34; i++) pts.push([225 + (i * 71 % 350), 250 + (i * 37 % 150)]); }
      else { for(let i = 0; i < 14; i++) pts.push([230 + (i * 97 % 340), 100 + (i * 59 % 290)]); }
      s += pts.map((q, i) => `<circle cx="${q[0]}" cy="${q[1]}" r="15" fill="${p.b}" opacity=".9" class="jig ${st}" style="animation-delay:${(i % 7) * -.23}s"/>`).join('');
      s += T(W/2, 40, trunc(v.label || (st[0].toUpperCase() + st.slice(1) + ': particle arrangement'), 44), { ...p, color: p.y }, 26);
      return s;
    },

    reaction(v, p){
      const re = (v.reactants || []).slice(0, 3), pr = (v.products || []).slice(0, 3);
      const all = [...re, '→', ...pr]; const bw = 118; const total = all.length; const gap = (W - 40) / total;
      let s = arrowDefs(p);
      all.forEach((t, i) => { const x = 20 + gap * i + gap/2;
        if(t === '→'){ s += `<g ${rv(i, .5)}><line x1="${x - gap/2 + 8}" y1="${H/2}" x2="${x + gap/2 - 8}" y2="${H/2}" stroke="${p.y}" stroke-width="4" marker-end="url(#va)"/>${v.condition ? T(x, H/2 - 30, trunc(v.condition, 18), { ...p, color: p.dim }, 17) : ''}</g>`; return; }
        s += `<g ${rv(i, .5)}><circle cx="${x}" cy="${H/2}" r="${Math.min(bw/2, gap/2 - 6)}" fill="${p.box}" stroke="${i < re.length ? p.b : p.g}" stroke-width="3"/>${wrap(t, x, H/2, 10, p, 19)}</g>`;
        const nxt = all[i + 1]; if(nxt && nxt !== '→' && t !== '→') s += T(x + gap/2, H/2, '+', p, 34);
      });
      if(v.equation) s += `<g ${rv(total, .5)}>${T(W/2, H - 60, trunc(v.equation, 44), { ...p, color: p.y }, 28)}</g>`;
      return s;
    },

    code(v, p){
      const lines = String(v.code || '').split('\n').slice(0, 14);
      let s = `<rect x="40" y="30" width="${W-80}" height="${v.output ? 320 : 440}" rx="12" fill="#0E141B" stroke="${p.line}"/><circle cx="66" cy="52" r="6" fill="#FF6B5F"/><circle cx="86" cy="52" r="6" fill="#FFBD2E"/><circle cx="106" cy="52" r="6" fill="#28C840"/>${T(W - 60, 52, (v.language || 'code').toUpperCase(), { color:'#8394A5', font:'var(--f-mono)' }, 14, 'end')}`;
      lines.forEach((ln, i) => { s += `<g ${rv(i, .25)}><text x="62" y="${88 + i * 20}" fill="#5D6B7A" font-family="var(--f-mono)" font-size="13">${i + 1}</text><text x="92" y="${88 + i * 20}" fill="#D6E2EC" font-family="var(--f-mono)" font-size="15" xml:space="preserve">${e(trunc(ln, 70))}</text></g>`; });
      if(v.output) s += `<g ${rv(lines.length + 1, .25)}><rect x="40" y="365" width="${W-80}" height="105" rx="12" fill="#0B1016" stroke="${p.g}"/>${T(60, 388, 'OUTPUT', { color: '#7FE0A2', font:'var(--f-mono)' }, 13, 'start')}${String(v.output).split('\n').slice(0,3).map((o, i) => `<text x="60" y="${414 + i * 20}" fill="#7FE0A2" font-family="var(--f-mono)" font-size="15" xml:space="preserve">${e(trunc(o, 76))}</text>`).join('')}</g>`;
      return s;
    },

    architecture(v, p){
      const layers = (v.layers || []).slice(0, 5); const n = layers.length || 1; const lh = Math.min(84, (H - 40 - (n - 1) * 22) / n);
      let s = arrowDefs(p);
      layers.forEach((L, i) => { const y = 20 + i * (lh + 22); const items = (L.items || []).slice(0, 4); const col = [p.b, p.y, p.g, p.r, p.b][i];
        s += `<g ${rv(i, .6)}><rect x="40" y="${y}" width="${W-80}" height="${lh}" rx="14" fill="${p.box}" stroke="${col}" stroke-width="2.5"/>${T(60, y + lh/2, trunc(L.name || '', 16), { ...p, color: col }, 21, 'start')}`;
        items.forEach((it, j) => { const bw = (W - 330) / Math.max(1, items.length); const x = 270 + j * bw; s += `<rect x="${x + 6}" y="${y + 12}" width="${bw - 12}" height="${lh - 24}" rx="9" fill="none" stroke="${p.line}" stroke-width="1.5"/>${wrap(it, x + bw/2, y + lh/2, Math.max(8, Math.round(bw / 10)), p, 16)}`; });
        if(i < n - 1) s += `<line x1="${W/2}" y1="${y + lh + 2}" x2="${W/2}" y2="${y + lh + 19}" stroke="${p.y}" stroke-width="3" marker-end="url(#va)"/>`;
        s += '</g>'; });
      return s;
    },

    compare(v, p){
      const L = v.left || {}, Rr = v.right || {};
      const col = (side, x, c, i0) => `<g ${rv(i0, .5)}><rect x="${x}" y="30" width="${W/2 - 50}" height="${H - 60}" rx="14" fill="${p.box}" stroke="${c}" stroke-width="2.5"/>${T(x + (W/2 - 50)/2, 66, trunc(side.title || '', 20), { ...p, color: c }, 26)}${(side.points || []).slice(0, 5).map((pt, i) => wrap('• ' + pt, x + (W/2 - 50)/2, 130 + i * 68, 26, p, 18)).join('')}</g>`;
      return col(L, 30, p.b, 0) + col(Rr, W/2 + 20, p.y, 1);
    },

    geometry(v, p){
      const sh = String(v.shape || 'triangle').toLowerCase(); const cx = W/2, cy = H/2 + 10;
      const shapes = {
        triangle: [[cx, cy - 160], [cx - 210, cy + 130], [cx + 210, cy + 130]],
        rectangle: [[cx - 230, cy - 120], [cx + 230, cy - 120], [cx + 230, cy + 120], [cx - 230, cy + 120]],
        square: [[cx - 150, cy - 150], [cx + 150, cy - 150], [cx + 150, cy + 150], [cx - 150, cy + 150]],
        parallelogram: [[cx - 170, cy - 110], [cx + 250, cy - 110], [cx + 170, cy + 110], [cx - 250, cy + 110]],
        rhombus: [[cx, cy - 170], [cx + 200, cy], [cx, cy + 170], [cx - 200, cy]],
        trapezium: [[cx - 130, cy - 110], [cx + 130, cy - 110], [cx + 240, cy + 110], [cx - 240, cy + 110]],
      };
      const lab = v.labels || {};
      if(sh === 'circle'){ return `<circle cx="${cx}" cy="${cy}" r="160" fill="${p.box}" stroke="${p.fg}" stroke-width="3" class="draw"/><circle cx="${cx}" cy="${cy}" r="5" fill="${p.y}"/><line x1="${cx}" y1="${cy}" x2="${cx + 160}" y2="${cy}" stroke="${p.y}" stroke-width="3" ${rv(1)}/>${T(cx + 80, cy - 20, (lab.sides && lab.sides[0]) || 'r', { ...p, color: p.y }, 24)}${v.note ? T(W/2, 30, trunc(v.note, 50), { ...p, color: p.b }, 22) : ''}`; }
      const pts = shapes[sh] || shapes.triangle; const vx = lab.vertices || 'ABCDEF'.split('');
      let s = `<polygon points="${pts.map(q => q.join(',')).join(' ')}" fill="${p.box}" stroke="${p.fg}" stroke-width="3" class="draw"/>`;
      pts.forEach((q, i) => { const dx = q[0] - cx, dy = q[1] - cy, d = Math.hypot(dx, dy) || 1; s += T(q[0] + dx / d * 28, q[1] + dy / d * 28, vx[i] || '', { ...p, color: p.y }, 26); if(lab.angles && lab.angles[i]) s += `<g ${rv(i + 1)}>${T(q[0] - dx / d * 45, q[1] - dy / d * 45, lab.angles[i], { ...p, color: p.b }, 19)}</g>`; });
      if(lab.sides) pts.forEach((q, i) => { const r2 = pts[(i + 1) % pts.length]; const mx = (q[0] + r2[0]) / 2, my = (q[1] + r2[1]) / 2; const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1; if(lab.sides[i]) s += `<g ${rv(i + 1)}>${T(mx + dx / d * 26, my + dy / d * 26, lab.sides[i], { ...p, color: p.g }, 20)}</g>`; });
      if(v.note) s += T(W/2, 24, trunc(v.note, 50), { ...p, color: p.b }, 21);
      return s;
    },

    numberline(v, p){
      const min = Number(v.min ?? -5), max = Number(v.max ?? 5); if(!(max > min)) return R.keypoint({ text:'Number line' }, p);
      const x0 = 60, x1 = W - 60, y = H/2, X = n => x0 + (n - min) / (max - min) * (x1 - x0);
      let s = arrowDefs(p) + `<line x1="${x0 - 20}" y1="${y}" x2="${x1 + 20}" y2="${y}" stroke="${p.fg}" stroke-width="3" marker-end="url(#va)" marker-start="url(#va)"/>`;
      const step = (max - min) <= 20 ? 1 : Math.ceil((max - min) / 10);
      for(let n = Math.ceil(min); n <= max; n += step) s += `<line x1="${X(n)}" y1="${y - 10}" x2="${X(n)}" y2="${y + 10}" stroke="${p.fg}" stroke-width="2"/>${T(X(n), y + 32, String(n), { ...p, color: p.dim }, 18)}`;
      (v.marks || []).slice(0, 6).forEach((m, i) => { const val = Number(m.value); if(!isFinite(val)) return; s += `<g ${rv(i + 1, .5)}><circle cx="${X(val)}" cy="${y}" r="9" fill="${p.y}"/>${T(X(val), y - 40, trunc(m.label || String(val), 16), { ...p, color: p.y }, 21)}</g>`; });
      if(v.title) s += T(W/2, 50, trunc(v.title, 44), { ...p, color: p.b }, 22);
      return s;
    },
  };
  function fmt(n){ return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100); }

  const REQUIRED = { keypoint:['text'], equation:['steps'], forces:['forces'], graph:['points'], bars:['items'], labelled:['parts'], process:['steps'], timeline:['events'], particles:[], reaction:['reactants','products'], code:['code'], architecture:['layers'], compare:['left','right'], geometry:['shape'], numberline:[] };

  const Visuals = window.Visuals = {
    _n: 0,
    SPEC_SHORT: `one of: {"type":"equation","steps":["2x+3=11","2x=8","x=4"]} | {"type":"forces","object":"Box","unit":"N","forces":[{"dir":"right|left|up|down","label":"Push","size":10}]} | {"type":"graph","title":"","xLabel":"time (s)","yLabel":"distance (m)","points":[[0,0],[1,2]]} | {"type":"bars","title":"","unit":"","items":[{"label":"","value":3}]} | {"type":"labelled","center":"Plant cell","parts":[{"name":"Nucleus","note":"controls the cell"}]} | {"type":"process","cycle":false,"steps":["…","…"]} | {"type":"timeline","events":[{"when":"1857","label":"…"}]} | {"type":"particles","state":"solid|liquid|gas","label":""} | {"type":"reaction","reactants":["CH₄","2O₂"],"products":["CO₂","2H₂O"],"condition":"burning","equation":"CH₄ + 2O₂ → CO₂ + 2H₂O"} | {"type":"code","language":"python","code":"print(2+3)","output":"5"} | {"type":"architecture","layers":[{"name":"Input","items":["tokens"]}]} | {"type":"compare","left":{"title":"","points":[]},"right":{"title":"","points":[]}} | {"type":"geometry","shape":"triangle|square|rectangle|parallelogram|rhombus|trapezium|circle","labels":{"vertices":["A","B","C"],"sides":["5 cm"],"angles":["60°"]},"note":""} | {"type":"numberline","min":-5,"max":5,"marks":[{"value":-2,"label":"-2"}]} | {"type":"keypoint","text":"big idea","sub":"detail"}`,
    SUBJECT_HINT: {
      maths: 'equation, geometry, graph, numberline, bars', physics: 'forces, graph, equation, process', chemistry: 'particles, reaction, equation, process',
      biology: 'labelled, process (cycle for cycles), compare', history: 'timeline, compare, process', geography: 'process, bars, labelled, compare (no maps available — describe locations in words)',
      ai: 'architecture, process, compare, code', coding: 'code, process, compare', language: 'compare, keypoint, process', general: 'process, compare, labelled, keypoint'
    },
    valid(v){ if(!v || !R[v.type]) return false; return (REQUIRED[v.type] || []).every(k => v[k] !== undefined && v[k] !== null && (!Array.isArray(v[k]) || v[k].length)); },
    render(v, { light=false } = {}){
      const p = pal(light);
      let inner = '';
      try { inner = Visuals.valid(v) ? R[v.type](v, p) : R.keypoint({ text: (v && (v.text || v.title)) || '' }, p); }
      catch(err){ console.warn('visual failed', err); inner = R.keypoint({ text: (v && v.title) || 'Diagram' }, p); }
      const uid = 'va' + (++Visuals._n);
      inner = inner.replace(/id="va"/g, `id="${uid}"`).replace(/url\(#va\)/g, `url(#${uid})`);
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${e((v && v.type) || 'diagram')} diagram" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">${inner}</svg>`;
    },
  };

  /* animation styles for visuals */
  const st = document.createElement('style');
  st.textContent = `.rv{opacity:0;animation:rvIn .5s ease forwards}@keyframes rvIn{to{opacity:1}}
  .draw{stroke-dasharray:2400;stroke-dashoffset:2400;animation:drawIn 1.6s ease forwards}@keyframes drawIn{to{stroke-dashoffset:0}}
  .jig{animation:jig 1.2s ease-in-out infinite alternate}.jig.solid{animation-duration:.35s}.jig.liquid{animation:flow 2.2s ease-in-out infinite alternate}.jig.gas{animation:fly 3s linear infinite alternate}
  @keyframes jig{from{transform:translate(0,0)}to{transform:translate(2px,-2px)}}@keyframes flow{from{transform:translate(0,0)}to{transform:translate(14px,-8px)}}@keyframes fly{from{transform:translate(0,0)}to{transform:translate(90px,-60px)}}
  .jig{transform-box:fill-box}`;
  document.head.appendChild(st);

  /* ================= Teacher Lesson (scenes) ================= */
  const TEACHER = { name:'Ms. Vidya', initial:'V', sub:'Your AI teacher · narrated board lesson' };

  const Video = window.Video = {
    TEACHER,
    async generate(t, opts = {}){
      const kind = t.subjectKind || 'general';
      const lessonOutline = t.lesson ? t.lesson.sections.map(s => `- [${s.level}] ${s.heading}`).join('\n') : '';
      const src = t.source && t.source.text ? `SOURCE (stay faithful to it for source-specific facts):\n"""${t.source.text.slice(0, 12000)}"""` : '';
      const prompt = `You are ${TEACHER.name}, a warm, brilliant teacher planning a narrated chalkboard lesson (like a great human teacher at a board).
${AI.learner(t)}
TOPIC: ${t.title} (${t.subject}; subject kind: ${kind})
CONCEPTS: ${t.concepts.map(c => c.id + ': ' + c.name).join('; ')}
LESSON OUTLINE:
${lessonOutline}
${src}

Plan 8-12 ordered scenes that TEACH the full topic Basic → Foundation → Intermediate → Advanced → Mastery. Do not cut important content; cut only filler.
Each scene: natural spoken narration (60-110 words, as a teacher talks: questions, pauses like "Think for a second…", real examples), one board visual that MATCHES THE SUBJECT, and 1-3 short board notes.
Preferred visuals for this subject: ${Visuals.SUBJECT_HINT[kind] || Visuals.SUBJECT_HINT.general}. Use real, accurate numbers and labels.
Include: a hook scene, worked example(s), a common-mistake scene, a recap scene, and a final teach-back prompt scene.
Put a checkpoint question on 2-3 scenes (quick recall, prediction, MCQ or calculation) — mcq/tf/numerical/fill only.

Reply ONLY JSON:
{"scenes":[{"title":"short","level":"Basic|Foundation|Intermediate|Advanced|Mastery","narration":"…","board":["short note"],"visual":VISUAL,"checkpoint":null or Q}]}
VISUAL = ${Visuals.SPEC_SHORT}
Q (checkpoint) follows: ${Quiz.SCHEMA.split('\n').slice(1, 16).join(' ')}`;
      const data = await AI.json(prompt, { tier:'default', peek: opts.peek, signal: opts.signal });
      return this.validate(data && data.scenes, t);
    },
    validate(scenes, t){
      if(!Array.isArray(scenes)) { const e = new Error('The teacher lesson came back empty. Try again.'); e.code = 'qc'; throw e; }
      const out = scenes.filter(s => s && s.narration).slice(0, 14).map(s => {
        const sc = { title: String(s.title || '').slice(0, 60), level: s.level || '', narration: String(s.narration), board: Array.isArray(s.board) ? s.board.map(String).slice(0, 3) : [], visual: Visuals.valid(s.visual) ? s.visual : { type:'keypoint', text: s.title || t.title, sub: (s.board || [])[0] || '' } };
        if(s.checkpoint){ const q = Quiz.validate({ ...s.checkpoint, type: s.checkpoint.type || 'mcq' }, t); if(q && !Quiz.isWritten(q)) sc.checkpoint = q; }
        return sc;
      });
      if(out.length < 3) { const e = new Error('The teacher lesson failed the quality check (too few scenes). Try again.'); e.code = 'qc'; throw e; }
      return out;
    },
    script(t, scenes){
      return `${t.title} — lesson script (${scenes.length} scenes). Presenter: ${TEACHER.name}.\n\n` + scenes.map((s, i) => `SCENE ${i + 1}: ${s.title} [${s.level}]\nON SCREEN: ${describeVisual(s.visual)}${s.board.length ? ' | Notes: ' + s.board.join(' · ') : ''}\nSAY: ${s.narration}\n`).join('\n');
    },

    /* The player. host: element. handlers: {onCheckpoint(q, result), onFinish()} */
    mount(host, t, scenes, handlers = {}){
      const synth = window.speechSynthesis;
      const S = { i: 0, playing: false, rate: 1, muted: !synth, timer: null, utter: null, awaiting: false, doneCps: new Set() };
      host.innerHTML = `<div class="player" id="player">
        <div class="player-head"><div class="teacher"><div class="teacher-av" id="tav">${TEACHER.initial}</div><div><div class="teacher-name">${TEACHER.name}</div><div class="teacher-sub">${M.esc(TEACHER.sub)}</div></div></div><div class="scene-count" id="scCount"></div></div>
        <div class="scene-title" id="scTitle"></div>
        <div class="stage" id="stage"></div>
        <div class="caption" id="caption"></div>
        <div class="player-controls">
          <button class="pc-btn" id="pcPrev" aria-label="Previous scene">${M.icon.prev}</button>
          <button class="pc-btn main" id="pcPlay" aria-label="Play">${M.icon.play}<span>Play</span></button>
          <button class="pc-btn" id="pcNext" aria-label="Next scene">${M.icon.next}</button>
          <div class="pc-track" id="pcTrack" role="progressbar" aria-label="Lesson progress"><i id="pcBar"></i></div>
          <button class="pc-btn" id="pcRate" aria-label="Playback speed">1×</button>
          <button class="pc-btn" id="pcMute" aria-label="Voice on or off">${S.muted ? M.icon.mute : M.icon.volume}</button>
          <button class="pc-btn" id="pcFull" aria-label="Full screen">${M.icon.expand}</button>
        </div></div>
        ${!synth ? '<div class="hint" style="margin-top:6px">This browser has no built-in voice, so captions play without sound.</div>' : ''}`;
      const $ = id => host.querySelector('#' + id);
      const voice = pickVoice();

      function show(i, autoplay){
        stopSpeech(); S.i = M.clamp(i, 0, scenes.length - 1); S.awaiting = false;
        const sc = scenes[S.i];
        $('scCount').textContent = `Scene ${S.i + 1} / ${scenes.length}${sc.level ? ' · ' + sc.level : ''}`;
        $('scTitle').textContent = sc.title;
        $('stage').innerHTML = Visuals.render(sc.visual) + (sc.board.length ? `<div style="position:absolute;left:12px;bottom:8px;right:12px;display:flex;flex-wrap:wrap;gap:6px">${sc.board.map(b => `<span class="chalk" style="font-size:.95rem;background:rgba(0,0,0,.25);padding:2px 8px;border-radius:6px;color:var(--chalk-y)">${M.esc(b)}</span>`).join('')}</div>` : '');
        caption(sc.narration, 0);
        $('pcBar').style.width = ((S.i + 1) / scenes.length * 100) + '%';
        if(autoplay) speak(sc);
      }
      function caption(text, upto){ $('caption').innerHTML = `<span class="spoken">${M.esc(text.slice(0, upto))}</span><span class="rest">${M.esc(text.slice(upto))}</span>`; }
      function setPlaying(v){ S.playing = v; $('pcPlay').innerHTML = v ? `${M.icon.pause}<span>Pause</span>` : `${M.icon.play}<span>Play</span>`; $('tav').classList.toggle('speaking', v); }
      function stopSpeech(){ clearTimeout(S.timer); clearInterval(S.tick); if(synth) { try { synth.cancel(); } catch(_){} } }
      function speak(sc){
        const text = sc.narration;
        if(!S.muted && synth){
          const u = new SpeechSynthesisUtterance(text); if(voice) u.voice = voice; u.rate = S.rate; u.lang = voice ? voice.lang : 'en-IN';
          u.onboundary = ev => { if(ev.charIndex != null) caption(text, ev.charIndex + (ev.charLength || 0)); };
          u.onend = () => { if(S.utter === u) sceneEnded(); };
          u.onerror = () => { if(S.utter === u){ S.muted = true; $('pcMute').innerHTML = M.icon.mute; timed(text); } };
          S.utter = u; synth.speak(u);
        } else timed(text);
      }
      function timed(text){
        const ms = Math.max(3000, text.split(/\s+/).length / (2.6 * S.rate) * 1000); const start = Date.now();
        clearInterval(S.tick); S.tick = setInterval(() => caption(text, Math.floor(text.length * Math.min(1, (Date.now() - start) / ms))), 250);
        S.timer = setTimeout(() => { clearInterval(S.tick); caption(text, text.length); sceneEnded(); }, ms);
      }
      function sceneEnded(){
        const sc = scenes[S.i]; caption(sc.narration, sc.narration.length);
        if(sc.checkpoint && !S.doneCps.has(S.i)){ checkpoint(sc.checkpoint); return; }
        if(!S.playing) return;
        if(S.i < scenes.length - 1) S.timer = setTimeout(() => show(S.i + 1, true), 900);
        else { setPlaying(false); handlers.onFinish && handlers.onFinish(); }
      }
      function checkpoint(q){
        S.awaiting = true; $('tav').classList.remove('speaking');
        const ov = document.createElement('div'); ov.className = 'checkpoint-overlay';
        ov.innerHTML = `<div class="eyebrow" style="color:var(--chalk-y)">Checkpoint · think before you tap</div>${Quiz.render(q, { dark:true })}<div class="row"><button class="btn primary" data-cp="check">Check</button><button class="btn" data-cp="skip" style="background:transparent;color:var(--chalk);border-color:rgba(255,255,255,.25)">Skip for now</button></div><div data-cp-fb></div>`;
        $('stage').appendChild(ov);
        ov.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-cp]'); if(!b) return;
          if(b.dataset.cp === 'skip' || b.dataset.cp === 'continue'){ ov.remove(); S.doneCps.add(S.i); S.awaiting = false; if(S.playing){ if(S.i < scenes.length - 1) show(S.i + 1, true); else { setPlaying(false); handlers.onFinish && handlers.onFinish(); } } return; }
          const ans = Quiz.readAnswer(ov, q); if(ans === null){ M.toast('Pick or type an answer first.'); return; }
          b.disabled = true; const r = await Quiz.grade(q, ans, t);
          if(q.options) Quiz.lockOptions(ov, q, ans);
          ov.querySelector('[data-cp-fb]').innerHTML = `<div style="color:var(--chalk);margin-top:6px"><b style="color:${r.correct ? 'var(--chalk-g)' : 'var(--chalk-r)'}">${r.correct ? 'Correct!' : 'Not quite.'}</b> ${M.esc(q.explanation || '')} ${!r.correct ? '<br>Answer: ' + M.esc(Quiz.answerText(q)) : ''}</div><div class="row" style="margin-top:10px"><button class="btn primary" data-cp="continue">Continue</button></div>`;
          b.parentElement.remove();
          handlers.onCheckpoint && handlers.onCheckpoint(q, r);
        });
      }

      $('pcPlay').onclick = () => {
        if(S.awaiting) return;
        if(S.playing){ setPlaying(false); stopSpeech(); caption(scenes[S.i].narration, 0); }
        else { setPlaying(true); show(S.i, true); }
      };
      $('pcNext').onclick = () => { host.querySelector('.checkpoint-overlay')?.remove(); show(S.i + 1, S.playing); };
      $('pcPrev').onclick = () => { host.querySelector('.checkpoint-overlay')?.remove(); show(S.i - 1, S.playing); };
      $('pcTrack').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); host.querySelector('.checkpoint-overlay')?.remove(); show(Math.floor((ev.clientX - r.left) / r.width * scenes.length), S.playing); };
      $('pcRate').onclick = () => { S.rate = S.rate === 1 ? 1.25 : S.rate === 1.25 ? 0.85 : 1; $('pcRate').textContent = S.rate + '×'; if(S.playing) show(S.i, true); };
      $('pcMute').onclick = () => { if(!synth) return; S.muted = !S.muted; $('pcMute').innerHTML = S.muted ? M.icon.mute : M.icon.volume; if(S.playing) show(S.i, true); };
      $('pcFull').onclick = () => { const el = $('player'); try { if(document.fullscreenElement) document.exitFullscreen(); else (el.requestFullscreen ? el.requestFullscreen() : Promise.reject()).catch(() => M.toast('Full screen isn’t available here. Rotate your phone for a bigger board.')); } catch(_){ M.toast('Full screen isn’t available here.'); } };
      show(0, false);
      const off = () => { stopSpeech(); };
      Video._stop = off;
      return { stop: off };
    },
  };
  function pickVoice(){
    const synth = window.speechSynthesis; if(!synth) return null;
    const vs = synth.getVoices() || []; const pref = Store.state.profile.voiceURI;
    return vs.find(v => v.voiceURI === pref) || vs.find(v => /en-IN/i.test(v.lang)) || vs.find(v => /en-GB/i.test(v.lang) && /female|google/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || vs[0] || null;
  }
  if(window.speechSynthesis){ try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch(_){} }
  function describeVisual(v){
    if(!v) return 'board';
    const m = { equation: () => 'equation steps: ' + (v.steps||[]).join(' → '), forces: () => `force diagram on ${v.object}: ` + (v.forces||[]).map(f => `${f.label} ${f.size ?? ''} ${f.dir}`).join(', '), graph: () => `graph of ${v.yLabel} vs ${v.xLabel}`, bars: () => 'bar chart: ' + (v.items||[]).map(i => `${i.label} ${i.value}`).join(', '), labelled: () => `labelled diagram of ${v.center}: ` + (v.parts||[]).map(p => p.name || p).join(', '), process: () => (v.cycle ? 'cycle: ' : 'process: ') + (v.steps||[]).join(' → '), timeline: () => 'timeline: ' + (v.events||[]).map(x => `${x.when} ${x.label}`).join('; '), particles: () => `particles in a ${v.state}`, reaction: () => 'reaction: ' + (v.equation || ''), code: () => 'code editor: ' + String(v.code).slice(0, 80), architecture: () => 'architecture layers: ' + (v.layers||[]).map(l => l.name).join(' → '), compare: () => `comparison: ${v.left && v.left.title} vs ${v.right && v.right.title}`, geometry: () => `${v.shape} with labels`, numberline: () => `number line ${v.min} to ${v.max}`, keypoint: () => 'key idea: ' + v.text };
    return (m[v.type] || (() => v.type))();
  }
  M.on('route', () => { if(Video._stop) Video._stop(); });
})();
