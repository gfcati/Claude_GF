// Service worker mínimo: cacheia o app shell para a PWA abrir offline.
// Não implementa estratégias avançadas de cache de dados — isso evolui
// junto com o suporte offline do modo de execução (PRD 5, 12.4).
const CACHE_NAME = "mise-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Navegações de página (incluindo as que envolvem redirect, como
  // /auth/callback e o proxy de sessão) sempre vão direto pra rede: um
  // fetch() com redirect já seguido dentro do service worker é recusado
  // pelo Safari para respostas de navegação ("Response served by service
  // worker has redirections").
  if (event.request.method !== "GET" || event.request.mode === "navigate") {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});

// Web Push (PRD 4.6): exibe a notificação recebida do servidor.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon.svg",
      tag: payload.tag,
    }),
  );
});
