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
const compression = require('compression');
const path = require('path');
const { createAccounts } = require('./accounts');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits behind a proxy: needed so req.ip is the real visitor, not the proxy
app.use(compression());

/* ---------- Security headers ----------
   Deliberately NOT a strict script-src: the Coding Lab runs learner code in a sandboxed
   srcdoc iframe (which inherits the page's CSP), so a strict script policy would break it.
   These directives are the ones that add safety without breaking any feature. */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

/* ---------- Tiny in-memory rate limiter (no extra dependency) ----------
   /api/ai spends YOUR free-tier AI quota and /api/email sends mail from YOUR account, and
   neither requires a login, so without a limit anyone could drain or abuse them. Limits are
   per visitor IP and tunable with environment variables. Counters reset if the server restarts. */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 60 * 1000).unref();
  return (req, res, next) => {
    const now = Date.now();
    const who = req.user ? 'u:' + req.user.id : 'ip:' + req.ip;   // per learner once logged in (a class can share one IP)
    let e = hits.get(who);
    if (!e || e.reset <= now) { e = { n: 0, reset: now + windowMs }; hits.set(who, e); }
    e.n++;
    if (e.n > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((e.reset - now) / 1000))));
      return res.status(429).json({ error: 'rate_limited' });
    }
    next();
  };
}
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_MAX, 10) || 200,   // generous: a classroom may share one school IP
});
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.EMAIL_RATE_MAX, 10) || 8,
});

// Body parsers: a big limit ONLY where it is needed (AI requests carry source text + images).
app.use('/api/ai', express.json({ limit: '16mb' }));

/* ---------- Learner accounts + private per-learner cloud data (see accounts.js) ---------- */
const accounts = createAccounts();
app.use('/api', accounts.router);
app.use(express.json({ limit: '1mb' }));

/* ---------- Static files: an explicit allow-list ----------
   The old setup served the whole project folder, which made server.js, package.json and an
   old zip of the source publicly downloadable. Now only the files the app needs are served. */
const ROOT = __dirname;
const PUBLIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/styles.css': 'styles.css',
  '/manifest.webmanifest': 'manifest.webmanifest',
  '/favicon.svg': 'favicon.svg',
  '/icon-192.png': 'icon-192.png',
  '/icon-512.png': 'icon-512.png',
  '/robots.txt': 'robots.txt',
  '/sw.js': 'sw.js',
};
Object.entries(PUBLIC_FILES).forEach(([urlPath, file]) => {
  app.get(urlPath, (req, res, next) => {
    res.sendFile(path.join(ROOT, file), {
      headers: urlPath === '/sw.js' || file === 'index.html'
        ? { 'Cache-Control': 'no-cache', ...(urlPath === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) }
        : { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    }, err => { if (err) next(err.code === 'ENOENT' ? undefined : err); });
  });
});
app.use('/js', express.static(path.join(ROOT, 'js'), { index: false, dotfiles: 'ignore', maxAge: 0, setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate') }));

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
/* Brevo (https://brevo.com) — preferred when set: free 300 emails/day, and it can deliver to ANY
   learner's inbox after a one-time sender-email verification (no domain needed). Plain HTTPS API,
   which also works on Render's free plan (outbound SMTP ports are blocked there). */
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER = process.env.BREVO_SENDER || '';            // the verified sender address
const EMAIL_PROVIDER = BREVO_API_KEY && BREVO_SENDER ? 'brevo' : RESEND_API_KEY ? 'resend' : 'none';
console.log('Email provider:', EMAIL_PROVIDER);

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

app.get('/api/health', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const acc = await accounts.health();
  res.json({ ok: !!(GEMINI_API_KEY || GROQ_API_KEY), email: EMAIL_PROVIDER !== 'none', accounts: acc.ok ? acc.kind : 'down' });
});

// Lightweight liveness check (no AI involved) — point Render's health check / an uptime monitor here.
app.get('/healthz', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.type('text/plain').send('ok'); });

/* Sends Master Notes / Formula Sheet emails via Resend. The recipient is
   always the learner's OWN registered email (sent by the frontend from
   their saved profile — never typed in by hand here), so each learner
   only ever receives their own notes. Returns success ONLY after Resend
   actually confirms the send — never a fake "sent" response. */
app.post('/api/email', accounts.requireUser, emailLimiter, async (req, res) => {
  try {
    if (EMAIL_PROVIDER === 'none') return res.status(503).json({ error: 'email_not_configured' });
    const { subject, html, text } = req.body || {};
    // Recipient safety: an account that logged in with an email can only ever mail ITSELF.
    // (Username accounts use the email saved in their own profile.)
    const accountEmail = req.user.login.includes('@') ? req.user.login : '';
    const to = accountEmail || String((req.body || {}).to || '').trim().toLowerCase();
    if (typeof to !== 'string' || to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'bad_recipient' });
    if (!subject || !(html || text)) return res.status(400).json({ error: 'missing_fields' });
    if ((html && (typeof html !== 'string' || html.length > 600000)) || (text && (typeof text !== 'string' || text.length > 200000))) {
      return res.status(413).json({ error: 'prompt_too_large' });
    }
    const subj = String(subject).slice(0, 200);
    let upstream;
    if (EMAIL_PROVIDER === 'brevo') {
      upstream = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({ sender: { name: 'Maanas AI Academy', email: BREVO_SENDER }, to: [{ email: to, name: req.user.name || undefined }], subject: subj, htmlContent: html || undefined, textContent: text || undefined }),
      });
    } else {
      upstream = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: subj, html: html || undefined, text: text || (html ? undefined : ' ') }),
      });
    }
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.error(`${EMAIL_PROVIDER} send failed:`, upstream.status, detail.slice(0, 400));
      if (upstream.status === 403 && /verify a domain|only send testing emails/i.test(detail)) {
        return res.status(502).json({ error: 'send_failed', detail: 'Email service can only send to the admin’s own address until it is fully set up.' });
      }
      return res.status(502).json({ error: 'send_failed' });
    }
    return res.json({ ok: true, to });
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
    max_tokens: 8000,
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

