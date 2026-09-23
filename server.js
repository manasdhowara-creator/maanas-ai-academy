/* server.js — serves the academy's static files AND proxies AI requests to Google's
   free-tier Gemini API. The Gemini API key lives ONLY here, as a server environment
   variable (GEMINI_API_KEY) — it is never sent to the browser. */
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Try the newest model first; if it's overloaded, not found, or gives back a
// broken answer, automatically fall back to the next one — the caller only
// ever sees a failure if EVERY model in this list failed.
const MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
].filter(Boolean);

const FETCH_TIMEOUT_MS = 25000;

app.get('/api/health', (req, res) => {
  res.json({ ok: !!GEMINI_API_KEY });
});

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
    if (!GEMINI_API_KEY) return res.status(503).json({ error: 'no_api_key' });

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

    // Every model in the list failed.
    if (lastInvalidRaw) {
      console.error('invalid_json from all models | last raw text:', lastInvalidRaw);
      return res.status(502).json({ error: 'invalid_json', raw: lastInvalidRaw.slice(0, 500) });
    }
    console.error('All Gemini models failed. Last status:', lastErrStatus, 'detail:', lastErrDetail);
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
