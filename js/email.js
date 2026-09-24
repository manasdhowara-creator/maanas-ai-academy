/* email.js — sends Master Notes / One-Page Revision / Formula Sheet to the
   learner's OWN registered email (Store.state.profile.email). The recipient
   is never typed in by hand: every send uses whichever profile is active on
   THIS device, so each learner's notes only ever go to their own address.
   The real sending happens server-side (server.js -> Gmail); this file only
   builds a clean HTML email and reports the backend's real result — never a
   fake "sent" message. */
(function(){
  const esc = M.esc;
  const md = s => String(s || '').replace(/</g, '&lt;');

  function shell(title, subtitle, bodyHtml){
    return `<div style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;color:#1c1c1c;background:#fff">
      <div style="background:#0f172a;color:#fff;padding:22px 24px;border-radius:10px 10px 0 0">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75">Maanas AI Academy</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">${esc(title)}</div>
        ${subtitle ? `<div style="font-size:13px;opacity:.85;margin-top:4px">${esc(subtitle)}</div>` : ''}
      </div>
      <div style="padding:22px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">${bodyHtml}</div>
      <div style="text-align:center;color:#9ca3af;font-size:12px;padding:14px">Sent to you because you're studying this on Maanas AI Academy.</div>
    </div>`;
  }
  const section = (title, innerHtml) => innerHtml ? `<div style="margin:0 0 18px"><div style="font-size:15px;font-weight:700;color:#0f172a;border-bottom:2px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px">${esc(title)}</div>${innerHtml}</div>` : '';
  const ul = arr => (arr && arr.length) ? `<ul style="margin:0;padding-left:20px;line-height:1.6">${arr.map(x => `<li>${md(x)}</li>`).join('')}</ul>` : '';
  const defs = arr => (arr && arr.length) ? `<ul style="margin:0;padding-left:20px;line-height:1.6">${arr.map(d => `<li><b>${esc(d.term)}</b> — ${md(d.meaning)}</li>`).join('')}</ul>` : '';

  function formulaBlock(f){
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:10px">
      <div style="font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:700;color:#0f172a">${esc(f.formula)}</div>
      ${f.symbols && f.symbols.length ? `<div style="font-size:13px;color:#334155;margin-top:4px">${f.symbols.map(s => `<b>${esc(s.sym)}</b> = ${esc(s.meaning)}`).join(' &nbsp;·&nbsp; ')}${f.unit ? ' &nbsp;·&nbsp; unit: ' + esc(f.unit) : ''}</div>` : ''}
      ${f.whenToUse ? `<div style="font-size:13px;margin-top:6px"><b>When to use:</b> ${md(f.whenToUse)}</div>` : ''}
      ${f.example ? `<div style="font-size:13px;margin-top:4px"><b>Example:</b> ${md(f.example)}</div>` : ''}
      ${f.mistake ? `<div style="font-size:13px;margin-top:4px;color:#b45309"><b>Common mistake:</b> ${md(f.mistake)}</div>` : ''}
    </div>`;
  }

  async function post(to, subject, html){
    let res;
    try {
      res = await fetch('/api/email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to, subject, html }) });
    } catch(e){ throw new Error('Could not reach the server to send this email. Check your connection and try again.'); }
    if(!res.ok){
      let payload = {}; try { payload = await res.json(); } catch(_){}
      const msgs = {
        email_not_configured: 'Email sending is not set up on the server yet.',
        bad_recipient: 'Your saved email address looks invalid. Fix it in Settings.',
        missing_fields: 'Nothing to send yet.',
        send_failed: 'The email could not be sent. Try again in a bit.',
      };
      throw new Error(msgs[payload.error] || 'The email could not be sent.');
    }
    return res.json();
  }

  async function withButton(btn, fn){
    if(!btn) return fn();
    const original = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> Sending…';
    try { await fn(); M.toast('Sent to ' + Store.state.profile.email); }
    catch(e){ M.toast(e.message); }
    finally { btn.disabled = false; btn.innerHTML = original; }
  }

  const E = window.Email = {
    ready(){ return !!Store.state.profile.email; },

    async sendNotes(t, btn){
      if(!this.ready()) return M.toast('Add your email in Settings first.');
      if(!t.masterNotes) return M.toast('Build Master Notes for this topic first.');
      const n = t.masterNotes;
      const body = [
        section('Overview', n.overview ? `<p style="line-height:1.6">${md(n.overview)}</p>` : ''),
        section('Core concepts', ul(n.coreConcepts)),
        section('Definitions', defs(n.definitions)),
        section('Worked examples', (n.examples || []).map(e => `<div style="margin-bottom:10px"><b>${esc(e.title)}</b><div style="line-height:1.6">${md(e.body)}</div></div>`).join('')),
        section('Formulas', (n.formulas || []).map(formulaBlock).join('')),
        section('Key facts', ul(n.keyFacts)),
        section('Common mistakes', ul(n.mistakes)),
        section('Exam points', ul(n.examPoints)),
        section('Important questions', ul(n.importantQuestions)),
        section('Memory aids', ul(n.memoryAids)),
        section('Everything you must know', ul(n.checklist)),
      ].join('');
      await withButton(btn, () => post(Store.state.profile.email, 'Master Notes: ' + t.title, shell('Master Notes', t.title, body)));
    },

    async sendSheet(t, btn){
      if(!this.ready()) return M.toast('Add your email in Settings first.');
      if(!t.sheet) return M.toast('Build the one-page revision sheet for this topic first.');
      const s = t.sheet;
      const body = [
        section('Key concepts', ul(s.keyConcepts)),
        section('Definitions', defs(s.definitions)),
        section('Formulas', ul(s.formulas)),
        section('Important facts', ul(s.facts)),
        section('Common mistakes', ul(s.mistakes)),
        section('Tricky points', ul(s.tricky)),
        section('Memory hooks', ul(s.hooks)),
        section('Important questions', ul(s.questions)),
      ].join('');
      await withButton(btn, () => post(Store.state.profile.email, 'One-Page Revision: ' + t.title, shell('One-Page Revision', t.title, body)));
    },

    async sendFormulas(t, btn){
      if(!this.ready()) return M.toast('Add your email in Settings first.');
      const items = Store.state.formulas.filter(f => f.topicId === t.id);
      if(!items.length) return M.toast('No formulas for this topic yet.');
      const body = section('Formula Bank — ' + t.title, items.map(formulaBlock).join(''));
      await withButton(btn, () => post(Store.state.profile.email, 'Formula Sheet: ' + t.title, shell('Formula Sheet', t.title, body)));
    },
  };
})();
