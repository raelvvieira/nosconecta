/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import {
  REGRAS_CLIENTES_PADRAO,
  REGRAS_LEADS_PADRAO,
  REGRAS_PERDIDOS_PADRAO,
  classificar,
  colunasDosLeads,
  regrasOuPadrao,
  type RegraDeFunil,
} from "@/lib/atendimentos/funnelRules";
import {
  DIAS_PARA_PARADO,
  faixaDaNota,
  leituraGuardada,
  notaDoLead,
  riscoDoLead,
  type Faixa,
  type Ritmo,
  type SituacaoNaAgenda,
} from "../../../supabase/functions/_shared/inteligencia-do-lead.ts";

// O funil de Clientes.
//
// A etapa é calculada, e a regra do cálculo é configurável — por isso a
// classificação acontece AQUI e não no banco. A view devolve os sinais de cada
// paciente (a parte cara: os joins sobre consultas, planos e itens); a
// sequência de "primeira regra que casar vence" é barata e precisa ler a
// configuração da clínica.

const TABELA_AUSENTE = "42P01";

function ausente(error: any): boolean {
  return (
    !!error &&
    (error.code === TABELA_AUSENTE || /does not exist/i.test(String(error.message ?? "")))
  );
}

export interface ClienteNoFunil {
  patientId: string;
  name: string;
  phone: string | null;
  crmContactId: string | null;
  ultimaConsulta: string | null;
  stage: string;
}

export interface FunilDeClientes {
  regras: RegraDeFunil[];
  clientes: ClienteNoFunil[];
  contagem: Record<string, number>;
  /** View ainda não criada no banco. A tela avisa em vez de quebrar. */
  indisponivel: boolean;
}

/** Quantas linhas por ida ao PostgREST. O padrão dele é devolver no máximo
 *  1000 — pedir mais numa tacada não adianta, então o jeito de ver a base
 *  inteira é paginar até esgotar. */
const POR_PAGINA = 1000;

export const POR_COLUNA = 20;

function comEscopo(query: any, context: any) {
  const q = query.eq("owner_id", context.ownerId);
  return context.unitId ? q.eq("unit_id", context.unitId) : q;
}

/**
 * Todos os pacientes já classificados, com a contagem por coluna.
 *
 * Traz a base inteira de propósito: a contagem por coluna tem que ser exata, e
 * sem um CASE no banco não há como agrupar lá. São seis colunas pequenas por
 * paciente — o custo está nos joins, que continuam no SQL.
 *
 * O teto disso é da ordem de alguns milhares de pacientes. Passando muito
 * disso, volta a pedir solução no banco — e aí, com as regras já estabilizadas,
 * gerar o CASE a partir da configuração vira uma opção razoável.
 */
export const getFunilDeClientes = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<FunilDeClientes> => {
    const supabase: any = context.supabase;

    const { data: config, error: erroConfig } = await supabase
      .from("clinic_funnel_rules")
      .select("clientes")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    // Configuração ausente não é erro: significa "usar as regras de fábrica".
    const regras = regrasOuPadrao(erroConfig ? null : config?.clientes, REGRAS_CLIENTES_PADRAO);

    const linhas: any[] = [];
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await comEscopo(
        supabase
          .from("patient_funnel_signals")
          .select(
            "patient_id, name, phone, crm_contact_id, ultima_concluida, teve_consulta, consultas_concluidas, tem_orcamento_aberto, tem_tratamento_pendente, dias_sem_consulta",
          ),
        context,
      )
        // Só quem tem atendimento CONFIRMADO. A clínica redefiniu a fronteira
        // em 14/10: confirmar o atendimento é o que transforma lead em
        // cliente, e antes disso a pessoa vive no funil de Leads.
        //
        // Sem este filtro o quadro trazia as 3.268 fichas, das quais 3.227
        // nunca se consultaram — a importação antiga inteira, numa coluna
        // chamada "Novo" que ninguém abriria.
        .eq("teve_consulta", true)
        .order("name", { ascending: true })
        .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1);
      if (error) {
        if (ausente(error)) {
          return { regras, clientes: [], contagem: {}, indisponivel: true };
        }
        throw new Error(error.message);
      }
      linhas.push(...(data ?? []));
      // Página incompleta = acabou. Evita uma ida a mais só para descobrir que
      // não há nada, que é o custo de olhar só o total.
      if (!data || data.length < POR_PAGINA) break;
    }

    const contagem: Record<string, number> = {};
    for (const regra of regras) contagem[regra.id] = 0;

    const clientes: ClienteNoFunil[] = linhas.map((row) => {
      const stage = classificar(regras, {
        teveConsulta: !!row.teve_consulta,
        consultasConcluidas: Number(row.consultas_concluidas ?? 0),
        temOrcamentoAberto: !!row.tem_orcamento_aberto,
        temTratamentoPendente: !!row.tem_tratamento_pendente,
        diasSemConsulta: row.dias_sem_consulta ?? null,
      });
      contagem[stage] = (contagem[stage] ?? 0) + 1;
      return {
        patientId: String(row.patient_id),
        name: row.name ?? "",
        phone: row.phone ?? null,
        crmContactId: row.crm_contact_id ?? null,
        ultimaConsulta: row.ultima_concluida ?? null,
        stage,
      };
    });

    return { regras, clientes, contagem, indisponivel: false };
  });

