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

    /* Book → REAL chapters, never arbitrary page ranges. Tried in order:
       1. the PDF's own table of contents (bookmarks)
       2. pages that open with "Chapter 3 …", "Unit 2 …", "Lesson 5 …"
       3. running page headers — textbooks print the chapter name at the top of every page
          (e.g. NCERT: "RATIONAL NUMBERS" on odd pages, "MATHEMATICS" on even pages)
       4. AI detection (chaptersAI) — used automatically when 1-3 find nothing
       Only if all fail: a short file is one chapter, a long one falls back to page ranges. */
    chapters(book){
      const n = book.pages.length;
      const fin = list => list.map((c, i) => ({ ...c, end: i < list.length - 1 ? Math.max(c.start, list[i + 1].start - 1) : n })).filter(c => c.start <= n);
      if(book.outline && book.outline.length >= 2){
        // keep only top-level entries that look like chapters when the outline also lists sub-sections
        let ol = book.outline;
        const chap = ol.filter(o => /\b(chapter|unit|lesson|part)\b|^\s*\d{1,2}[.:)\s]/i.test(o.title));
        if(chap.length >= 2 && chap.length < ol.length) ol = chap;
        return { method:'outline', list: fin(ol.map(o => ({ title:o.title, start:o.page, sections:o.children }))) };
      }
      const found = [];
      const titleish = l => l && l.length >= 3 && l.length <= 70 && !/[.,;]$/.test(l) && !/^\d+$/.test(l);
      book.pages.forEach((p, i) => {
        const lines = p.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
        for(let k = 0; k < lines.length; k++){
          const m = lines[k].match(/^(chapter|unit|lesson|adhyay|अध्याय|पाठ)\s*[-:]?\s*(\d{1,2}|[ivxl]{1,5})\b[\s:.\-–]*(.*)$/i);
          if(!m) continue;
          const num = m[2].toLowerCase(); if(found.some(f => f.num === num)) break;
          const rest = m[3].trim();
          const name = titleish(rest) ? rest : titleish(lines[k + 1]) ? lines[k + 1] : titleish(lines[k - 1]) ? lines[k - 1] : '';
          const nice = name ? (name === name.toUpperCase() ? name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : name) : '';
          found.push({ num, title: `${M.cap(m[1].toLowerCase())} ${m[2]}${nice ? ': ' + nice.replace(/\s+/g, ' ').slice(0, 60) : ''}`, start: i + 1 });
          break;
        }
      });
      if(found.length >= 2) return { method:'headings', list: fin(found) };
      const run = this.runningHeaders(book);
      if(run) return { method:'headers', list: fin(run) };
      if(n <= 30) return { method:'whole', list: [{ title: book.name.replace(/\.[^.]+$/, ''), start: 1, end: n }] };
      const list = []; for(let s = 1; s <= n; s += 12) list.push({ title:`Pages ${s}–${Math.min(n, s + 11)}`, start: s, end: Math.min(n, s + 11) });
      return { method:'chunks', list };
    },

    runningHeaders(book){
      const n = book.pages.length; if(n < 8) return null;
      const keyOf = line => line.toLowerCase().replace(/[0-9]+/g, '').replace(/[^\p{L} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
      const heads = book.pages.map(p => {
        const lines = p.split('\n').map(x => x.trim()).filter(Boolean);
        const cands = [lines[0], lines[1], lines[lines.length - 1]].filter(Boolean).map(l => ({ raw: l.replace(/^\d+\s+|\s+\d+$/g, '').trim(), key: keyOf(l) })).filter(c => c.key.length >= 4 && c.key.length <= 70);
        return cands;
      });
      const freq = {}; heads.forEach(c => new Set(c.map(x => x.key)).forEach(k => { freq[k] = (freq[k] || 0) + 1; }));
      // a book-wide header (e.g. the subject name on every even page) is not a chapter name
      const isChapterKey = k => freq[k] >= 2 && freq[k] <= n * 0.45;
      const pageKey = heads.map(c => { const h = c.find(x => isChapterKey(x.key)); return h || null; });
      const runs = [];
      pageKey.forEach((h, i) => {
        if(!h) return;
        const last = runs[runs.length - 1];
        if(last && last.key === h.key){ last.end = i + 1; last.count++; }
        else runs.push({ key: h.key, title: h.raw, start: i + 1, end: i + 1, count: 1 });
      });
      // merge tiny interruptions, keep runs that span real chapters
      const good = runs.filter(r => r.count >= 2);
      const merged = [];
      good.forEach(r => { const last = merged[merged.length - 1]; if(last && last.key === r.key) last.end = r.end; else merged.push({ ...r }); });
      if(merged.length < 2) return null;
      const covered = merged.reduce((a, r) => a + (r.end - r.start + 1), 0);
      if(covered < n * 0.5) return null;
      // a chapter usually starts a page or two before its header first appears (the opening page has no header)
      return merged.map((r, i) => ({ title: M.cap(r.title.toLowerCase()).replace(/\b\w/g, c => c.toUpperCase()).slice(0, 80), start: i === 0 ? 1 : Math.max(merged[i - 1].end + 1, r.start - 1) }));
    },

    async chaptersAI(book){
      const pick = p => { const lines = p.split('\n').map(x => x.trim()).filter(Boolean); return (lines.slice(0, 4).join(' | ') + (lines.length > 4 ? ' … ' + lines[lines.length - 1] : '')).replace(/\s+/g, ' ').slice(0, 220); };
      const snippets = book.pages.map((p, i) => `[p${i + 1}] ${pick(p)}`).join('\n').slice(0, 90000);
      const r = await AI.json(`Below are the first lines (and last line) of EVERY page of a textbook / notes PDF called "${book.name}". Find where each CHAPTER starts. Clues: a page that opens with a chapter number or a big title, the running header at the top of pages changing to a new chapter name, "Chapter"/"Unit"/"Lesson"/"अध्याय" words, exercise pages ending a chapter. Ignore the cover, contents, preface and answers pages (start the first chapter at its real first page). Use the real chapter titles from the text (fix capitalisation), never invent titles, and never return page ranges as titles.
${snippets}
Reply ONLY JSON {"chapters":[{"title":"Chapter 1: Rational Numbers","start": page number}]}`, { tier:'quick', maxTokens: 4096 });
      const list = (r.chapters || []).filter(c => c.title && Number(c.start) >= 1 && Number(c.start) <= book.pages.length && !/^pages?\s*\d/i.test(c.title)).map(c => ({ title: String(c.title).slice(0, 80), start: Number(c.start) })).sort((a,b) => a.start - b.start)
        .filter((c, i, arr) => i === 0 || c.start > arr[i - 1].start);
      if(list.length < 1 || (list.length < 2 && book.pages.length > 40)) throw new Error('No clear chapters were found.');
      return { method:'ai', list: list.map((c, i) => ({ ...c, end: i < list.length - 1 ? Math.max(c.start, list[i + 1].start - 1) : book.pages.length })) };
    },

    text(book, ch){ return book.pages.slice(ch.start - 1, ch.end).join('\n\n').trim(); },

    /* scanned pages → text via Claude vision (only where this view can send images) */
    async ocr(book, ch, onProgress = () => {}){
      if(!AI.ready() || !AI.canSeeImages()) throw new Error('This PDF is scanned (only images, no text). Reading scanned pages needs the AI with image support, which isn’t available here. Try a text-based PDF or paste the text instead.');
      const max = Math.min(AI.limits.images.maxCount || 5, 5);
      const pages = []; for(let p = ch.start; p <= Math.min(ch.end, ch.start + 49); p++) pages.push(p);
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
