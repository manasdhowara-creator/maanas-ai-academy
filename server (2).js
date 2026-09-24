/* server.js — serves the academy's static files AND proxies AI requests to Google's
   free-tier Gemini API. The Gemini API key lives ONLY here, as a server environment
   variable (GEMINI_API_KEY) — it is never sent to the browser.

   MODEL SELECTION IS SELF-UPDATING: instead of a hardcoded model name (which breaks
   whenever Google renames/retires a model), this server asks Google's own API for the
   list of models currently available to this key, picks the "flash" family (fast +
   free-tier friendly), and tries them newest-first, falling back automatically on any
   one that's busy, retired, or gives a broken answer. The list is re-fetched once an
   hour, so as Google's lineup changes over time, this keeps working with no code edits. */
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const FETCH_TIMEOUT_MS = 45000;
const MODEL_LIST_TTL_MS = 60 * 60 * 1000; // re-check available models once an hour

/* ---------- Email (Master Notes / Formula Sheet delivery) ----------
   Uses Resend (https://resend.com) — a plain HTTPS API call, no extra
   npm package needed. Nothing fake here: if RESEND_API_KEY is not set,
   the endpoint honestly reports "not configured" and sends nothing;
   the frontend only shows success once Resend actually confirms delivery.
   NOTE: until a sending domain is verified on the Resend account, Resend
   only allows delivery to the account owner's own email address — this
   is a Resend account-level limit, not a bug here. */
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Maanas AI Academy <onboarding@resend.dev>';

// Last-resort hardcoded list, used only if the live model list can't be fetched at all
// (e.g. a transient network issue) — kept a few models deep just in case.
const HARDCODED_FALLBACK = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

let modelsCache = { list: [], at: 0 };

async function getModels() {
  if (modelsCache.list.length && Date.now() - modelsCache.at < MODEL_LIST_TTL_MS) return modelsCache.list;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });
    if (!res.ok) throw new Error('model list request failed: ' + res.status);
    const data = await res.json();
    const flash = (data.models || [])
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => (m.name || '').replace(/^models\//, ''))
      .filter(name => /flash/i.test(name) && !/vision|embed|tts|image|audio/i.test(name));
    // Prefer the highest version number first, and non-"lite" variants before "lite" ones
    // within the same version, so we try the most capable available model first.
    flash.sort((a, b) => {
      const va = parseFloat((a.match(/(\d+(\.\d+)?)/) || [0, '0'])[1]);
      const vb = parseFloat((b.match(/(\d+(\.\d+)?)/) || [0, '0'])[1]);
      if (vb !== va) return vb - va;
      return (a.includes('lite') ? 1 : 0) - (b.includes('lite') ? 1 : 0);
    });
    const list = [...new Set([process.env.GEMINI_MODEL, ...flash].filter(Boolean))];
    if (list.length) {
      modelsCache = { list, at: Date.now() };
      console.log('Gemini models available now:', list.join(', '));
      return list;
    }
  } catch (e) {
    console.warn('Could not fetch live Gemini model list, using hardcoded fallback:', e.message);
  }
  return [process.env.GEMINI_MODEL, ...HARDCODED_FALLBACK].filter(Boolean);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: !!(GEMINI_API_KEY || GROQ_API_KEY), email: !!RESEND_API_KEY });
});

/* Sends Master Notes / Formula Sheet emails via Resend. The recipient is
   always the learner's OWN registered email (sent by the frontend from
   their saved profile — never typed in by hand here), so each learner
   only ever receives their own notes. Returns success ONLY after Resend
   actually confirms the send — never a fake "sent" response. */
app.post('/api/email', async (req, res) => {
  try {
    if (!RESEND_API_KEY) return res.status(503).json({ error: 'email_not_configured' });
    const { to, subject, html, text } = req.body || {};
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'bad_recipient' });
    if (!subject || !(html || text)) return res.status(400).json({ error: 'missing_fields' });

    const upstream = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject: String(subject).slice(0, 200),
        html: html || undefined,
        text: text || (html ? undefined : ' '),
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error('Resend send failed:', upstream.status, detail.slice(0, 400));
      // Resend's own error for "domain not verified, can only send to account owner"
      if (upstream.status === 403 && /verify a domain|only send testing emails/i.test(detail)) {
        return res.status(502).json({ error: 'send_failed', detail: 'Sender domain not verified on Resend yet — it can currently only email the Resend account owner\'s own address.' });
      }
      return res.status(502).json({ error: 'send_failed' });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Email send failed:', e.message);
    return res.status(502).json({ error: 'send_failed' });
  }
});

/* Groq — a completely separate, independent free-tier AI provider (different
   infrastructure from Google entirely). Used ONLY as a last-resort fallback,
   after every Gemini model has failed. Groq uses an OpenAI-compatible chat
   completions API, so we convert our Gemini-style `contents` into OpenAI-style
   `messages` and reuse the same extractJson() helper for JSON-mode replies. */
