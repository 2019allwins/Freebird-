/**
 * FreeBird service worker — v1.
 * - Offline shell: cache-first for the app shell (HTML/JS/CSS), so the app
 *   opens instantly and survives flaky connections.
 * - Push handler: ready for Web Push. Displaying a notification requires the
 *   subscription + server-side VAPID sender (see README). The handler below
 *   is complete; only the subscription step in src/lib/push.ts needs VAPID keys.
 */

const CACHE = "freebird-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// App shell: cache-first. API/data calls: network (never cache Supabase).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  // Never cache backend or placeholder-image traffic; only our own shell.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
    )
  );
});

// --- Web Push (infrastructure ready) ---
self.addEventListener("push", (event) => {
  let payload = { title: "FreeBird", body: "You have a new notification 💛" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => "focus" in c);
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      })
  );
});
