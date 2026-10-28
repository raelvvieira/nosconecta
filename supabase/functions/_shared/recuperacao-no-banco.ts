// O Recovery Engine falando com o banco: nascer, cancelar e ler o que a
// decisão pura precisa. A decisão em si mora em `recuperacao.ts`.
//
// Quem chama:
//   - `atendimento.ts`, quando a Luna responde (nasce uma sequência) e quando
//     chega mensagem da pessoa ou da equipe (cancela na hora);
//   - `agente-followup`, a rodada de cada minuto, que executa as etapas.
import {
  normalizarConfig,
  novaSequencia,
  partesLocais,
  planejarSequencia,
  trilhaDaSequencia,
  type ConfigDeRecuperacao,
  type EstadoDaSequencia,
  type EtapaPlanejada,
  type Mecanismo,
} from "./recuperacao.ts";

// deno-lint-ignore no-explicit-any
type Supabase = any;

/** Os dias da semana em que o consultório atende (0 = domingo). */
export async function diasAbertos(supabase: Supabase, ownerId: string): Promise<number[]> {
  const { data } = await supabase
    .from("clinic_business_hours")
    .select("weekday, modo")
    .eq("owner_id", ownerId);
  const dias = new Set<number>();
  for (const j of (data ?? []) as { weekday: number; modo: string }[]) {
    if (j.modo !== "sob_consulta") dias.add(Number(j.weekday));
  }
  return [...dias];
}

/** A configuração do agente, ou `null` com o motor desligado. */
export function configDoAgente(agente: { recovery_config?: unknown }): ConfigDeRecuperacao | null {
  const c = normalizarConfig(agente?.recovery_config ?? null);
  return c?.ligado ? c : null;
}

/**
 * Cancela a sequência em andamento desta conversa, se houver.
 *
 * Só toca sequência ativa ou enviando: uma encerrada pela despedida continua
 * encerrada, com o motivo dela. Nunca levanta: quem chama é o atendimento, e
 * uma falha aqui não pode deixar a pessoa sem resposta. A rodada confere de
 * novo antes de enviar, então o pior caso de uma falha é a conferência pegar.
 */
export async function cancelarRecuperacao(
  supabase: Supabase,
  sessionId: string,
  motivo: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase
      .from("ai_agent_sessions")
      .update({
        recovery_status: "cancelada",
        recovery_motivo: motivo,
        recovery_proximo_em: null,
        recovery_enviando_desde: null,
        ...extras,
      })
      .eq("id", sessionId)
      .in("recovery_status", ["ativa", "enviando"]);
    if (error) console.warn("[recuperacao] não cancelou:", error.message);
    if (Object.keys(extras).length) {
      // `nao_contatar_em` e afins valem mesmo sem sequência ativa.
      await supabase.from("ai_agent_sessions").update(extras).eq("id", sessionId);
    }
  } catch (e) {
    console.warn("[recuperacao] não cancelou:", e instanceof Error ? e.message : e);
  }
}

/** As colunas da sequência, a partir do estado. */
export function colunasDoEstado(e: EstadoDaSequencia): Record<string, unknown> {
  const proxima = e.status === "ativa" || e.status === "enviando" ? e.plano[e.passo] : null;
  return {
    recovery_status: e.status,
    recovery_passo: e.passo,
    recovery_plano: e.plano,
    recovery_mecanismos: e.mecanismos,
    recovery_tentativas: e.tentativas,
    recovery_enviando_desde: e.enviandoDesde,
    recovery_motivo: e.motivo,
    recovery_proximo_em: proxima?.venceEm ?? null,
  };
}

/** O estado, a partir das colunas. */
export function estadoDaSessao(s: Record<string, unknown>): EstadoDaSequencia | null {
  const status = s.recovery_status as EstadoDaSequencia["status"] | null;
  if (!status) return null;
  return {
    status,
    passo: Number(s.recovery_passo ?? 0),
    plano: (Array.isArray(s.recovery_plano) ? s.recovery_plano : []) as EtapaPlanejada[],
    mecanismos: (Array.isArray(s.recovery_mecanismos) ? s.recovery_mecanismos : []) as Mecanismo[],
    tentativas: Number(s.recovery_tentativas ?? 0),
    enviandoDesde: (s.recovery_enviando_desde as string | null) ?? null,
    motivo: (s.recovery_motivo as string | null) ?? null,
  };
}

/**
 * A Luna acabou de responder: a sequência anterior acaba e nasce a nova, com
 * o calendário contado a partir desta resposta.
 *
 * Não nasce nada com o motor desligado, na trilha STOP, ou quando a trilha não
 * tem etapa que caiba (por exemplo, retorno combinado sem data). Nunca
 * levanta, pelo mesmo motivo do cancelamento.
 */
export async function iniciarRecuperacao(
  supabase: Supabase,
  p: {
    agente: { recovery_config?: unknown };
    ownerId: string;
    sessionId: string;
    origem: Date;
    primeiraRespostaDaLuna: boolean;
    rotulo: string;
    perguntaAberta: string;
    retornoCombinado: string;
    ultimaMensagemDaPessoa: string | null;
  },
): Promise<void> {
  try {
    const config = configDoAgente(p.agente);
    if (!config) return;
    if (config.ligadoDesde && p.origem < new Date(config.ligadoDesde)) return;

    const { trilha, retornoEm } = trilhaDaSequencia({
      primeiraRespostaDaLuna: p.primeiraRespostaDaLuna,
      rotulo: p.rotulo,
      retornoCombinado: p.retornoCombinado,
      ultimaMensagemDaPessoa: p.ultimaMensagemDaPessoa,
      hoje: partesLocais(p.origem, config.fuso).data,
    });

    const base = {
      recovery_trilha: trilha,
      recovery_intensidade: config.trilhas[trilha].intensidade,
      recovery_origem_em: p.origem.toISOString(),
      recovery_pergunta_aberta: p.perguntaAberta || null,
      retorno_combinado_em: retornoEm,
    };

    if (trilha === "STOP") {
      await supabase
        .from("ai_agent_sessions")
        .update({
          ...base,
          recovery_status: "cancelada",
          recovery_motivo: "pediu para não receber mensagens",
          recovery_proximo_em: null,
          nao_contatar_em: p.origem.toISOString(),
        })
        .eq("id", p.sessionId);
      return;
    }

    const plano = planejarSequencia({
      origem: p.origem,
      trilha: config.trilhas[trilha],
      config,
      diasAbertos: await diasAbertos(supabase, p.ownerId),
      retornoEm,
    });
    const estado = novaSequencia(plano);
    await supabase
      .from("ai_agent_sessions")
      .update(
        estado
          ? { ...base, ...colunasDoEstado(estado) }
          : {
              ...base,
              recovery_status: "encerrada",
              recovery_motivo: "a trilha não tem etapa para esta conversa",
              recovery_plano: [],
              recovery_passo: 0,
              recovery_proximo_em: null,
              recovery_mecanismos: [],
            },
      )
      .eq("id", p.sessionId);
  } catch (e) {
    console.warn("[recuperacao] sequência não nasceu:", e instanceof Error ? e.message : e);
  }
}
