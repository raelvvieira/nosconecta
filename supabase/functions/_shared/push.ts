// Envio de push para os aparelhos de uma clínica, respeitando as
// preferências por tipo.
//
// Fica em _shared (e não dentro de push-send) porque o cron de conversas
// também precisa enviar — e importar de uma function que tem `Deno.serve` no
// topo subiria um segundo servidor junto.
import { sendPush, type PushSubscriptionRecord } from "./webpush.ts";

const PREFERENCE_COLUMN = {
  whatsapp_message: "whatsapp_message",
  daily_agenda: "daily_agenda",
  appointment_reply: "appointment_reply",
  deal_result: "deal_result",
  // Push disparado por uma automação personalizada. Tipo próprio, e não
  // reaproveitando um dos quatro acima, pra que a preferência de
  // "resultado de negociação" não controle silenciosamente algo que a
  // clínica configurou noutro lugar.
  automation: "automation",
} as const;

export type PushType = keyof typeof PREFERENCE_COLUMN;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidConfig(): VapidConfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@nosconecta.app";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

async function wantsType(supabase: any, ownerId: string, type: PushType): Promise<boolean> {
  const { data } = await supabase
    .from("push_preferences")
    .select(PREFERENCE_COLUMN[type])
    .eq("owner_id", ownerId)
    .maybeSingle();
  // Sem linha = nunca configurou = recebe tudo, que é o mesmo default da
  // tabela. Os dois caminhos concordam.
  if (!data) return true;
  return (data as Record<string, boolean>)[PREFERENCE_COLUMN[type]] !== false;
}

export interface PushNotification {
  title: string;
  body: string;
  url?: string;
}

export async function pushToOwner(
  supabase: any,
  ownerId: string,
  type: PushType,
  notification: PushNotification,
) {
  const vapid = vapidConfig();
  if (!vapid) return { ok: true, skipped: "VAPID não configurado", sent: 0 };

  if (!(await wantsType(supabase, ownerId, type))) {
    return { ok: true, skipped: "tipo desativado pela clínica", sent: 0 };
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  if (!subscriptions?.length) return { ok: true, skipped: "nenhum aparelho inscrito", sent: 0 };

  const payload = {
    title: notification.title,
    body: notification.body,
    url: notification.url ?? "/",
    type,
    tag: type,
  };

  const results = await Promise.all(
    subscriptions.map(async (row: any) => {
      const subscription: PushSubscriptionRecord = {
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      };
      const result = await sendPush(subscription, payload, vapid);

      // 404/410 = o navegador está dizendo que esse aparelho não existe mais
      // (app desinstalado, dados limpos). Sem apagar, a tabela vira lixo e
      // cada envio fica mais lento.
      if (result.gone) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      } else if (result.ok) {
        await supabase
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", row.id);
      }
      return result;
    }),
  );

  return {
    ok: true,
    sent: results.filter((r) => r.ok).length,
    total: results.length,
    removed: results.filter((r) => r.gone).length,
  };
}
