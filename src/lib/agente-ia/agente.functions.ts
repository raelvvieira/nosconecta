import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { CAMPOS_DO_MANUAL, type ManualDeVendas } from "./manual";

export type { ManualDeVendas };

export interface EstadoDoAgente {
  agenteId: string;
  nome: string;
  ligado: boolean;
  etapasDeVitoria: string[];
  /** Aprender com conversas marcadas como Ganho. Ligado por padrão. */
  aprenderDeGanhos: boolean;
  /** Quantas vendas sustentam o manual hoje. */
  vendas: number;
  /** De onde vieram — responde "aprendeu com o quê?". */
  porFonte: { ganho: number; etapa: number };
  /** Menos de três vendas: o manual existe, mas generaliza demais. */
  confiavel: boolean;
  faltam: number;
  /** A chave da IA está configurada? Só isso — nunca o valor. */
  temChave: boolean;
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
      aprenderDeGanhos: a.learn_from_won !== false,
      vendas: Number(json.vendas ?? 0),
      porFonte: {
        ganho: Number(json.porFonte?.ganho ?? 0),
        etapa: Number(json.porFonte?.etapa ?? 0),
      },
      confiavel: !!json.confiavel,
      faltam: Number(json.faltam ?? 0),
      temChave: !!json.temChave,
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
  .inputValidator(
    (input: {
      nome?: string;
      ligado?: boolean;
      etapasDeVitoria?: string[];
      aprenderDeGanhos?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.nome !== undefined) campos.name = data.nome.trim() || "Assistente da NÓS";
    if (data.ligado !== undefined) campos.enabled = data.ligado;
    if (data.etapasDeVitoria !== undefined) campos.winning_stage_ids = data.etapasDeVitoria;
    if (data.aprenderDeGanhos !== undefined) campos.learn_from_won = data.aprenderDeGanhos;

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

// ── Atendimento ────────────────────────────────────────────────────────────

export interface RegraDeComportamento {
  id: string;
  tipo: "inatividade" | "transferencia" | "contato" | "pipeline";
  ativa: boolean;
  instrucao: string;
  aposMinutos: number | null;
  acao: "cutucar" | "encerrar" | null;
  etapaId: string | null;
}

export interface ConfigDeAtendimento {
  modo: "eco" | "ia";
  mensagemEco: string;
  debounceSegundos: number;
  segmentar: boolean;
  limite: number;
  minimo: number;
  msPorCaractere: number;
  /** Disjuntor aberto até quando, se estiver. */
  circuitoAbertoAte: string | null;
  regras: RegraDeComportamento[];
}

export const getAtendimento = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ConfigDeAtendimento> => {
    const supabase: any = context.supabase;
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agente) throw new Error("O agente ainda não existe. Abra a página do agente uma vez.");

    const { data: regras } = await supabase
      .from("ai_agent_rules")
      .select("*")
      .eq("agent_id", agente.id)
      .order("kind");

    return {
      modo: agente.mode === "ia" ? "ia" : "eco",
      mensagemEco: agente.echo_message ?? "",
      debounceSegundos: Number(agente.debounce_seconds ?? 5),
      segmentar: agente.segment_enabled !== false,
      limite: Number(agente.segment_limit ?? 300),
      minimo: Number(agente.segment_min_size ?? 50),
      msPorCaractere: Number(agente.delay_per_character ?? 50),
      circuitoAbertoAte: agente.circuit_open_until ?? null,
      regras: (regras ?? []).map((r: any) => ({
        id: String(r.id),
        tipo: r.kind,
        ativa: !!r.active,
        instrucao: r.instruction ?? "",
        aposMinutos: r.after_minutes ?? null,
        acao: r.action ?? null,
        etapaId: r.stage_id ?? null,
      })),
    };
  });

export const salvarAtendimento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      modo?: "eco" | "ia";
      mensagemEco?: string;
      debounceSegundos?: number;
      segmentar?: boolean;
      limite?: number;
      minimo?: number;
      msPorCaractere?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.modo !== undefined) campos.mode = data.modo;
    if (data.mensagemEco !== undefined) campos.echo_message = data.mensagemEco.trim();
    if (data.debounceSegundos !== undefined) campos.debounce_seconds = data.debounceSegundos;
    if (data.segmentar !== undefined) campos.segment_enabled = data.segmentar;
    if (data.limite !== undefined) campos.segment_limit = data.limite;
    if (data.minimo !== undefined) campos.segment_min_size = data.minimo;
    if (data.msPorCaractere !== undefined) campos.delay_per_character = data.msPorCaractere;

    const { error } = await supabase.from("ai_agents").update(campos).eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Cria ou atualiza uma regra de comportamento.
 *
 * Toda regra nasce DESLIGADA — a tela liga depois, num gesto separado. Vale
 * para todas e especialmente para `pipeline`: um agente que move card sozinho
 * gera a própria matéria-prima de aprendizado, e ligar isso sem querer é o tipo
 * de coisa que só se descobre semanas depois, quando o manual já aprendeu com
 * os próprios enganos.
 */
