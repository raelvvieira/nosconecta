/* eslint-disable @typescript-eslint/no-explicit-any */
// `any` no client do Supabase, como em `funis.functions.ts` e
// `deals.functions.ts`: `src/integrations/supabase/types.ts` é gerado pelo
// Lovable e não pode ser editado à mão, então tabela criada por migration
// nossa ainda não existe para o TypeScript até o Lovable regerar o arquivo.
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { chaveDaPessoa, type CardDoFunil } from "./funil";

/**
 * O funil de Leads.
 *
 * ── O que isto era ──────────────────────────────────────────────────────
 *
 * Uma casca fina sobre a Edge Function `crm-pipeline`, que falava com
 * `/api/v1/pipelines/{id}/pipeline_stages` e `/pipeline_items` na conta do CRM
 * externo. Tinha duas tentativas e 55 segundos de espera porque "o CRM às
 * vezes demora demais", e um formato de resposta que o comentário do próprio
 * arquivo admitia nunca ter sido confirmado com dados reais.
 *
 * Agora são duas tabelas nossas. Some junto a tela de "Criar o pipeline": não
 * há mais entidade nenhuma a criar do outro lado — o funil existe, e começa
 * sem etapa, que a clínica cria na tela.
 *
 * Os outros dois funis nunca passaram por aqui: "Clientes" é calculado em
 * `funis.functions.ts` e "Perdidos" em `QuadroDePerdidos.tsx`.
 */

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

/** Um card. A identidade mora em `funil.ts` — ver lá por que ela é o telefone. */
export type PipelineItem = CardDoFunil;

interface LinhaDeCard {
  id: string;
  stage_id: string;
  phone: string | null;
  conversation_id: string | null;
  title: string | null;
}

function mapStage(row: {
  id: string;
  name: string | null;
  position: number | null;
  color: string | null;
}): PipelineStage {
  return {
    id: String(row.id),
    name: row.name ?? "Sem nome",
    position: row.position ?? 0,
    color: row.color ?? null,
  };
}

function mapItem(row: LinhaDeCard): PipelineItem {
  // O telefone manda. Card sem número é de grupo, ou de contato que o WhatsApp
  // só identifica por lid — esses continuam presos à conversa.
  const porTelefone = !!row.phone;
  return {
    id: String(row.id),
    type: porTelefone ? "pessoa" : "conversa",
    itemId: porTelefone ? row.phone! : (row.conversation_id ?? ""),
    stageId: String(row.stage_id),
    title: row.title ?? null,
  };
}

export const getPipelineStages = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ stages: PipelineStage[] }> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("funnel_stages")
      .select("id, name, position, color")
      .eq("owner_id", context.ownerId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return { stages: (data ?? []).map(mapStage) };
  });

export const getPipelineItems = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ items: PipelineItem[] }> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("funnel_cards")
      .select("id, stage_id, phone, conversation_id, title")
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { items: (data ?? []).map(mapItem) };
  });

