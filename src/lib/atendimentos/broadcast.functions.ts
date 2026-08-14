import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

export interface BroadcastAlvo {
  contactId: string;
  conversationId: string | null;
  name: string | null;
  phone: string | null;
}

export interface BroadcastResumo {
  id: string;
  message: string;
  status: "running" | "done" | "cancelled";
  total: number;
  enviados: number;
  falhas: number;
  pendentes: number;
  createdAt: string;
}

async function callBroadcast(body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/whatsapp-broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar whatsapp-broadcast (${res.status})`);
  return json;
}

export const criarDisparo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: { message: string; intervalSeconds: number; targets: BroadcastAlvo[] }) => {
      if (!input.message?.trim()) throw new Error("Escreva a mensagem antes de disparar.");
      if (!input.targets?.length) throw new Error("Selecione ao menos um contato.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const json = await callBroadcast({
      ownerId: context.ownerId,
      action: "create",
      message: data.message,
      intervalSeconds: data.intervalSeconds,
      targets: data.targets,
    });
    return {
      broadcastId: String(json.broadcastId),
      total: Number(json.total ?? 0),
      terminaEm: String(json.terminaEm ?? ""),
    };
  });

export const cancelarDisparo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { broadcastId: string }) => input)
  .handler(async ({ data, context }) => {
    await callBroadcast({ ownerId: context.ownerId, action: "cancel", broadcastId: data.broadcastId });
    return { ok: true };
  });

/**
 * Os disparos recentes e como cada um foi.
 *
 * Lido direto do banco pela RLS do dono, sem passar pela Edge Function: são
 * tabelas nossas, e o `select` já é permitido só para quem é dono.
 */
export const listarDisparos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<BroadcastResumo[]> => {
    const supabase: any = context.supabase;
    const { data: lotes, error } = await supabase
      .from("whatsapp_broadcasts")
      .select("id, message, status, total, created_at")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    if (!lotes?.length) return [];

    const { data: alvos } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("broadcast_id, status")
      .eq("owner_id", context.ownerId)
      .in("broadcast_id", lotes.map((l: any) => l.id));

    const contar = (id: string, status: string) =>
      (alvos ?? []).filter((a: any) => a.broadcast_id === id && a.status === status).length;

    return lotes.map((l: any) => ({
      id: String(l.id),
      message: l.message,
      status: l.status,
      total: Number(l.total ?? 0),
      enviados: contar(l.id, "sent"),
      falhas: contar(l.id, "failed"),
      pendentes: contar(l.id, "pending"),
      createdAt: l.created_at,
    }));
  });
