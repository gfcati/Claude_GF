// Service worker mínimo: cacheia o app shell para a PWA abrir offline.
// Não implementa estratégias avançadas de cache de dados — isso evolui
// junto com o suporte offline do modo de execução (PRD 5, 12.4).
//
// "/" NUNCA entra no precache: é a página navegável, e o WebKit do iOS nem
// sempre marca o request do app aberto pela tela de início como
// `mode: "navigate"` (fetch events soltos por relançamentos do app), então
// ele podia cair no cache-first abaixo e servir o HTML/JS de uma versão
// antiga do build indefinidamente — só o banco (chamadas ao Supabase)
// continuava atualizado, dando a impressão de "app travado na versão
// anterior". Bump o CACHE_NAME a cada mudança aqui para forçar os clientes
// já instalados a descartar esse cache antigo.
const CACHE_NAME = "mise-shell-v2";
const APP_SHELL = ["/manifest.webmanifest", "/icons/icon.svg"];

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
  // worker has redirections"). Checa `destination` além de `mode` porque
  // versões do WebKit no iOS nem sempre marcam `mode: "navigate"` no fetch
  // de abertura do app pela tela de início.
  if (
    event.request.method !== "GET" ||
    event.request.mode === "navigate" ||
    event.request.destination === "document"
  ) {
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
