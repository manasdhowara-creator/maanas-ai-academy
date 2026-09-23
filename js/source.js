/* source.js — Source Engine: read PDFs/text in the browser (pdf.js, free, local), detect book → chapter → section,
   OCR scanned pages via Claude vision when available, and verify quotes word-for-word against the source. */
(function(){
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MAX_PAGES = 400;
  let libPromise = null;

  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF reader. Check your connection and try again.')); document.head.appendChild(s); });

  const Source = window.Source = {
    lib(){
      if(!libPromise) libPromise = (async () => {
        await loadScript(PDFJS);
        await loadScript(PDFJS_WORKER); // defines globalThis.pdfjsWorker → pdf.js runs its worker code on the main thread (cross-origin workers are blocked here)
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return window.pdfjsLib;
      })().catch(e => { libPromise = null; throw e; });
      return libPromise;
    },

    /* returns {name, kind, pages:[string], outline:[{title,page}], scanned, doc} */
    async read(file, onProgress = () => {}){
      const name = file.name || 'Your file';
      if(/\.(txt|md|markdown|csv)$/i.test(name) || /^text\//.test(file.type)){
        const text = await file.text();
        if(!text.trim()) throw new Error('This file is empty.');
        const pages = []; for(let i = 0; i < text.length; i += 3500) pages.push(text.slice(i, i + 3500));
        return { name, kind:'text', pages, outline:[], scanned:false, doc:null };
      }
      if(!/\.pdf$/i.test(name) && file.type !== 'application/pdf') throw new Error('Please upload a PDF or a text file (.txt / .md).');
      onProgress('Loading the PDF reader…');
      const pdfjs = await this.lib();
      const buf = await file.arrayBuffer();
      let doc;
      try { doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise; }
      catch(e){ throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password-protected. Remove the password and upload it again.' : 'This PDF could not be opened. It may be damaged. Try another copy.'); }
      const n = Math.min(doc.numPages, MAX_PAGES); const pages = [];
      for(let i = 1; i <= n; i++){
        if(i % 5 === 1) onProgress(`Reading page ${i} of ${n}…`);
        try {
          const pg = await doc.getPage(i); const tc = await pg.getTextContent();
          let s = ''; tc.items.forEach(it => { s += it.str + (it.hasEOL ? '\n' : ' '); });
          pages.push(s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim());
        } catch(_){ pages.push(''); }
      }
      const textChars = pages.reduce((a, p) => a + p.length, 0);
      const scanned = textChars < n * 40;
      let outline = [];
      try { outline = await this.outline(doc); } catch(_){}
      return { name, kind:'pdf', pages, outline, scanned, doc, totalPages: doc.numPages };
    },

    async outline(doc){
      const ol = await doc.getOutline(); if(!ol || !ol.length) return [];
      const out = [];
      for(const item of ol.slice(0, 60)){
        let page = null;
        try {
          let dest = item.dest; if(typeof dest === 'string') dest = await doc.getDestination(dest);
          if(Array.isArray(dest) && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1;
        } catch(_){}
        if(page) out.push({ title: String(item.title || '').trim(), page, children: (item.items || []).map(c => String(c.title || '').trim()).slice(0, 20) });
      }
      return out.sort((a, b) => a.page - b.page);
    },

    /* Book → chapters: outline first, then headings, else fixed chunks. AI detection available separately. */
    chapters(book){
      const n = book.pages.length;
      const fin = list => list.map((c, i) => ({ ...c, end: i < list.length - 1 ? Math.max(c.start, list[i + 1].start - 1) : n })).filter(c => c.start <= n);
      if(book.outline && book.outline.length >= 2) return { method:'outline', list: fin(book.outline.map(o => ({ title:o.title, start:o.page, sections:o.children }))) };
      const found = [];
      book.pages.forEach((p, i) => {
        const head = p.slice(0, 300).split('\n').slice(0, 5).join(' ');
        const m = head.match(/\b(chapter|unit|lesson)\s+(\d{1,2}|[ivxl]{1,5})\b[\s:.\-–]*([^\n]{0,70})/i);
        if(m && !found.some(f => f.num === m[2].toLowerCase())) found.push({ num: m[2].toLowerCase(), title: `${M.cap(m[1].toLowerCase())} ${m[2]}${m[3] ? ': ' + m[3].trim().replace(/\s+/g, ' ').slice(0, 60) : ''}`, start: i + 1 });
      });
      if(found.length >= 2) return { method:'headings', list: fin(found) };
      if(n <= 25) return { method:'whole', list: [{ title: book.name.replace(/\.[^.]+$/, ''), start: 1, end: n }] };
      const list = []; for(let s = 1; s <= n; s += 12) list.push({ title:`Pages ${s}–${Math.min(n, s + 11)}`, start: s, end: Math.min(n, s + 11) });
      return { method:'chunks', list };
    },

    async chaptersAI(book){
      const snippets = book.pages.map((p, i) => `[p${i + 1}] ${p.slice(0, 110).replace(/\s+/g, ' ')}`).join('\n').slice(0, 30000);
      const r = await AI.json(`These are the first words of each page of a book/notes file. Detect its chapter structure. Only use titles that actually appear in the text; do not invent.\n${snippets}\nReply ONLY JSON {"chapters":[{"title":"exact title from the text","start": page number}]}`, { tier:'quick' });
      const list = (r.chapters || []).filter(c => c.title && Number(c.start) >= 1 && Number(c.start) <= book.pages.length).map(c => ({ title: String(c.title).slice(0, 80), start: Number(c.start) })).sort((a,b) => a.start - b.start);
      if(list.length < 1) throw new Error('No clear chapters were found.');
      return { method:'ai', list: list.map((c, i) => ({ ...c, end: i < list.length - 1 ? Math.max(c.start, list[i + 1].start - 1) : book.pages.length })) };
    },

    text(book, ch){ return book.pages.slice(ch.start - 1, ch.end).join('\n\n').trim(); },

    /* scanned pages → text via Claude vision (only where this view can send images) */
    async ocr(book, ch, onProgress = () => {}){
      if(!AI.ready() || !AI.canSeeImages()) throw new Error('This PDF is scanned (only images, no text). Reading scanned pages needs the AI with image support, which isn’t available here. Try a text-based PDF or paste the text instead.');
      const max = Math.min(AI.limits.images.maxCount || 5, 5);
      const pages = []; for(let p = ch.start; p <= Math.min(ch.end, ch.start + 19); p++) pages.push(p);
      let out = '';
      for(let i = 0; i < pages.length; i += max){
        const batch = pages.slice(i, i + max); onProgress(`Reading scanned pages ${batch[0]}–${batch[batch.length - 1]}…`);
        const blobs = [];
        for(const p of batch){
          const pg = await book.doc.getPage(p); const vp = pg.getViewport({ scale: 1.6 });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          blobs.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)));
        }
        const text = await AI.text(`Transcribe ALL text on these ${blobs.length} page image(s) exactly, in reading order. Mark each page start with [page N] using these page numbers: ${batch.join(', ')}. Do not summarise, translate or add anything.`, { images: blobs, tier:'default' });
        out += '\n' + text;
        batch.forEach((p, j) => { book.pages[p - 1] = (text.split(/\[page\s*\d+\]/i)[j + 1] || '').trim() || book.pages[p - 1]; });
      }
      return out.trim();
    },

    /* word-for-word verification (whitespace, case, quotes, hyphenation normalised) */
    normQ(s){ return String(s || '').toLowerCase().replace(/-\s*\n\s*/g, '').replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}'" .,;:%()\-/]/gu, '').trim(); },
    verify(quote, text){
      const q = this.normQ(quote); if(q.length < 12) return false;
      const t = this.normQ(text);
      if(t.includes(q)) return true;
      const q2 = q.replace(/[.,;:]+$/, ''); return q2.length >= 12 && t.includes(q2);
    },
  };
})();
