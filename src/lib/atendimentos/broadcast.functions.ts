import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * Quantos dias para trás a consulta de "quem já foi tratado" enxerga.
 *
 * Era 7. Subiu para 30 porque o envio em lotes respeita a cota diária, então
 * uma base de 800 contatos leva 4 ou 5 dias a 200/dia — e com a janela em 7
 * dias uma campanha mais longa começaria a reoferecer, no fim, gente que já
 * recebeu no começo. A janela que a tela usa continua sendo escolha da tela
 * (1, 3, 7, 15 ou 30 dias); esta é só o teto do que vem do servidor, para um
 * dado já carregado servir a qualquer escolha sem refazer a consulta.
 */
const JANELA_DIAS = 30;

export interface BroadcastAlvo {
  contactId: string;
  conversationId: string | null;
  name: string | null;
  phone: string | null;
}

export interface BroadcastResumo {
  id: string;
  /** Nome dado no disparo. Nulo nos que vieram antes do campo existir — a tela
   *  cai no trecho da mensagem, como fazia antes. */
  name: string | null;
  message: string;
  status: "running" | "done" | "cancelled";
  total: number;
  enviados: number;
  falhas: number;
  pendentes: number;
  createdAt: string;
  /** Quando a fila deve terminar, pelo ritmo gravado. */
  terminaEm: string | null;
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

/** Ritmo da fila. Espelha `supabase/functions/_shared/ritmo.ts`, que é quem
 *  aplica os limites — aqui é só o formato que atravessa a chamada. */
export interface RitmoDoDisparo {
  minSegundos: number;
  maxSegundos: number;
  pausarACada: number;
  retomarEmMinutos: number;
}

/** Um paciente que ainda precisa de contato no CRM. */
export interface AlvoAVincular {
  patientId: string;
  name: string;
  phone: string;
  conversationId: string | null;
}

async function resolverEmLote(
  ownerId: string,
  pacientes: AlvoAVincular[],
): Promise<Record<string, string>> {
  if (!pacientes.length) return {};
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/crm-contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      ownerId,
      action: "resolve-batch",
      patients: pacientes.map((p) => ({ patientId: p.patientId, name: p.name, phone: p.phone })),
    }),
    // Uma chamada só, mas ela resolve a lista inteira — merece a folga que
    // antes era gasta por contato.
    signal: AbortSignal.timeout(110_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao vincular contatos no CRM (${res.status})`);
  return (json.contatos ?? {}) as Record<string, string>;
}

/**
 * Cria a fila de disparo.
 *
 * O vínculo com o CRM acontece AQUI, numa chamada em lote — não mais no
 * navegador, uma ida por contato em série. Era isso que fazia uma seleção de
 * 200 pacientes ficar em "Enfileirando…" por minutos: cada contato tinha duas
 * tentativas de 55 segundos, e a primeira falha ainda derrubava tudo.
 *
 * Quem o CRM não conseguir vincular não derruba o disparo: sai da fila e volta
 * nomeado em `foraDoDisparo`, para a tela dizer quem ficou de fora.
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
      /** Caminho no bucket `crm-campaign-media`, não URL assinada: a fila pode
       *  levar horas até o último alvo e a assinatura expiraria no meio. */
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
/**
 * Quando a fila termina, calculado a partir do ritmo gravado no lote.
 *
 * Espelha `duracaoEstimadaMinutos` de `_shared/ritmo.ts` (Deno não é importável
 * de `src/`) e usa a MÉDIA da faixa: prometer o melhor caso e entregar o pior
 * é pior do que prometer a média. Disparo antigo, sem faixa gravada, cai no
 * `interval_seconds` único que ele de fato teve.
 */
function previsaoDeTermino(l: any): string | null {
  const total = Number(l.total ?? 0);
  if (total <= 1) return null;
  const min = Number(l.interval_min_seconds ?? l.interval_seconds ?? 8);
  const max = Number(l.interval_max_seconds ?? min);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const intervalos = total - 1;
  const pausarACada = Number(l.pause_after ?? 0);
  const pausas = pausarACada > 0 ? Math.floor(intervalos / pausarACada) : 0;
  const segundos =
    intervalos * ((min + max) / 2) + pausas * Number(l.resume_after_minutes ?? 0) * 60;
  return new Date(new Date(l.created_at).getTime() + segundos * 1000).toISOString();
}

export const listarDisparos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<BroadcastResumo[]> => {
    const supabase: any = context.supabase;
    const { data: lotes, error } = await supabase
      .from("whatsapp_broadcasts")
      .select("id, name, message, status, total, created_at, interval_min_seconds, interval_max_seconds, pause_after, resume_after_minutes")
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

export interface RecentRecipient {
  /** contact_id do CRM — bate direto com `ContatoUnificado.id` de origem "crm". */
  contactId: string;
  /** Dígitos puros, quando existia no momento do disparo — é o único jeito de
   *  reconhecer quem já recebeu entre os pacientes sem CRM: o `contact_id`
   *  gravado no disparo é o que o CRM criou na hora (via `garantirContatoCrm`),
   *  nunca o id do paciente usado na lista de seleção. */
  phone: string | null;
  /** Quando saiu, ou quando está agendado para sair se ainda está na fila. */
  sentAt: string;
  /** `true` = ainda na fila, não saiu. A pessoa conta como tratada do mesmo
   *  jeito: enfileirar já é um compromisso de envio. */
  naFila: boolean;
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
/**
 * Último disparo recebido por cada contato, sem a janela curta.
 *
 * Irmã de `getRecentRecipients`, que existe para outra pergunta — "esta pessoa
 * recebeu nos últimos dias?", para não repetir num disparo novo. Aqui a
 * pergunta é "já tentamos reativar esta pessoa desde que ela foi perdida?", e
 * a resposta pode estar a seis meses de distância.
 *
 * Teto de 12 meses para a consulta não crescer sem fim: reativação mais antiga
 * que isso não muda decisão nenhuma — a pessoa volta a ser abordável.
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

export const getRecentRecipients = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<RecentRecipient[]> => {
    const supabase: any = context.supabase;
    const since = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

    // `pending` entra junto com `sent`, e essa é a diferença que faz o envio em
    // lotes ser confiável. `sent_at` só é gravado quando a mensagem sai de
    // verdade — uma fila de 200 a cada 8 segundos leva ~27 minutos. Contando só
    // `sent`, os 200 recém-enfileirados continuariam aparecendo como "ainda não
    // receberam" durante toda a fila, e o progresso do lote diria 0 de 808
    // logo depois de enviar. Quem está na fila já está comprometido.
    const { data, error } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("contact_id, phone, sent_at, scheduled_for, status")
      .eq("owner_id", context.ownerId)
      .in("status", ["sent", "pending"])
      .or(`sent_at.gte.${since},scheduled_for.gte.${since}`);
    if (error) throw new Error(error.message);

    // Uma linha por contact_id — a mesma pessoa pode ter recebido em mais de
    // um disparo na janela; o que importa pro aviso é só o mais recente.
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
