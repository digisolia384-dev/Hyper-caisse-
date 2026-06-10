/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   DIGITALE SOLUTION — Service Worker v2.0               ║
 * ║   Cache-first · Offline fallback · Background sync      ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const SW_VERSION   = 'ds-v2.0';
const CACHE_STATIC = SW_VERSION + '-static';
const CACHE_FONTS  = SW_VERSION + '-fonts';
const CACHE_PAGES  = SW_VERSION + '-pages';

// Ressources mises en cache à l'installation
const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Domaines dont les ressources vont dans le cache fonts
const FONT_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Firebase CDN — mis en cache dynamiquement
const FIREBASE_DOMAIN = 'www.gstatic.com';

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install', SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_URLS))
      .then(() => self.skipWaiting())   // activation immédiate
  );
});

// ── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate', SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_FONTS && k !== CACHE_PAGES)
          .map(k => { console.log('[SW] Purge ancien cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())  // prendre le contrôle immédiatement
  );
});

// ── FETCH ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et les requêtes Chrome Extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // 1. Polices Google — Cache First (très stables)
  if (FONT_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  // 2. Firebase SDK — Cache First avec fallback réseau
  if (url.hostname === FIREBASE_DOMAIN) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // 3. API Firestore / Firebase — Réseau uniquement (toujours frais)
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com')
  ) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 4. Assets statiques locaux (.png, .js, .css, .json, .ico, .svg, .woff2)
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|otf|css|js|json)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // 5. Pages HTML — Network First avec fallback cache → offline page
  if (
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // 6. Tout le reste — Network First
  event.respondWith(networkFirst(request, CACHE_PAGES));
});

// ── STRATÉGIES ─────────────────────────────────────────────

/** Cache First : cache → réseau si absent → met en cache */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/** Network First : réseau → met en cache → fallback cache */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

/** Network First HTML : réseau → cache → fallback index.html (SPA) */
async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // Essayer le cache exact
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback SPA — toujours renvoyer index.html
    const indexFallback = await caches.match('/') || await caches.match('/index.html');
    if (indexFallback) return indexFallback;
    // Offline page minimale
    return new Response(offlinePage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/** Réseau uniquement */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (e) {
    return new Response('{"error":"offline"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ── MESSAGES (depuis l'app) ────────────────────────────────
self.addEventListener('message', event => {
  const { type, data } = event.data || {};

  switch (type) {
    // L'app demande la taille de la queue offline
    case 'GET_QUEUE_SIZE': {
      const size = _offlineQueue.length;
      event.source?.postMessage({ type: 'QUEUE_SIZE', size });
      break;
    }
    // L'app pousse la queue à sauvegarder dans le SW
    case 'SAVE_QUEUE': {
      if (Array.isArray(data)) _offlineQueue = data;
      break;
    }
    // Forcer sync
    case 'FORCE_SYNC': {
      _trySyncQueue();
      break;
    }
    // Forcer mise à jour du SW
    case 'SKIP_WAITING': {
      self.skipWaiting();
      break;
    }
  }
});

// ── BACKGROUND SYNC ────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'ds-sync-queue') {
    event.waitUntil(_trySyncQueue());
  }
});

// File d'attente offline en mémoire SW
let _offlineQueue = [];

async function _trySyncQueue() {
  if (!_offlineQueue.length) return;
  const toRetry = [..._offlineQueue];
  _offlineQueue = [];
  let synced = 0, failed = [];

  for (const item of toRetry) {
    try {
      const resp = await fetch(item.url, {
        method:  item.method || 'POST',
        headers: item.headers || { 'Content-Type': 'application/json' },
        body:    item.body
      });
      if (resp.ok) { synced++; }
      else { failed.push(item); }
    } catch (e) {
      failed.push(item);
    }
  }

  _offlineQueue = failed;

  // Notifier tous les clients
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE', synced, pending: failed.length }));
}

// ── PUSH NOTIFICATIONS (future extension) ──────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json?.() || { title: 'Digitale Solution', body: event.data.text() };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Digitale Solution', {
      body:    data.body    || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    data.url ? { url: data.url } : {}
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const existing = wins.find(w => w.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ── PAGE OFFLINE MINIMALE ──────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Hors ligne — Digitale Solution</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:sans-serif;background:#0A0E16;color:#E2E8F0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
    .logo{font-size:3rem;margin-bottom:16px}
    h1{font-size:1.4rem;font-weight:800;margin-bottom:8px;color:#E8730C}
    p{color:#64748B;font-size:.9rem;line-height:1.6;max-width:320px}
    button{margin-top:24px;background:#E8730C;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:.95rem;font-weight:700;cursor:pointer}
  </style>
</head>
<body>
  <div class="logo">🌐</div>
  <h1>Vous êtes hors ligne</h1>
  <p>Vérifiez votre connexion internet. Vos données locales sont préservées.</p>
  <button onclick="location.reload()">Réessayer</button>
</body>
</html>`;
}
