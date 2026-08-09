// Service worker do NÓS Conecta.
//
// Deliberadamente conservador: NÃO cacheia rota nem resposta de API. O app é
// todo SSR atrás de autenticação — cachear aqui daria tela desatualizada e,
// pior, risco de um usuário ver dado da sessão anterior. O SW existe por dois
// motivos: ser o pré-requisito do Web Push, e mostrar algo decente quando o
// aparelho está sem internet.

const VERSION = "v1";
const SHELL_CACHE = `nosconecta-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      // Sem skipWaiting o SW novo só assume na próxima vez que o app for
      // fechado por completo — no celular isso pode demorar dias.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Só intercepta navegação, e só para cair na página offline quando a rede
// falha. Todo o resto passa direto para a rede, sem SW no caminho.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error())),
  );
});

// ---------- push ----------

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "NÓS Conecta", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "NÓS Conecta";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Notificações do mesmo assunto se substituem em vez de empilhar: cinco
    // avisos de "mensagem nova" viram um.
    tag: payload.tag || payload.type || "nosconecta",
    renotify: Boolean(payload.tag || payload.type),
    data: { url: payload.url || "/" },
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  // Foca uma janela já aberta do app em vez de abrir outra — no celular
  // instalado, abrir uma segunda instância é desorientador.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then(() => client.navigate(target));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
