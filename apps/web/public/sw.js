const CACHE_NAME = 'budget-manager-readonly-v1';
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

self.addEventListener('install', (event) => {
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
    event.waitUntil(caches.delete(CACHE_NAME));
  }
});

function isCacheableApiGet(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return CACHEABLE_PATH_PREFIXES.some((prefix) => url.pathname.includes(prefix));
}

async function putWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', String(Date.now()));
  const body = await response.clone().arrayBuffer();
  const stamped = new Response(body, { status: response.status, statusText: response.statusText, headers });
  await cache.put(request, stamped);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheableApiGet(request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await putWithTimestamp(cache, request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (!cached) throw new Error('offline-no-cache');
        const cachedAt = Number(cached.headers.get('sw-cached-at') ?? 0);
        if (Date.now() - cachedAt > MAX_CACHE_AGE_MS) {
          return new Response(JSON.stringify({ code: 'OFFLINE_CACHE_EXPIRED', params: {} }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return cached;
      }
    })(),
  );
});
