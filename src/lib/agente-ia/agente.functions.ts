import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { CAMPOS_DO_MANUAL, type ManualDeVendas } from "./manual";

export type { ManualDeVendas };

export interface EstadoDoAgente {
  agenteId: string;
  nome: string;
  ligado: boolean;
  etapasDeVitoria: string[];
  /** Quantas vendas sustentam o manual hoje. */
  vendas: number;
  /** Menos de três vendas: o manual existe, mas generaliza demais. */
  confiavel: boolean;
  faltam: number;
  aprendido: ManualDeVendas;
  correcoes: ManualDeVendas;
  aprendidoEm: string | null;
  /** Por que a última rodada não aprendeu. Nulo quando aprendeu. */
  ultimoMotivo: string | null;
}

async function chamar(body: unknown): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/ai-playbook`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
    // O ciclo lê várias conversas no CRM e ainda chama o modelo. Tempo curto
    // aqui viraria "erro" numa rodada que ia terminar.
    signal: AbortSignal.timeout(230_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar ai-playbook (${res.status})`);
  return json;
}

export const getEstadoDoAgente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<EstadoDoAgente> => {
    const json = await chamar({ ownerId: context.ownerId, action: "estado" });
    const a = json.agente ?? {};
    const p = json.playbook ?? {};
    return {
      agenteId: String(a.id ?? ""),
      nome: a.name ?? "Assistente da NÓS",
      ligado: !!a.enabled,
      etapasDeVitoria: Array.isArray(a.winning_stage_ids) ? a.winning_stage_ids.map(String) : [],
      vendas: Number(json.vendas ?? 0),
      confiavel: !!json.confiavel,
      faltam: Number(json.faltam ?? 0),
      aprendido: (p.learned ?? {}) as ManualDeVendas,
      correcoes: (p.overrides ?? {}) as ManualDeVendas,
      aprendidoEm: p.last_learned_at ?? null,
      ultimoMotivo: p.last_skip_reason ?? null,
    };
  });

/**
 * A instrução exata que o agente recebe.
 *
 * Vem do servidor de propósito. As regras de repasse para humano moram em
 * `_shared/instrucao-do-agente.ts` e não são espelhadas aqui: uma cópia no
 * navegador poderia divergir e a tela mostraria regras de segurança que não são
 * as que estão valendo.
 */
export const getInstrucaoDoAgente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<string> => {
    const json = await chamar({ ownerId: context.ownerId, action: "instrucao" });
    return String(json.instrucao ?? "");
  });

/** Roda o ciclo agora: coleta vendas novas e reconstrói o manual. */
export const aprenderAgora = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ novas: number; aprendeu: boolean; motivo?: string }> => {
    const json = await chamar({ ownerId: context.ownerId, action: "ciclo" });
    return {
      novas: Number(json.novas ?? 0),
      aprendeu: !!json.aprendeu,
      motivo: json.motivo ?? undefined,
    };
  });

export const salvarConfiguracaoDoAgente = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { nome?: string; ligado?: boolean; etapasDeVitoria?: string[] }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.nome !== undefined) campos.name = data.nome.trim() || "Assistente da NÓS";
    if (data.ligado !== undefined) campos.enabled = data.ligado;
    if (data.etapasDeVitoria !== undefined) campos.winning_stage_ids = data.etapasDeVitoria;

    const { error } = await supabase.from("ai_agents").update(campos).eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Grava uma correção humana.
 *
 * Escreve em `overrides`, NUNCA em `learned`. É o que faz a correção sobreviver
 * ao próximo reaprendizado — que reescreve `learned` inteiro.
 *
 * Campo apagado sai do objeto em vez de virar string vazia: vazio significaria
 * "corrigi para nada", e a leitura passaria a mostrar um buraco no lugar do que
 * a IA aprendeu.
 */
export const salvarCorrecao = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { campo: string; valor: string }) => {
    if (!CAMPOS_DO_MANUAL.includes(input.campo as never)) {
      throw new Error(`Campo desconhecido: ${input.campo}`);
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: atual, error: erroLeitura } = await supabase
      .from("ai_sales_playbooks")
      .select("id, overrides")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    if (!atual) throw new Error("O manual ainda não existe. Abra a página do agente uma vez.");

    const overrides = { ...(atual.overrides ?? {}) };
    const valor = data.valor.trim();
    if (valor) overrides[data.campo] = valor;
    else delete overrides[data.campo];

    const { error } = await supabase
      .from("ai_sales_playbooks")
      .update({ overrides, updated_at: new Date().toISOString() })
      .eq("id", atual.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── O recorte do catálogo ──────────────────────────────────────────────────

export interface ProcedimentoDoCatalogo {
  id: string;
  nome: string;
  preco: number;
  duracaoMinutos: number;
  categoria: string | null;
  /** O agente pode citar e precificar este? */
  liberado: boolean;
}

/**
 * O catálogo da clínica com a marcação do que o agente pode citar.
 *
 * NÃO existe tabela de produtos própria do agente: o catálogo é
 * `clinic_procedures`, o mesmo que a Agenda e o Financeiro usam. Duas listas de
 * preço divergiriam, e um preço errado dito a um paciente é o pior defeito
 * possível num negócio de serviço.
 */
export const getProcedimentosDoAgente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ProcedimentoDoCatalogo[]> => {
    const supabase: any = context.supabase;
    const [{ data: procedimentos, error }, { data: escolhidos }] = await Promise.all([
      supabase
        .from("clinic_procedures")
        .select("id, name, price, duration_minutes, category")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("name"),
      supabase.from("ai_agent_procedures").select("procedure_id").eq("owner_id", context.ownerId),
    ]);
    if (error) throw new Error(error.message);

    const liberados = new Set((escolhidos ?? []).map((e: any) => String(e.procedure_id)));
    return (procedimentos ?? []).map((p: any) => ({
      id: String(p.id),
      nome: p.name,
      preco: Number(p.price ?? 0),
      duracaoMinutos: Number(p.duration_minutes ?? 0),
      categoria: p.category ?? null,
      liberado: liberados.has(String(p.id)),
    }));
  });

export const alternarProcedimentoDoAgente = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { procedureId: string; liberado: boolean }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agente) throw new Error("O agente ainda não existe. Abra a página do agente uma vez.");

    if (data.liberado) {
      const { error } = await supabase
        .from("ai_agent_procedures")
        .insert({ owner_id: context.ownerId, agent_id: agente.id, procedure_id: data.procedureId });
      // 23505 = já estava liberado. Dois cliques rápidos no mesmo item não são
      // erro, são dois cliques rápidos.
      if (error && error.code !== "23505") throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("ai_agent_procedures")
        .delete()
        .eq("agent_id", agente.id)
        .eq("procedure_id", data.procedureId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