export const savePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id?: string; name: string; position?: number; color?: string }) => {
    if (!input.name?.trim()) throw new Error("A etapa precisa de um nome.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    // Só o que veio é escrito.
    //
    // Renomear manda apenas `{ id, name }` — a tela não reenvia posição nem
    // cor. Gravar `position: data.position ?? 0` mandaria a etapa renomeada
    // para o começo do funil e apagaria a cor dela, e quem renomeou veria as
    // colunas trocarem de lugar sozinhas sem entender por quê.
    const linha: Record<string, unknown> = {
      name: data.name.trim(),
      updated_at: new Date().toISOString(),
    };
    if (data.position !== undefined) linha.position = data.position;
    if (data.color !== undefined) linha.color = data.color;

    if (data.id) {
      const { error } = await supabase
        .from("funnel_stages")
        .update(linha)
        .eq("id", data.id)
        .eq("owner_id", context.ownerId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabase
      .from("funnel_stages")
      .insert({ owner_id: context.ownerId, ...linha });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    // Contar ANTES de apagar, e recusar em vez de arrastar gente junto.
    //
    // Quem clica em excluir está pensando na coluna; as pessoas dentro dela
    // não estavam na conta. O banco também recusaria (a referência é
    // RESTRICT), mas a mensagem dele não diz quantas pessoas há ali nem o que
    // fazer — e a tela mostraria um erro de banco cru.
    const { count, error: erroDaContagem } = await supabase
      .from("funnel_cards")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.ownerId)
      .eq("stage_id", data.id);
    if (erroDaContagem) throw new Error(erroDaContagem.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        count === 1
          ? "Esta etapa tem 1 pessoa. Arraste-a para outra coluna antes de excluir."
          : `Esta etapa tem ${count} pessoas. Arraste-as para outra coluna antes de excluir.`,
      );
    }

    const { error } = await supabase
      .from("funnel_stages")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPipelineStages = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { orderedIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // Em paralelo, como já era: são N escritas independentes, e esperar uma
    // pela outra deixava a reordenação lenta com muitas colunas.
    const erros = await Promise.all(
      data.orderedIds.map(async (id, i) => {
        const { error } = await supabase
          .from("funnel_stages")
          .update({ position: i, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("owner_id", context.ownerId);
        return error;
      }),
    );
    const falha = erros.find(Boolean);
    if (falha) throw new Error(falha.message);
    return { ok: true };
  });

export const addPipelineItem = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      stageId: string;
      /** Id da conversa de onde a pessoa está sendo posta no funil. */
      conversaId?: string | null;
      telefone?: string | null;
      /** O jid, guardado para referência — não é a identidade. */
      contatoId?: string | null;
      patientId?: string | null;
      title?: string | null;
    }) => {
      if (!input.stageId?.trim()) throw new Error("Escolha a etapa.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    // Sem telefone e sem conversa não há como reencontrar este card depois —
    // ele nasceria invisível, ocupando uma coluna e sem casar com ninguém.
    const chave = chaveDaPessoa({ conversaId: data.conversaId, telefone: data.telefone });
    if (!chave) {
      throw new Error("Esta conversa não tem número nem identificação para entrar no funil.");
    }

    const supabase: any = context.supabase;
    // `upsert` e não `insert`: os índices únicos garantem uma pessoa por card,
    // e dois cliques seguidos no mesmo botão não podem virar erro na cara de
    // quem só quis mover alguém de etapa.
    const { error } = await supabase.from("funnel_cards").upsert(
      {
        owner_id: context.ownerId,
        stage_id: data.stageId,
        phone: chave.type === "pessoa" ? chave.itemId : null,
        conversation_id: data.conversaId ?? null,
        contact_id: data.contatoId ?? null,
        patient_id: data.patientId ?? null,
        title: data.title ?? null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: chave.type === "pessoa" ? "owner_id,phone" : "owner_id,conversation_id",
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const movePipelineItem = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { itemId: string; newStageId: string; notes?: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    const { data: cartao, error } = await supabase
      .from("funnel_cards")
      .update({ stage_id: data.newStageId, updated_at: new Date().toISOString() })
      .eq("id", data.itemId)
      .eq("owner_id", context.ownerId)
      .select("id, phone, contact_id, patient_id, title")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cartao) throw new Error("Este card não existe mais no funil.");

    // Entra na linha do tempo da negociação junto com observações e trocas
    // de status, para o histórico do card contar a história inteira.
    await supabase.from("pipeline_deal_events").insert({
      owner_id: context.ownerId,
      item_id: data.itemId,
      kind: "stage",
      body: data.notes?.trim() || null,
      meta: { stageId: data.newStageId },
    });

    // O paciente, quando o card sabe quem é — e ele passou a saber.
    //
    // Antes daqui só saía o contato do CRM, e a Meta tinha de chegar ao
    // paciente por `patients.crm_contact_id`. Quem não tivesse esse vínculo
    // preenchido ia para a Meta com o hash do nome e mais nada, e a conversão
    // não casava com ninguém. O `resolvePerson` prefere o `patientId`, que é
    // de onde saem telefone e e-mail.
    const pessoa = {
      patientId: cartao.patient_id ?? null,
      crmContactId: cartao.contact_id ?? null,
      contactName: cartao.title ?? null,
    };

    // Mudança de etapa é o evento que representa "Ganho"/"Perdido" para a
    // Meta — qual etapa significa o quê é escolha da clínica, configurada em
    // Configurações › Integrações.
    const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
    await dispatchMetaCapiEvent(context.ownerId, "pipeline.stage_changed", {
      entityId: `${data.itemId}:${data.newStageId}`,
      stageId: data.newStageId,
      ...pessoa,
    });
    const { dispatchAutomationEvent } = await import("@/lib/atendimentos/automations.server");
    await dispatchAutomationEvent(context.ownerId, "pipeline.stage_changed", {
      entityId: `${data.itemId}:${data.newStageId}`,
      // Id "limpo" do card, separado do entityId composto: sem ele as ações
      // que agem sobre o card (observação) não têm em que agir.
      itemId: data.itemId,
      stageId: data.newStageId,
      ...pessoa,
    });
    return { ok: true };
  });
