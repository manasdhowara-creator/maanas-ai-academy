/* sw.js — makes the academy load instantly and work offline.
   Strategy: "stale-while-revalidate" for the app's own files. A returning learner gets the app
   from the local cache immediately (even if Render's free server is asleep or they have no
   internet), while a fresh copy is fetched in the background for next time. /api/* is never
   cached — AI and email always go to the live server. Bump VERSION to force a full refresh. */
const VERSION = 'maa-v2';
const SHELL = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png',
  '/js/core.js', '/js/store.js', '/js/ai.js', '/js/mastery.js', '/js/revision.js', '/js/quiz.js',
  '/js/pack.js', '/js/source.js', '/js/video.js', '/js/email.js', '/js/lesson.js', '/js/coach.js',
  '/js/research.js', '/js/coding.js', '/js/exam.js', '/js/labs.js', '/js/views.js', '/js/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
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
  if (url.origin !== self.location.origin) return;                 // fonts / CDN: let the browser handle them
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname === '/sw.js') return;

  // Every page navigation is the same single-page app shell.
  const key = req.mode === 'navigate' ? '/index.html' : req;

  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(key);
      const network = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }   // instant, refresh in background
      const res = await network;
      return res || new Response('You are offline and this page has not been saved yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })
  );
});
