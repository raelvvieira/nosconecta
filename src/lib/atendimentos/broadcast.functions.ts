import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import {
  JANELA_DIAS,
  callBroadcast,
  previsaoDeTermino,
  resolverEmLote,
  type AlvoAVincular,
} from "./broadcast.server";
import type {
  BroadcastAlvo,
  BroadcastResumo,
  RecentRecipient,
  RitmoDoDisparo,
} from "./broadcast.types";

/**
 * Só declarações de server function moram aqui: o divisor de server functions
 * apaga os irmãos de módulo, e ajudante definido neste arquivo vira
 * `ReferenceError` em tempo de execução. O runtime está em `broadcast.server.ts`.
 */

export type { AlvoAVincular };
export type { BroadcastAlvo, BroadcastResumo, RecentRecipient, RitmoDoDisparo };

/**
 * Cria a fila de disparo. O vínculo com o CRM acontece aqui, numa chamada em
 * lote. Quem o CRM não conseguir vincular não derruba o disparo: volta nomeado
 * em `foraDoDisparo`.
 */
export const criarDisparo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      message: string;
      name?: string | null;
      ritmo: RitmoDoDisparo;
      /** Contatos que já têm id no CRM. */
      prontos: BroadcastAlvo[];
      /** Pacientes que precisam de vínculo — resolvidos aqui, em lote. */
      aVincular: AlvoAVincular[];
      /** Caminho no bucket `crm-campaign-media`, não URL assinada. */
      mediaPath?: string | null;
    }) => {
      if (!input.message?.trim()) throw new Error("Escreva a mensagem antes de disparar.");
      if (!input.prontos?.length && !input.aVincular?.length) {
        throw new Error("Selecione ao menos um contato.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const mapa = await resolverEmLote(context.ownerId, data.aVincular ?? []);

    const foraDoDisparo: { nome: string; motivo: string }[] = [];
    const vinculados: BroadcastAlvo[] = [];
    for (const p of data.aVincular ?? []) {
      const contactId = mapa[p.patientId];
      if (!contactId) {
        foraDoDisparo.push({ nome: p.name, motivo: "não pôde ser vinculado ao CRM." });
        continue;
      }
      vinculados.push({
        contactId,
        conversationId: p.conversationId,
        name: p.name,
        phone: p.phone,
      });
    }

    const targets = [...(data.prontos ?? []), ...vinculados];
    if (!targets.length) {
      throw new Error("Nenhum dos contatos selecionados pôde ser vinculado ao CRM.");
    }

    const json = await callBroadcast({
      ownerId: context.ownerId,
      action: "create",
      message: data.message,
      name: data.name?.trim() || null,
      ritmo: data.ritmo,
      mediaPath: data.mediaPath ?? null,
      targets,
    });
    return {
      broadcastId: String(json.broadcastId),
      total: Number(json.total ?? 0),
      terminaEm: String(json.terminaEm ?? ""),
      foraDoDisparo,
    };
  });

/**
 * Vincula um bloco de pacientes ao CRM e devolve o mapa `patientId -> contactId`.
 *
 * A tela chama isto em blocos para poder mostrar o vínculo andando: numa
 * seleção de 200, "Vinculando contatos ao CRM" sem número é indistinguível de
 * travado. Quem o CRM não resolver simplesmente não aparece no mapa.
 */
export const vincularAlvos = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { aVincular: AlvoAVincular[] }) => input)
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    return resolverEmLote(context.ownerId, data.aVincular ?? []);
  });

/** Um destinatário que não recebeu, com o motivo registrado pela fila. */
export interface FalhaDeDisparo {
  contactId: string;
  nome: string | null;
  phone: string | null;
  conversationId: string | null;
  erro: string | null;
}

/**
 * Os destinatários que falharam num disparo — nome, telefone e o erro que a
 * fila gravou. É o que permite reenviar só para eles.
 */
