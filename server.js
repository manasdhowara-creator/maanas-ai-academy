/* server.js — serves the academy's static files AND proxies AI requests to Google's
   free-tier Gemini API. The Gemini API key lives ONLY here, as a server environment
   variable (GEMINI_API_KEY) — it is never sent to the browser. */
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

app.get('/api/health', (req, res) => {
  res.json({ ok: !!GEMINI_API_KEY });
});

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

    const body = { contents };
    if (json) body.generationConfig = { responseMimeType: 'application/json' };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : (upstream.status === 400 ? 400 : 502);
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 500); } catch (_) {}
      console.error('Gemini upstream error', upstream.status, detail);
      return res.status(status).json({ error: 'upstream_error', status: upstream.status });
    }

    const data = await upstream.json();
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts || []).map(p => p.text || '').join('');

    if (!text) return res.status(502).json({ error: 'empty_completion' });

    if (json) {
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) {
        const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} }
      }
      if (parsed === undefined) return res.status(502).json({ error: 'invalid_json', raw: text.slice(0, 500) });
      return res.json({ parsed });
    }
    return res.json({ text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// SPA fallback for hash-routed pages
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Maanas AI Academy server listening on ' + PORT));
