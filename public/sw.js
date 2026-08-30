const CACHE = "football-insight-shell-v4";
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/logoapp.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined)));
self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
async function networkFirst(request, timeoutMs = 7000) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetch(request, { signal: controller.signal }); if (!response.ok || response.type === "opaque") throw new Error("invalid response"); return response; } finally { clearTimeout(timeout); } }
self.addEventListener("fetch", (event) => {
  const request = event.request; if (request.method !== "GET") return;
  const url = new URL(request.url); if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") { event.respondWith(networkFirst(request).then((response) => { caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined); return response; }).catch(() => caches.match(request).then((cached) => cached || new Response("Aplikaci se nepodařilo obnovit.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })))); return; }
  const cacheable = SHELL.includes(url.pathname) || url.pathname.startsWith("/_next/static/"); if (!cacheable) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok && response.type !== "opaque") caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined); return response; })));
});
self.addEventListener("push", (event) => { let payload = {}; try { payload = event.data ? event.data.json() : {}; } catch {} event.waitUntil(self.registration.showNotification(payload.title || "Football Insight", { body: payload.body || "Nové upozornění", icon: "/icon-192.png", badge: "/icon-192.png", tag: payload.tag || "football-insight", data: { url: payload.url || "/" } })); });
self.addEventListener("notificationclick", (event) => { event.notification.close(); const target = new URL(event.notification.data?.url || "/", self.location.origin).href; event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => { for (const client of clients) if ("focus" in client) { client.navigate(target); return client.focus(); } return self.clients.openWindow(target); })); });
