import { createServerFn } from "@tanstack/react-start";
import { exigeFinanceiro } from "@/lib/auth/area.middleware";

/**
 * Qual grupo de WhatsApp registra despesa, e o que ele já registrou.
 *
 * O id do grupo ("120363431085189966@g.us") não é uma coisa que alguém digite:
 * o WhatsApp não o mostra em lugar nenhum da tela do celular. Por isso a tela
 * LISTA os grupos que o sistema já viu, com a última mensagem e a data, e a
 * pessoa reconhece o seu. Pedir para colar o id seria pedir o impossível.
 *
 * O nome do grupo também não vem: o evento de mensagem da Evolution traz o id
 * e quem escreveu, nunca o assunto do grupo. Daí o campo `apelido`, que é só
 * para a tela — quem escreve é quem configura.
 */

export interface GrupoConhecido {
  jid: string;
  /** A última mensagem, que é como a pessoa reconhece o grupo. */
  ultimaMensagem: string | null;
  ultimaEm: string | null;
  mensagens: number;
  /** Já está cadastrado como grupo do financeiro? */
  cadastrado: boolean;
}

export interface GrupoDoFinanceiro {
  id: string;
  jid: string;
  apelido: string | null;
  unitId: string;
  unidade: string | null;
  ativo: boolean;
}

export const listarGruposConhecidos = createServerFn({ method: "GET" })
  .middleware([exigeFinanceiro])
  .handler(async ({ context }): Promise<GrupoConhecido[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;

    const { data: conversas } = await supabase
      .from("wa_conversations")
      .select("crm_conversation_id, last_message_preview, last_message_at")
      .eq("owner_id", context.ownerId)
      .like("crm_conversation_id", "%@g.us")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(60);

    const { data: cadastrados } = await supabase
      .from("financeiro_grupos")
      .select("group_jid")
      .eq("owner_id", context.ownerId);
    const jaTem = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((cadastrados ?? []) as any[]).map((g) => String(g.group_jid)),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((conversas ?? []) as any[]).map((c) => ({
      jid: String(c.crm_conversation_id),
      ultimaMensagem: c.last_message_preview ? String(c.last_message_preview).slice(0, 90) : null,
      ultimaEm: c.last_message_at ?? null,
      mensagens: 0,
      cadastrado: jaTem.has(String(c.crm_conversation_id)),
    }));
  });

export const listarGruposDoFinanceiro = createServerFn({ method: "GET" })
  .middleware([exigeFinanceiro])
  .handler(async ({ context }): Promise<GrupoDoFinanceiro[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("financeiro_grupos")
      .select("id, group_jid, apelido, unit_id, ativo, clinic_units(name)")
      .eq("owner_id", context.ownerId)
      .order("created_at");
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((g) => ({
      id: String(g.id),
      jid: String(g.group_jid),
      apelido: g.apelido ?? null,
      unitId: String(g.unit_id),
      unidade: g.clinic_units?.name ?? null,
      ativo: g.ativo !== false,
    }));
  });

export const salvarGrupoDoFinanceiro = createServerFn({ method: "POST" })
  .middleware([exigeFinanceiro])
  .inputValidator(
    (input: {
      id?: string | null;
      jid: string;
      apelido?: string | null;
      unitId: string;
      ativo?: boolean;
    }) => {
      const jid = input.jid?.trim();
      if (!jid) throw new Error("Escolha o grupo.");
      if (!jid.includes("@g.us")) throw new Error("Isso não é um grupo de WhatsApp.");
      if (!input.unitId?.trim()) throw new Error("Escolha a unidade onde a despesa vai cair.");
      return {
        id: input.id?.trim() || null,
        jid,
        apelido: input.apelido?.trim()?.slice(0, 80) || null,
        unitId: input.unitId.trim(),
        ativo: input.ativo !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const campos = {
      group_jid: data.jid,
      apelido: data.apelido,
      unit_id: data.unitId,
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabase
          .from("financeiro_grupos")
          .update(campos)
          .eq("id", data.id)
          .eq("owner_id", context.ownerId)
      : await supabase.from("financeiro_grupos").insert({ ...campos, owner_id: context.ownerId });

    if (error) {
      const { ehChaveDuplicada } = await import("@/lib/finance/erro-do-banco");
      if (ehChaveDuplicada(error)) throw new Error("Esse grupo já está cadastrado.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removerGrupoDoFinanceiro = createServerFn({ method: "POST" })
  .middleware([exigeFinanceiro])
  .inputValidator((input: { id: string }) => {
    if (!input.id?.trim()) throw new Error("Grupo inválido");
    return { id: input.id.trim() };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    // Só o cadastro sai. O histórico em `financeiro_do_grupo` fica: ele é a
    // resposta para "de onde veio esta despesa?", e apagá-lo junto deixaria
    // lançamentos órfãos sem explicação.
    const { error } = await supabase
      .from("financeiro_grupos")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface LancamentoDoGrupo {
  id: string;
  quem: string | null;
  estado: string;
  descricao: string | null;
  valor: number | null;
  quando: string | null;
}

/** O que o robô fez ultimamente — é por aqui que se confere se ele acerta. */
export const listarUltimosLancamentos = createServerFn({ method: "GET" })
  .middleware([exigeFinanceiro])
  .handler(async ({ context }): Promise<LancamentoDoGrupo[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = context.supabase;
    const { data } = await supabase
      .from("financeiro_do_grupo")
      .select("id, quem, estado, proposta, created_at")
      .eq("owner_id", context.ownerId)
      .neq("estado", "ignorado")
      .order("created_at", { ascending: false })
      .limit(20);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((l) => ({
      id: String(l.id),
      quem: l.quem ?? null,
      estado: String(l.estado),
      descricao: l.proposta?.descricao ?? null,
      valor: typeof l.proposta?.valor === "number" ? l.proposta.valor : null,
      quando: l.created_at ?? null,
    }));
  });
