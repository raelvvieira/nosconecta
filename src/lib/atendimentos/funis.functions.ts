/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import {
  REGRAS_CLIENTES_PADRAO,
  REGRAS_LEADS_PADRAO,
  REGRAS_PERDIDOS_PADRAO,
  classificar,
  regrasOuPadrao,
  type RegraDeFunil,
} from "@/lib/atendimentos/funnelRules";

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
  .handler(async ({ context }): Promise<{ clientes: RegraDeFunil[]; perdidos: RegraDeFunil[] }> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("clinic_funnel_rules")
      .select("clientes, perdidos")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error && !ausente(error)) throw new Error(error.message);
    return {
      clientes: regrasOuPadrao(data?.clientes, REGRAS_CLIENTES_PADRAO),
      perdidos: regrasOuPadrao(data?.perdidos, REGRAS_PERDIDOS_PADRAO),
    };
  });

export const salvarRegrasDoFunil = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { funil: "clientes" | "perdidos"; regras: RegraDeFunil[] }) => {
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
}

export interface FunilDeLeads {
  regras: RegraDeFunil[];
  leads: LeadNoFunil[];
  contagem: Record<string, number>;
  /** `true` quando a view ainda não existe — migration pendente. */
  indisponivel: boolean;
}

/**
 * Todos os leads já classificados, com a contagem por coluna.
 *
 * ── O que mudou em 14/10 ────────────────────────────────────────────────
 *
 * Antes o quadro de Leads era alimentado À MÃO, card a card, pela tela de
 * conversas — e tinha ZERO linhas. Um funil que depende de alguém lembrar de
 * alimentá-lo não é um funil.
 *
 * A clínica definiu a regra: lead é quem **chamou no WhatsApp** e ainda não
 * tem **atendimento confirmado**. Agendar não basta, porque agendar não é vir.
 *
 * Quem sai daqui sai por dois caminhos, e os dois são explícitos: confirmar o
 * atendimento na agenda (vira cliente) ou ser marcado como desqualificado
 * (vira perdido). Silêncio NÃO tira ninguém — quem sumiu continua aqui, numa
 * coluna fria, ao alcance de uma campanha de recuperação. Era a alternativa
 * que mais limpava a lista e a que mais escondia gente.
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

    const linhas: any[] = [];
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await comEscopo(
        supabase
          .from("lead_funnel_signals")
          .select(
            "fone, crm_contact_id, name, ultima_mensagem, dias_em_silencio, tem_agendamento, teve_consulta, desqualificado",
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
        if (ausente(error)) return { regras, leads: [], contagem: {}, indisponivel: true };
        throw new Error(error.message);
      }
      linhas.push(...(data ?? []));
      if (!data || data.length < POR_PAGINA) break;
    }

    const contagem: Record<string, number> = {};
    for (const regra of regras) contagem[regra.id] = 0;

    const leads: LeadNoFunil[] = linhas.map((row) => {
      const stage = classificar(regras, {
        temAgendamento: !!row.tem_agendamento,
        diasEmSilencio: row.dias_em_silencio ?? null,
      });
      contagem[stage] = (contagem[stage] ?? 0) + 1;
      return {
        fone: String(row.fone),
        crmContactId: row.crm_contact_id ?? null,
        name: row.name || "Sem nome",
        ultimaMensagem: row.ultima_mensagem ?? null,
        diasEmSilencio: row.dias_em_silencio ?? null,
        temAgendamento: !!row.tem_agendamento,
        stage,
      };
    });

    return { regras, leads, contagem, indisponivel: false };
  });
