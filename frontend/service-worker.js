const CACHE_NAME = "aai-erp-v4";
const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/js/main.js?v=20260311",
  "/js/app-core.js",
  "/js/auth.js",
  "/js/students.js",
  "/js/attendance.js",
  "/js/fees.js",
  "/js/tests.js",
  "/js/chatbot.js",
  "/js/pdf.js",
  "/js/admissions.js",
  "/js/content.js",
  "/js/leads.js",
  "/js/reports.js",
  "/js/activity.js",
  "/js/parent.js",
  "/js/ui.js",
  "/js/errors.js",
  "/manifest.json",
  "/assets/favicon.svg",
  "/assets/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/login")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});