export const salvarRegra = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      id?: string;
      tipo: "inatividade" | "transferencia" | "contato" | "pipeline";
      ativa?: boolean;
      instrucao?: string;
      aposMinutos?: number | null;
      acao?: "cutucar" | "encerrar" | null;
      etapaId?: string | null;
    }) => {
      if (input.tipo === "inatividade" && input.id === undefined) {
        if (!input.aposMinutos || !input.acao) {
          throw new Error("Regra de inatividade precisa de minutos e do que fazer.");
        }
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agente) throw new Error("O agente ainda não existe.");

    const linha: Record<string, unknown> = {
      owner_id: context.ownerId,
      agent_id: agente.id,
      kind: data.tipo,
      updated_at: new Date().toISOString(),
    };
    if (data.ativa !== undefined) linha.active = data.ativa;
    if (data.instrucao !== undefined) linha.instruction = data.instrucao.trim();
    if (data.aposMinutos !== undefined) linha.after_minutes = data.aposMinutos;
    if (data.acao !== undefined) linha.action = data.acao;
    if (data.etapaId !== undefined) linha.stage_id = data.etapaId;

    if (data.id) {
      const { error } = await supabase.from("ai_agent_rules").update(linha).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("ai_agent_rules").insert(linha);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const excluirRegra = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("ai_agent_rules")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Roda o atendimento com uma mensagem de mentira. Nada sai para paciente
 *  nenhum — é o que torna isto testável antes do registro no CRM. */
export const simularAtendimento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { texto: string }) => {
    if (!input.texto?.trim()) throw new Error("Escreva uma mensagem para simular.");
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      respondeu: boolean;
      motivo?: string;
      enviados: { texto: string; esperaMs: number }[];
    }> => {
      const json = await chamar({
        ownerId: context.ownerId,
        action: "simular",
        texto: data.texto,
      });
      return {
        respondeu: !!json.respondeu,
        motivo: json.motivo ?? undefined,
        enviados: json.enviados ?? [],
      };
    },
  );

/** Devolve a conversa para a IA depois de um humano ter assumido. */
export const devolverParaIa = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { sessionId: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("ai_agent_sessions")
      .update({ human_took_over_at: null, updated_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Painel ─────────────────────────────────────────────────────────────────

export interface PainelDoFunil {
  ganhos: number;
  perdidos: number;
  emNegociacao: number;
  /** Ganhos ÷ (ganhos + perdidos). Nulo enquanto não houver desfecho nenhum. */
  conversao: number | null;
  valorGanho: number;
  /** Os motivos de perda mais frequentes, do maior para o menor. */
  motivosDePerda: { motivo: string; quantos: number }[];
}

/**
 * O retrato do funil, calculado sem IA nenhuma.
 *
 * É contagem e aritmética sobre `pipeline_deals`, que é local. Não chama
 * modelo e não vai ao CRM: um painel que custa uma chamada de IA por abertura
 * de página é um painel que ninguém deixa aberto.
 */
export const getPainelDoFunil = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<PainelDoFunil> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("pipeline_deals")
      .select("status, value, loss_reason")
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);

    const linhas = data ?? [];
    const ganhos = linhas.filter((d: any) => d.status === "won");
    const perdidos = linhas.filter((d: any) => d.status === "lost");

    const porMotivo = new Map<string, number>();
    for (const p of perdidos) {
      const m = String(p.loss_reason ?? "").trim();
      if (!m) continue;
      porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
    }

    const desfechos = ganhos.length + perdidos.length;
    return {
      ganhos: ganhos.length,
      perdidos: perdidos.length,
      emNegociacao: linhas.filter((d: any) => d.status === "negotiating").length,
      // Nulo, não zero: sem desfecho nenhum a taxa não existe, e mostrar 0%
      // faria parecer que a clínica não fecha nada.
      conversao: desfechos > 0 ? ganhos.length / desfechos : null,
      valorGanho: ganhos.reduce((s: number, d: any) => s + Number(d.value ?? 0), 0),
      motivosDePerda: [...porMotivo.entries()]
        .map(([motivo, quantos]) => ({ motivo, quantos }))
        .sort((a, b) => b.quantos - a.quantos)
        .slice(0, 4),
    };
  });
