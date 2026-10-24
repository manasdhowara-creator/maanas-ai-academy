/* sw.js — instant loads + offline support, with SAFE updates.
   All app files of one version are downloaded together into one cache (atomic: if any file fails,
   the update is retried later and the old version keeps working). Files are always served from the
   same version's cache, so a learner can never get a broken mix of old and new code. When a new
   version is ready, the page reloads itself once (see app.js). /api/* is never cached: logins, data
   sync and AI always go to the live server. Bump VERSION on every release. */
const VERSION = 'maa-v6-2026-10-24';
const SHELL = [
  '/', '/styles.css', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png',
  '/js/core.js', '/js/store.js', '/js/auth.js', '/js/ai.js', '/js/mastery.js', '/js/revision.js', '/js/quiz.js',
  '/js/pack.js', '/js/source.js', '/js/video.js', '/js/email.js', '/js/lesson.js', '/js/coach.js',
  '/js/research.js', '/js/coding.js', '/js/exam.js', '/js/labs.js', '/js/views.js', '/js/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // fonts / CDN: browser handles them
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname === '/sw.js') return;

  const key = req.mode === 'navigate' ? '/' : url.pathname;          // every page is the same app shell
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const hit = await cache.match(key);
      if (hit) return hit;
      try { return await fetch(req); }
      catch (_) { return new Response('You are offline and this page has not been saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
    })
  );
});