/** As regras dos dois funis, para a tela de edição e para o quadro de
 *  Perdidos — que classifica no cliente, com os sinais que já tem em mãos. */
export const getRegrasDosFunis = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(
    async ({
      context,
    }): Promise<{ clientes: RegraDeFunil[]; perdidos: RegraDeFunil[]; leads: RegraDeFunil[] }> => {
      const supabase: any = context.supabase;
      const { data, error } = await supabase
        .from("clinic_funnel_rules")
        .select("clientes, perdidos, leads")
        .eq("owner_id", context.ownerId)
        .maybeSingle();
      if (error && !ausente(error)) throw new Error(error.message);
      return {
        clientes: regrasOuPadrao(data?.clientes, REGRAS_CLIENTES_PADRAO),
        perdidos: regrasOuPadrao(data?.perdidos, REGRAS_PERDIDOS_PADRAO),
        leads: regrasOuPadrao(data?.leads, REGRAS_LEADS_PADRAO),
      };
    },
  );

export const salvarRegrasDoFunil = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { funil: "clientes" | "perdidos" | "leads"; regras: RegraDeFunil[] }) => {
    if (!input.regras?.length) throw new Error("O funil precisa de ao menos uma etapa.");
    if (!input.regras.some((r) => r.ativa)) {
      throw new Error("Ao menos uma etapa precisa estar ligada — senão nenhum card teria coluna.");
    }
    for (const r of input.regras) {
      if (!r.nome?.trim()) throw new Error("Toda etapa precisa de um nome.");
      if (r.valor !== undefined && (!Number.isFinite(r.valor) || r.valor < 0)) {
        throw new Error(`O prazo de "${r.nome}" precisa ser um número de dias.`);
      }
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("clinic_funnel_rules").upsert(
      {
        owner_id: context.ownerId,
        [data.funil]: data.regras,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── O funil de Leads ────────────────────────────────────────────────────────

export interface LeadNoFunil {
  /** A forma canônica do telefone — a identidade de uma pessoa aqui. */
  fone: string;
  crmContactId: string | null;
  name: string;
  ultimaMensagem: string | null;
  diasEmSilencio: number | null;
  temAgendamento: boolean;
  stage: string;
  /** Calado há mais de `DIAS_PARA_PARADO` dias, sem horário à frente. Fica na
   *  coluna onde parou; o quadro esconde até alguém pedir. */
  parado: boolean;
  /** A nota de 0 a 100. `null` enquanto a conversa não foi lida. */
  nota: number | null;
  faixa: Faixa | null;
  /** Os motivos que mais pesaram na nota. */
  motivos: string[];
  procedimento: string | null;
  /** Em reais. */
  valor: number | null;
  valorFonte: "conversa" | "tabela" | null;
  valorAPartirDe: boolean;
  porque: string | null;
  proximaAcao: string | null;
  risco: { nivel: "alto" | "medio" | "baixo"; motivo: string | null; curto: string | null };
  /** A conversa mais recente, para abrir no chat. */
  conversationId: string | null;
}

export interface ResumoDaColuna {
  ativos: number;
  parados: number;
  /** A soma dos valores de todos (ativos e parados), em reais. */
  valor: number;
}

export interface FunilDeLeads {
  /** Na ordem do quadro (o caminho), já só as ativas. */
  colunas: RegraDeFunil[];
  regras: RegraDeFunil[];
  leads: LeadNoFunil[];
  contagem: Record<string, number>;
  resumo: Record<string, ResumoDaColuna>;
  /** Quantos leads já têm leitura da conversa. */
  lidos: number;
  /** `true` quando a view ainda não existe — migration pendente. */
  indisponivel: boolean;
}

/**
 * Todos os leads já classificados, com a contagem e o valor por coluna.
 *
 * ── O que mudou em 30/10 ────────────────────────────────────────────────
 *
 * Até aqui a coluna saía só da agenda e do tempo de silêncio. Agora sai do
 * ponto da conversa (lido pela rotina `inteligencia-do-lead`) e da agenda,
 * que vence sempre: Novo Contato → Interessado → Proposta → Horário
 * Oferecido → Agendado → Não Compareceu.
 *
 * Quem sumiu não muda de coluna: fica onde parou, marcado como parado. A
 * coluna "Esfriando" escondia em que ponto a pessoa tinha parado, que é
 * justamente o que diz quanto ela valia.
 *
 * Quem sai daqui continua saindo pelos dois caminhos explícitos: confirmar o
 * atendimento na agenda (vira cliente) ou ser desqualificado (vira perdido).
 */
export const getFunilDeLeads = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<FunilDeLeads> => {
    const supabase: any = context.supabase;

    const { data: config, error: erroConfig } = await supabase
      .from("clinic_funnel_rules")
      .select("leads")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    const regras = regrasOuPadrao(erroConfig ? null : config?.leads, REGRAS_LEADS_PADRAO);
    const colunas = colunasDosLeads(regras);
    const vazio = (indisponivel: boolean): FunilDeLeads => ({
      colunas,
      regras,
      leads: [],
      contagem: {},
      resumo: {},
      lidos: 0,
      indisponivel,
    });

    const linhas: any[] = [];
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await comEscopo(
        supabase
          .from("lead_funnel_signals")
          .select(
            "fone, crm_contact_id, name, ultima_mensagem, dias_em_silencio, tem_agendamento, teve_consulta, desqualificado, proximo_agendamento, faltou_em",
          ),
        context,
      )
        // As duas saídas do funil, aplicadas no banco: quem confirmou
        // atendimento é cliente, quem foi desqualificado é perdido.
        .eq("teve_consulta", false)
        .eq("desqualificado", false)
        .order("ultima_mensagem", { ascending: false, nullsFirst: false })
        .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1);
      if (error) {
        if (ausente(error)) return vazio(true);
        throw new Error(error.message);
      }
      linhas.push(...(data ?? []));
      if (!data || data.length < POR_PAGINA) break;
    }

    // A leitura de cada conversa. Sem ela (plano sem IA, ou ainda não lida)
    // o lead fica em Novo Contato, ou onde a agenda disser.
    const lidas = new Map<string, any>();
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await supabase
        .from("lead_inteligencia")
        .select("fone, conversation_id, leitura, ritmo")
        .eq("owner_id", context.ownerId)
        .range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1);
      if (error) {
        if (ausente(error)) break;
        throw new Error(error.message);
      }
      for (const l of data ?? []) lidas.set(String(l.fone), l);
      if (!data || data.length < POR_PAGINA) break;
    }

    const agora = new Date();
    const contagem: Record<string, number> = {};
    const resumo: Record<string, ResumoDaColuna> = {};
    for (const regra of regras) {
      contagem[regra.id] = 0;
      resumo[regra.id] = { ativos: 0, parados: 0, valor: 0 };
    }

    let lidos = 0;
    const leads: LeadNoFunil[] = linhas.map((row) => {
      const lida = lidas.get(String(row.fone));
      const leitura = leituraGuardada(lida?.leitura);
      const ritmo = (lida?.ritmo ?? null) as Ritmo | null;
      if (leitura) lidos++;

      const situacao: SituacaoNaAgenda = row.proximo_agendamento
        ? "agendado"
        : row.faltou_em
          ? "nao_compareceu"
          : null;
      const stage = classificar(regras, {
        temAgendamento: !!row.tem_agendamento,
        diasEmSilencio: row.dias_em_silencio ?? null,
        situacaoNaAgenda: situacao,
        etapaDaConversa: leitura?.etapa ?? null,
      });
      const parado =
        situacao !== "agendado" &&
        row.dias_em_silencio !== null &&
        row.dias_em_silencio !== undefined &&
        row.dias_em_silencio > DIAS_PARA_PARADO;
      const nota = leitura || ritmo ? notaDoLead(leitura, ritmo, situacao) : null;
      const valor = leitura?.valor ?? null;

      contagem[stage] = (contagem[stage] ?? 0) + 1;
      const r = (resumo[stage] ??= { ativos: 0, parados: 0, valor: 0 });
      if (parado) r.parados++;
      else r.ativos++;
      r.valor += valor ?? 0;

      return {
        fone: String(row.fone),
        crmContactId: row.crm_contact_id ?? null,
        name: row.name || "Sem nome",
        ultimaMensagem: row.ultima_mensagem ?? null,
        diasEmSilencio: row.dias_em_silencio ?? null,
        temAgendamento: !!row.tem_agendamento,
        stage,
        parado,
        nota: nota?.total ?? null,
        faixa: nota ? faixaDaNota(nota.total) : null,
        motivos: nota?.motivos ?? [],
        procedimento: leitura?.procedimentoNome ?? null,
        valor,
        valorFonte: leitura?.valorFonte ?? null,
        valorAPartirDe: leitura?.valorAPartirDe ?? false,
        porque: leitura?.porque || null,
        proximaAcao: leitura?.proximaAcao || null,
        risco: parado
          ? { nivel: "baixo", motivo: null, curto: null }
          : riscoDoLead(leitura, ritmo, situacao, agora),
        conversationId: lida?.conversation_id ?? null,
      };
    });

    // A melhor oportunidade primeiro; sem nota, pela mensagem mais recente
    // (a ordem que já veio do banco).
    leads.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));

    for (const r of Object.values(resumo)) r.valor = Math.round(r.valor * 100) / 100;
    return { colunas, regras, leads, contagem, resumo, lidos, indisponivel: false };
  });

