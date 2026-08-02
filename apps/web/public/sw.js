const CACHE_NAME = 'budget-manager-readonly-v2';
const DB_NAME = 'budget-manager-sw';
const KEY_STORE = 'crypto-keys';
const KEY_ID = 'offline-cache-key';
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Read-only offline cache (ADR-0008): only these GET routes are cached — never a write. */
const CACHEABLE_PATH_PREFIXES = [
  '/accounts',
  '/transactions',
  '/categories',
  '/budgets/current',
  '/budgets',
  '/debts',
  '/goals',
  '/reports/dashboard',
];

function openKeyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Data at rest in Cache Storage is encrypted with AES-GCM. The key is generated
 * non-extractable and persisted as a CryptoKey object in IndexedDB (never as raw
 * bytes reachable from JS) — losing the IndexedDB entry (purge) makes any leftover
 * ciphertext permanently unreadable, which is the intended effect of a cache purge.
 */
async function getOrCreateKey() {
  const db = await openKeyDb();
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readonly');
    const req = tx.objectStore(KEY_STORE).get(KEY_ID);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    tx.objectStore(KEY_STORE).put(key, KEY_ID);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  return key;
}

async function deleteKey() {
  const db = await openKeyDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    tx.objectStore(KEY_STORE).delete(KEY_ID);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

async function encryptBody(buffer) {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
  const out = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), iv.byteLength);
  return out.buffer;
}

async function decryptBody(buffer) {
  const key = await getOrCreateKey();
  const bytes = new Uint8Array(buffer);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'purge-cache') {
    event.waitUntil(Promise.all([caches.delete(CACHE_NAME), deleteKey()]));
  }
});

function isCacheableApiGet(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return CACHEABLE_PATH_PREFIXES.some((prefix) => url.pathname.includes(prefix));
}

async function putEncrypted(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', String(Date.now()));
  const plain = await response.clone().arrayBuffer();
  const encrypted = await encryptBody(plain);
  const stamped = new Response(encrypted, { status: response.status, statusText: response.statusText, headers });
  await cache.put(request, stamped);
}

async function readDecrypted(cached) {
  const cachedAt = Number(cached.headers.get('sw-cached-at') ?? 0);
  if (Date.now() - cachedAt > MAX_CACHE_AGE_MS) return null;
  const encrypted = await cached.arrayBuffer();
  try {
    const plain = await decryptBody(encrypted);
    return new Response(plain, { status: cached.status, statusText: cached.statusText, headers: cached.headers });
  } catch {
    // Key was purged (e.g. PIN lockout) but the ciphertext entry lingered — treat as absent.
    return null;
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192x192.png' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheableApiGet(request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await putEncrypted(cache, request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (!cached) throw new Error('offline-no-cache');
        const decrypted = await readDecrypted(cached);
        if (!decrypted) {
          return new Response(JSON.stringify({ code: 'OFFLINE_CACHE_EXPIRED', params: {} }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return decrypted;
      }
    })(),
  );
});
