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

export interface RecentRecipient {
  /** contact_id do CRM — bate direto com `ContatoUnificado.id` de origem "crm". */
  contactId: string;
  /** Dígitos puros, quando existia no momento do disparo — é o único jeito de
   *  reconhecer quem já recebeu entre os pacientes sem CRM: o `contact_id`
   *  gravado no disparo é o que o CRM criou na hora (via `garantirContatoCrm`),
   *  nunca o id do paciente usado na lista de seleção. */
  phone: string | null;
  sentAt: string;
}

/**
 * Quem recebeu algum disparo recente (últimos 7 dias, fixo) — a base para o
 * aviso e o filtro de "já recebeu" na seleção de contatos de uma nova
 * campanha (`ContactsTab.tsx`). Busca uma janela larga de propósito: o
 * recorte de quantos dias contam como "recente" é escolha da tela, não do
 * servidor, então um dado já carregado serve pra qualquer janela até 7 dias
 * sem precisar refazer a consulta.
 *
 * Só enxerga o motor de fila própria (`whatsapp_broadcast_targets`) — o
 * caminho "Todos os contatos" (CRM) não grava quem recebeu, então não tem
 * como entrar nesta conta.
 */
export const getRecentRecipients = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<RecentRecipient[]> => {
    const supabase: any = context.supabase;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("contact_id, phone, sent_at")
      .eq("owner_id", context.ownerId)
      .eq("status", "sent")
      .gte("sent_at", since);
    if (error) throw new Error(error.message);

    // Uma linha por contact_id — a mesma pessoa pode ter recebido em mais de
    // um disparo na janela; o que importa pro aviso é só o envio mais recente.
    const porContato = new Map<string, RecentRecipient>();
    for (const row of (data ?? []) as any[]) {
      const atual = porContato.get(row.contact_id);
      if (!atual || row.sent_at > atual.sentAt) {
        porContato.set(row.contact_id, {
          contactId: String(row.contact_id),
          phone: row.phone ?? null,
          sentAt: row.sent_at,
        });
      }
    }
    return [...porContato.values()];
  });