async function callGroq(contents, wantJson) {
  const messages = contents.map(c => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: (c.parts || []).map(p => p.text || '').join('\n') || '(no text)',
  }));
  const body = {
    model: GROQ_MODEL,
    messages,
    max_tokens: 8192,
  };
  if (wantJson) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    throw new Error(`Groq upstream error ${upstream.status}: ${detail.slice(0, 300)}`);
  }
  const data = await upstream.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  if (!text) throw new Error('Groq returned empty response');
  return text;
}

// Strip ```json ... ``` / ``` ... ``` fences some models add despite instructions,
// then try to parse; if that fails, fall back to extracting the first {...}/[...] block.
function extractJson(rawText) {
  let text = rawText.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return undefined;
}

async function callModel(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return upstream;
  } finally {
    clearTimeout(timer);
  }
}

app.post('/api/ai', async (req, res) => {
  try {
    if (!GEMINI_API_KEY && !GROQ_API_KEY) return res.status(503).json({ error: 'no_api_key' });

    const { input, json, images } = req.body || {};
    if (!input) return res.status(400).json({ error: 'missing_input' });

    let contents;
    if (typeof input === 'string') {
      const parts = [{ text: input }];
      if (Array.isArray(images)) {
        images.forEach(img => {
          if (img && img.data) parts.push({ inline_data: { mime_type: img.mime || 'image/jpeg', data: img.data } });
        });
      }
      contents = [{ role: 'user', parts }];
    } else if (Array.isArray(input)) {
      contents = input.map(t => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(t.content || '') }],
      }));
    } else {
      return res.status(400).json({ error: 'bad_input' });
    }

    if (json) {
      const last = contents[contents.length - 1];
      last.parts[0].text += '\n\nRespond with ONLY valid JSON. No markdown code fences, no extra commentary.';
    }

    const body = { contents, generationConfig: { maxOutputTokens: 8192 } };
    if (json) body.generationConfig.responseMimeType = 'application/json';

    const MODELS = GEMINI_API_KEY ? await getModels() : [];
    let lastErrDetail = '', lastErrStatus = 502, lastInvalidRaw = '';

    for (let i = 0; i < MODELS.length; i++) {
      const model = MODELS[i];
      const isLastModel = i === MODELS.length - 1;
      let upstream;
      try {
        upstream = await callModel(model, body);
      } catch (e) {
        console.warn(`Gemini model ${model} request failed (${e.name}: ${e.message}), trying next...`);
        lastErrDetail = e.message || 'network error';
        continue; // network hiccup / timeout — try the next model
      }

      if (!upstream.ok) {
        let detail = '';
        try { detail = (await upstream.text()).slice(0, 500); } catch (_) {}
        lastErrDetail = detail; lastErrStatus = upstream.status;
        if (upstream.status === 503 || upstream.status === 404 || upstream.status === 429) {
          console.warn(`Gemini model ${model} unavailable (${upstream.status}), trying next fallback...`);
          continue; // busy / doesn't exist / rate-limited on this model — try next
        }
        // A genuine bad-request (400) or auth error (401/403) won't be fixed by
        // switching models, so stop here.
        console.error('Gemini upstream error', upstream.status, 'model:', model, detail);
        const status = upstream.status === 400 ? 400 : 502;
        return res.status(status).json({ error: 'upstream_error', status: upstream.status });
      }

      const data = await upstream.json();
      const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts || []).map(p => p.text || '').join('');
      const finishReason = data.candidates && data.candidates[0] && data.candidates[0].finishReason;

      if (!text) {
        console.warn(`Gemini model ${model} returned no text (finishReason: ${finishReason || 'unknown'}), trying next...`);
        lastErrDetail = 'empty response, finishReason: ' + finishReason;
        continue;
      }

      if (!json) return res.json({ text });

      const parsed = extractJson(text);
      if (parsed !== undefined) return res.json({ parsed });

      lastInvalidRaw = text.slice(0, 800);
      console.warn(`Gemini model ${model} gave unparsable JSON, trying next...`, isLastModel ? '(no more models left)' : '');
    }

    // Every Gemini model failed (or no Gemini key at all). Last resort: Groq,
    // a completely independent free-tier provider on separate infrastructure.
    if (GROQ_API_KEY) {
      try {
        console.warn('All Gemini models failed/unavailable — falling back to Groq...');
        const text = await callGroq(contents, !!json);
        if (!json) return res.json({ text });
        const parsed = extractJson(text);
        if (parsed !== undefined) return res.json({ parsed });
        console.error('Groq gave unparsable JSON | last raw text:', text.slice(0, 800));
        return res.status(502).json({ error: 'invalid_json', raw: text.slice(0, 500) });
      } catch (e) {
        console.error('Groq fallback also failed:', e.message);
      }
    }

    // Every provider failed.
    if (lastInvalidRaw) {
      console.error('invalid_json from all models | last raw text:', lastInvalidRaw);
      return res.status(502).json({ error: 'invalid_json', raw: lastInvalidRaw.slice(0, 500) });
    }
    console.error('All providers failed. Last status:', lastErrStatus, 'detail:', lastErrDetail);
    return res.status(lastErrStatus === 429 ? 429 : 502).json({ error: 'upstream_error', status: lastErrStatus });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// SPA fallback for hash-routed pages
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Maanas AI Academy server listening on ' + PORT));
