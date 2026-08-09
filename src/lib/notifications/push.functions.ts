import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PushType = "whatsapp_message" | "daily_agenda" | "appointment_reply" | "deal_result";

export const PUSH_TYPE_LABEL: Record<PushType, { title: string; description: string }> = {
  whatsapp_message: {
    title: "Mensagem nova no WhatsApp",
    description: "Quando um paciente manda mensagem e ninguém está com o chat aberto.",
  },
  daily_agenda: {
    title: "Agenda do dia",
    description: "Resumo dos atendimentos de hoje, toda manhã.",
  },
  appointment_reply: {
    title: "Paciente confirmou ou pediu para remarcar",
    description: "Quando chega resposta à confirmação enviada pelo WhatsApp.",
  },
  deal_result: {
    title: "Negociação ganha e pagamento recebido",
    description: "Quando uma negociação é fechada ou entra dinheiro.",
  },
};

export const PUSH_TYPES = Object.keys(PUSH_TYPE_LABEL) as PushType[];

export interface PushPreferences {
  whatsapp_message: boolean;
  daily_agenda: boolean;
  appointment_reply: boolean;
  deal_result: boolean;
}

export interface PushDevice {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

async function callEdgeFunction(name: string, body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar ${name} (${res.status})`);
  return json;
}

/**
 * A chave pública VAPID precisa chegar ao navegador para ele criar a
 * inscrição. Vem por server function em vez de VITE_*: assim ela fica junto
 * dos outros segredos no painel, e não exige rebuild para trocar.
 */
export const getVapidPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<string | null> => process.env.VAPID_PUBLIC_KEY ?? null);

export const getPushPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushPreferences> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("push_preferences")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Sem linha = nunca configurou = tudo ligado, igual ao default da tabela.
    return {
      whatsapp_message: data?.whatsapp_message ?? true,
      daily_agenda: data?.daily_agenda ?? true,
      appointment_reply: data?.appointment_reply ?? true,
      deal_result: data?.deal_result ?? true,
    };
  });

export const savePushPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<PushPreferences>) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("push_preferences").upsert(
      { owner_id: context.userId, ...data, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPushDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushDevice[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_agent, created_at, last_seen_at")
      .eq("owner_id", context.userId)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      userAgent: row.user_agent ?? null,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    }));
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => {
      if (!input.endpoint || !input.p256dh || !input.auth) {
        throw new Error("Inscrição de push incompleta.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // onConflict no endpoint: reativar o push no mesmo aparelho reaproveita
    // a linha em vez de duplicar.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        owner_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; endpoint?: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    let query = supabase.from("push_subscriptions").delete().eq("owner_id", context.userId);
    if (data.id) query = query.eq("id", data.id);
    else if (data.endpoint) query = query.eq("endpoint", data.endpoint);
    else throw new Error("Informe o aparelho a remover.");
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await callEdgeFunction("push-send", { ownerId: context.userId, action: "test" });
    return { ok: true };
  });
