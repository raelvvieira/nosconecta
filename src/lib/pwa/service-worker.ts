// Registro do service worker. Só no cliente, e só em contexto seguro —
// service worker exige HTTPS (localhost conta como seguro).

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  // Depois do load: registrar durante o carregamento inicial disputa banda
  // com o que a tela precisa para aparecer.
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("[pwa] falha ao registrar o service worker:", error);
    });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/** true quando o app está rodando instalado, não numa aba do navegador. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS não implementa display-mode: standalone; usa esta propriedade
    // própria do Safari.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS se apresenta como Mac; o toque é o que o denuncia.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
