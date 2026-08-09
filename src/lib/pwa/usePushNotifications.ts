import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deletePushSubscription,
  getVapidPublicKey,
  savePushSubscription,
} from "@/lib/notifications/push.functions";
import { isIos, isStandalone } from "@/lib/pwa/service-worker";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

// Retorno tipado sobre ArrayBuffer concreto: `new Uint8Array(n)` infere
// ArrayBufferLike, que inclui SharedArrayBuffer e não serve como
// applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToBase64url(key: ArrayBuffer | null): string {
  if (!key) return "";
  const bytes = new Uint8Array(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function usePushNotifications() {
  const queryClient = useQueryClient();
  const fetchVapid = useServerFn(getVapidPublicKey);
  const saveSubscription = useServerFn(savePushSubscription);
  const removeSubscription = useServerFn(deletePushSubscription);

  const [permission, setPermission] = useState<PushPermission>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const vapid = useQuery({
    queryKey: ["vapid-public-key"],
    queryFn: () => fetchVapid(),
    staleTime: Infinity,
  });

  // No iPhone, push só existe com o app adicionado à tela de início — no
  // Safari comum a API nem aparece. Isso não é erro, é o sistema.
  const needsInstallFirst = isIos() && !isStandalone();

  const refreshState = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermission);
    const registration = await navigator.serviceWorker.getRegistration();
    const existing = await registration?.pushManager.getSubscription();
    setSubscribed(Boolean(existing));
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const subscribe = useCallback(async () => {
    if (!vapid.data) {
      toast.error("As chaves de notificação ainda não foram configuradas no servidor.");
      return;
    }
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== "granted") {
        toast.error(
          result === "denied"
            ? "Permissão negada. Libere as notificações nos ajustes do navegador."
            : "Permissão não concedida.",
        );
        return;
      }

      // `ready` em vez de `getRegistration`: garante que o service worker
      // está ativo, senão o pushManager pode não existir ainda.
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Push silencioso não é permitido nos navegadores atuais; toda
        // mensagem precisa virar notificação visível.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.data),
      });

      const json = subscription.toJSON();
      await saveSubscription({
        data: {
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? keyToBase64url(subscription.getKey("p256dh")),
          auth: json.keys?.auth ?? keyToBase64url(subscription.getKey("auth")),
          userAgent: navigator.userAgent,
        },
      });

      setSubscribed(true);
      queryClient.invalidateQueries({ queryKey: ["push-devices"] });
      toast.success("Notificações ativadas neste aparelho.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [vapid.data, saveSubscription, queryClient]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removeSubscription({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      queryClient.invalidateQueries({ queryKey: ["push-devices"] });
      toast.success("Notificações desativadas neste aparelho.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [removeSubscription, queryClient]);

  return {
    permission,
    subscribed,
    busy,
    needsInstallFirst,
    hasServerKeys: Boolean(vapid.data),
    subscribe,
    unsubscribe,
    refreshState,
  };
}