export interface EvidenciaDoLead {
  fato: string;
  texto: string | null;
  em: string | null;
  daClinica: boolean;
}

/**
 * As provas de uma leitura: cada fato com a mensagem que o comprova. Fica
 * fora da lista do quadro para ela não carregar o texto de mil conversas.
 */
export const getEvidenciasDoLead = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { fone: string }) => {
    if (!/^\d{10,13}$/.test(String(input?.fone ?? ""))) throw new Error("Telefone inválido.");
    return input;
  })
  .handler(async ({ data, context }): Promise<EvidenciaDoLead[]> => {
    const supabase: any = context.supabase;
    const { data: lida, error } = await supabase
      .from("lead_inteligencia")
      .select("leitura")
      .eq("owner_id", context.ownerId)
      .eq("fone", data.fone)
      .maybeSingle();
    if (error) {
      if (ausente(error)) return [];
      throw new Error(error.message);
    }
    const leitura = leituraGuardada(lida?.leitura);
    if (!leitura?.evidencias.length) return [];
    const ids = leitura.evidencias.map((e) => e.mensagemId);
    const { data: msgs } = await supabase
      .from("wa_messages")
      .select("id, body, sent_at, from_me")
      .eq("owner_id", context.ownerId)
      .in("id", ids);
    const porId = new Map<string, any>((msgs ?? []).map((m: any) => [String(m.id), m]));
    return leitura.evidencias.map((e) => {
      const m = porId.get(e.mensagemId);
      return {
        fato: e.fato,
        texto: m ? String(m.body ?? "").slice(0, 400) : null,
        em: m?.sent_at ?? null,
        daClinica: !!m?.from_me,
      };
    });
  });