export const listarFalhasDoDisparo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { broadcastId: string }) => input)
  .handler(async ({ data, context }): Promise<FalhaDeDisparo[]> => {
    const supabase: any = context.supabase;
    const { data: linhas, error } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("contact_id, contact_name, phone, conversation_id, error, media_skipped_reason")
      .eq("owner_id", context.ownerId)
      .eq("broadcast_id", data.broadcastId)
      .eq("status", "failed")
      .limit(500);
    if (error) throw new Error(error.message);
    return (linhas ?? []).map((l: any) => ({
      contactId: String(l.contact_id),
      nome: l.contact_name ?? null,
      phone: l.phone ?? null,
      conversationId: l.conversation_id ?? null,
      erro: l.error ?? l.media_skipped_reason ?? null,
    }));
  });

export const cancelarDisparo = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { broadcastId: string }) => input)
  .handler(async ({ data, context }) => {
    await callBroadcast({
      ownerId: context.ownerId,
      action: "cancel",
      broadcastId: data.broadcastId,
    });
    return { ok: true };
  });

/**
 * Os disparos recentes e como cada um foi — lido direto do banco pela RLS do
 * dono, sem passar pela Edge Function.
 */
export const listarDisparos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<BroadcastResumo[]> => {
    const supabase: any = context.supabase;
    const { data: lotes, error } = await supabase
      .from("whatsapp_broadcasts")
      // `*` e não a lista de colunas: `name` e as de ritmo vieram de migrations
      // recentes, e pedi-las por nome faria a página de Campanhas inteira falhar.
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    if (!lotes?.length) return [];

    const { data: alvos } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("broadcast_id, status")
      .eq("owner_id", context.ownerId)
      .in(
        "broadcast_id",
        lotes.map((l: any) => l.id),
      );

    const contar = (id: string, status: string) =>
      (alvos ?? []).filter((a: any) => a.broadcast_id === id && a.status === status).length;

    return lotes.map((l: any) => ({
      id: String(l.id),
      name: l.name ?? null,
      message: l.message,
      status: l.status,
      total: Number(l.total ?? 0),
      enviados: contar(l.id, "sent"),
      falhas: contar(l.id, "failed"),
      pendentes: contar(l.id, "pending"),
      createdAt: l.created_at,
      terminaEm: previsaoDeTermino(l),
    }));
  });

/**
 * Último disparo recebido por cada contato, sem a janela curta — responde
 * "já tentamos reativar esta pessoa?". Teto de 12 meses.
 */
export const getUltimoDisparoPorContato = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<Record<string, string>> => {
    const supabase: any = context.supabase;
    const desde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("contact_id, sent_at")
      .eq("owner_id", context.ownerId)
      .eq("status", "sent")
      .gte("sent_at", desde);
    if (error) throw new Error(error.message);

    const ultimo: Record<string, string> = {};
    for (const row of (data ?? []) as any[]) {
      const id = String(row.contact_id);
      if (!ultimo[id] || row.sent_at > ultimo[id]) ultimo[id] = row.sent_at;
    }
    return ultimo;
  });

/**
 * Quem recebeu algum disparo recente — base para o aviso e o filtro de "já
 * recebeu" na seleção de contatos. `pending` conta junto com `sent`: quem está
 * na fila já está comprometido.
 */
export const getRecentRecipients = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<RecentRecipient[]> => {
    const supabase: any = context.supabase;
    const since = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("contact_id, phone, sent_at, scheduled_for, status")
      .eq("owner_id", context.ownerId)
      .in("status", ["sent", "pending"])
      .or(`sent_at.gte.${since},scheduled_for.gte.${since}`);
    if (error) throw new Error(error.message);

    // Uma linha por contact_id — só o disparo mais recente importa.
    const porContato = new Map<string, RecentRecipient>();
    for (const row of (data ?? []) as any[]) {
      const quando: string = row.sent_at ?? row.scheduled_for;
      if (!quando) continue;
      const atual = porContato.get(row.contact_id);
      if (!atual || quando > atual.sentAt) {
        porContato.set(row.contact_id, {
          contactId: String(row.contact_id),
          phone: row.phone ?? null,
          sentAt: quando,
          naFila: row.status === "pending",
        });
      }
    }
    return [...porContato.values()];
  });