/* Model health memory: a model that just timed out / was busy is tried LAST for a few minutes,
   and the model that last answered well is tried FIRST. Before this, every request waited 45 s on
   the same overloaded newest model before moving on (seen in the live logs). */
const modelPenalty = new Map();   // model -> time until which it is demoted
let lastGoodModel = null;
function orderModels(list) {
  const now = Date.now();
  const risky = m => /preview|exp|omni/i.test(m) ? 1 : 0;
  return list.slice().sort((a, b) =>
    ((modelPenalty.get(a) || 0) > now) - ((modelPenalty.get(b) || 0) > now) ||
    (b === lastGoodModel) - (a === lastGoodModel) ||
    risky(a) - risky(b));
}
const demote = (m, ms) => modelPenalty.set(m, Date.now() + ms);

async function callModel(model, body, timeoutMs = FETCH_TIMEOUT_MS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

const MAX_PROMPT_CHARS = 400000;   // roughly a long book chapter
const MAX_IMAGES = 4;
const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i;

app.post('/api/ai', accounts.requireUser, aiLimiter, async (req, res) => {
  try {
    if (!GEMINI_API_KEY && !GROQ_API_KEY) return res.status(503).json({ error: 'no_api_key' });

    const { input, json, images, maxTokens } = req.body || {};
    if (!input) return res.status(400).json({ error: 'missing_input' });

    const promptChars = typeof input === 'string' ? input.length
      : Array.isArray(input) ? input.reduce((n, t) => n + String((t && t.content) || '').length, 0) : 0;
    if (promptChars > MAX_PROMPT_CHARS) return res.status(413).json({ error: 'prompt_too_large' });

    let contents;
    if (typeof input === 'string') {
      const parts = [{ text: input }];
      if (Array.isArray(images)) {
        images.slice(0, MAX_IMAGES).forEach(img => {
          if (img && typeof img.data === 'string' && img.data) {
            const mime = IMAGE_MIME.test(img.mime || '') ? img.mime : 'image/jpeg';
            parts.push({ inline_data: { mime_type: mime, data: img.data } });
          }
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

    const outTokens = Math.min(32768, Math.max(1024, parseInt(maxTokens, 10) || 16384));
    const body = { contents, generationConfig: { maxOutputTokens: outTokens } };
    if (json) body.generationConfig.responseMimeType = 'application/json';

    const MODELS = GEMINI_API_KEY ? orderModels(await getModels()) : [];
    let lastErrDetail = '', lastErrStatus = 502, lastInvalidRaw = '';
    const deadline = Date.now() + 110 * 1000;   // whole request budget, so the learner never waits forever
    let aborted = false;
    req.on('close', () => { if (!res.writableEnded) aborted = true; });

    for (let i = 0; i < MODELS.length; i++) {
      if (aborted) return;
      const model = MODELS[i];
      const isLastModel = i === MODELS.length - 1;
      const left = deadline - Date.now() - (GROQ_API_KEY ? 25000 : 0);
      if (left < 8000) break;
      let upstream;
      try {
        upstream = await callModel(model, body, Math.min(left, i === 0 ? 70000 : 45000));
      } catch (e) {
        console.warn(`Gemini model ${model} request failed (${e.name}: ${e.message}), trying next...`);
        lastErrDetail = e.message || 'network error';
        demote(model, 10 * 60 * 1000);
        continue; // network hiccup / timeout — try the next model
      }

      if (!upstream.ok) {
        let detail = '';
        try { detail = (await upstream.text()).slice(0, 500); } catch (_) {}
        lastErrDetail = detail; lastErrStatus = upstream.status;
        if (upstream.status === 503 || upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) {
          demote(model, upstream.status === 404 ? 60 * 60 * 1000 : 5 * 60 * 1000);
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

      if (!json) { lastGoodModel = model; return res.json({ text }); }

      const parsed = extractJson(text);
      if (parsed !== undefined) { lastGoodModel = model; return res.json({ parsed }); }

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

// Unknown API paths get a real 404 (not the app's HTML page pretending to be a 200).
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// SPA fallback: only for page-style URLs. A missing file (anything with an extension) is a real 404,
// so a broken script link shows up as an error instead of the app's HTML being parsed as JavaScript.
app.get('*', (req, res) => {
  if (path.extname(req.path) || /(^|\/)\./.test(req.path)) return res.status(404).type('text/plain').send('Not found');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Last-resort error handler: always JSON for the API, never a stack trace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'prompt_too_large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  console.error('Unhandled error:', err && err.stack || err);
  res.status(500).json({ error: 'server_error' });
});

process.on('unhandledRejection', e => console.error('Unhandled rejection:', e && e.stack || e));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log('Maanas AI Academy server listening on ' + PORT));
// Render's load balancer keeps idle connections open longer than Node's 5 s default;
// without this, some requests randomly fail with 502 errors.
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 125 * 1000;
// Render sends SIGTERM on every deploy: finish in-flight requests, then exit cleanly.
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
