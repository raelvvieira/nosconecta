/* eslint-disable @typescript-eslint/no-explicit-any */
import { clinicTodayStr } from "@/lib/date";
import { montarDre } from "@/lib/finance/dre";
import { lerCategorias, lerLancamentos } from "@/lib/finance/dre.functions";
import { somarMeses } from "@/lib/finance/mes";
import { lerFichaDoSite, recursosDaFicha } from "@/lib/plataforma/recursos";
import {
  diasDoMes,
  margemEmPct,
  minutosAgendados,
  minutosDeCapacidade,
  novosERecorrentes,
  ocupacaoEmPct,
  primeiroAtendimento,
  taxaDePerdidos,
  ticketMedio,
  variacao,
  type AtendimentoDoPainel,
  type UnidadeParaCapacidade,
  type Variacao,
} from "@/lib/gestao/indicadores";

// O painel de Gestão, lido do banco. As contas moram em `indicadores.ts`; a
// receita e o resultado vêm da MESMA DRE do Financeiro (`dre.functions.ts`,
// regime de competência) — dois números diferentes para "lucro" em duas telas
// é o jeito mais rápido de ninguém confiar em nenhuma.
//
// Só o administrador chama (`exigeGestao`).

export interface PontoDaEvolucao {
  mes: string;
  receita: number;
  resultado: number;
  /** Em %. Nula sem receita. */
  margem: number | null;
}

export interface UnidadeNoPainel {
  id: string;
  nome: string;
  receita: number;
  resultado: number;
  atendimentos: number;
  ticketMedio: number | null;
  ocupacao: number | null;
}

export interface VisaoDeGestao {
  mes: string;
  mesAnterior: string;
  /** O mês escolhido ainda não acabou: os números do dia 1 ao dia de hoje. */
  mesEmAndamento: boolean;
  unidades: { id: string; nome: string }[];
  unidadeSelecionada: string | null;
  resumo: {
    receita: Variacao;
    resultado: Variacao;
    /** Em %; a variação é em pontos percentuais (`deltaAbs`). */
    margem: Variacao;
    novosPacientes: Variacao;
    /** Em %. Nula quando o horário de funcionamento não está cadastrado. */
    ocupacao: Variacao;
  };
  caixa: {
    total: number;
    /** `false` quando todas as contas estão com saldo zero: ninguém informou. */
    informado: boolean;
  };
  operacao: {
    atendimentos: Variacao;
    ticketMedio: Variacao;
    /** Faltas e cancelamentos, em %. */
    perdidos: Variacao;
    horasAgendadas: number;
    horasDisponiveis: number;
  };
  pacientes: {
    novos: number;
    recorrentes: number;
    receitaNovos: number;
    receitaRecorrentes: number;
    /** Nulo onde o consultório não tem o Club. */
    club: { indicadas: number; confirmadas: number } | null;
  };
  evolucao: PontoDaEvolucao[];
  /** Só com todas as unidades à vista e mais de uma ativa. */
  porUnidade: UnidadeNoPainel[];
  avisos: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const fimDoMes = (mes: string) => `${mes}-${pad(diasDoMes(mes))}`;

/** Lê todas as linhas de uma consulta, de mil em mil (teto do PostgREST). */
async function lerTudo(montar: (de: number, ate: number) => any): Promise<any[]> {
  const linhas: any[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await montar(pagina * 1000, pagina * 1000 + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

/** O painel de um mês, montado a partir de um cliente do Supabase. Fica fora da
 *  função de servidor para poder ser rodado e conferido direto contra a base. */
export async function montarVisaoDeGestao(
  supabase: any,
  ownerId: string,
  data: { mes: string; unitId: string | null },
): Promise<VisaoDeGestao> {
  const { mes } = data;
  const mesAnterior = somarMeses(mes, -1);
  const seisMeses = [-5, -4, -3, -2, -1, 0].map((i) => somarMeses(mes, i));
  const hoje = clinicTodayStr();
  // Até onde o mês "já aconteceu": no mês corrente, hoje; nos passados, o
  // último dia; nos futuros, antes do dia 1 (nada aconteceu).
  const ateDia = (m: string) => (hoje < fimDoMes(m) ? hoje : fimDoMes(m));

  // ── Unidades, cadeiras e horário de funcionamento ──────────────────
  const [unidadesRes, cadeirasRes, horariosRes, datasRes] = await Promise.all([
    supabase
      .from("clinic_units")
      .select("id, name, active, schedule_mode")
      .eq("owner_id", ownerId)
      .order("name"),
    supabase.from("clinic_chairs").select("unit_id, active").eq("owner_id", ownerId),
    supabase
      .from("clinic_business_hours")
      .select("unit_id, weekday, modo, opens_at, closes_at")
      .eq("owner_id", ownerId),
    supabase.from("clinic_unit_dates").select("unit_id, date").eq("owner_id", ownerId),
  ]);
  for (const r of [unidadesRes, cadeirasRes, horariosRes])
    if (r.error) throw new Error(r.error.message);
  // Tabela de datas ausente (migration antiga): trata como nenhuma data.
  const datasDasUnidades = ((datasRes.error ? [] : datasRes.data) ?? []) as any[];
  // A unidade que só atende em datas marcadas (a de viagem).
  const porData = new Set(
    ((unidadesRes.data ?? []) as any[])
      .filter((u) => u.schedule_mode === "by_date")
      .map((u) => String(u.id)),
  );
  const ativas = ((unidadesRes.data ?? []) as any[])
    .filter((u) => u.active !== false)
    .map((u) => ({ id: String(u.id), nome: String(u.name ?? "").trim() }));
  if (data.unitId && !ativas.some((u) => u.id === data.unitId))
    throw new Error("Unidade inválida.");

  const daCapacidade = (ids: string[]): UnidadeParaCapacidade[] =>
    ids.map((id) => ({
      id,
      diasMarcados: porData.has(id)
        ? datasDasUnidades.filter((d) => String(d.unit_id) === id).map((d) => String(d.date))
        : null,
      cadeiras: ((cadeirasRes.data ?? []) as any[]).filter(
        (c) => String(c.unit_id) === id && c.active !== false,
      ).length,
      horarios: ((horariosRes.data ?? []) as any[])
        .filter((h) => String(h.unit_id) === id)
        .map((h) => ({
          weekday: Number(h.weekday),
          modo: String(h.modo ?? ""),
          opens: h.opens_at ?? null,
          closes: h.closes_at ?? null,
        })),
    }));
  const idsEmFoco = data.unitId ? [data.unitId] : ativas.map((u) => u.id);

  // ── Atendimentos do mês e do anterior ──────────────────────────────
  const atendimentos: AtendimentoDoPainel[] = (
    await lerTudo((de, ate) => {
      let q = supabase
        .from("appointments")
        .select(
          "id, unit_id, patient_id, date, start_time, end_time, status, actual_revenue, expected_revenue",
        )
        .eq("owner_id", ownerId)
        .gte("date", `${mesAnterior}-01`)
        .lte("date", fimDoMes(mes))
        .range(de, ate);
      if (data.unitId) q = q.eq("unit_id", data.unitId);
      return q;
    })
  ).map((a) => ({
    id: String(a.id),
    unitId: a.unit_id ? String(a.unit_id) : null,
    patientId: a.patient_id ? String(a.patient_id) : null,
    date: String(a.date),
    startTime: String(a.start_time ?? ""),
    endTime: String(a.end_time ?? ""),
    status: String(a.status ?? ""),
    // Como a conversão da Meta: o valor lançado, e o previsto na falta dele.
    receita:
      Number(a.actual_revenue) > 0 ? Number(a.actual_revenue) : Number(a.expected_revenue ?? 0),
  }));
  const doMes = (m: string) => atendimentos.filter((a) => a.date.slice(0, 7) === m);

  // Quem já foi atendido alguma vez, para separar novos de recorrentes. A
  // base inteira, sem filtro de unidade: quem veio na outra unidade ano
  // passado não é paciente novo.
  const primeiros = primeiroAtendimento(
    (
      await lerTudo((de, ate) =>
        supabase
          .from("appointments")
          .select("patient_id, unit_id, date")
          .eq("owner_id", ownerId)
          .eq("status", "completed")
          .not("patient_id", "is", null)
          .range(de, ate),
      )
    ).map((a) => ({
      patientId: String(a.patient_id),
      unitId: a.unit_id ?? null,
      date: String(a.date),
    })),
  );

  // ── Receita e resultado: a DRE do Financeiro ───────────────────────
  const { categorias } = await lerCategorias(supabase, ownerId);
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const lancamentos = await lerLancamentos(
    supabase,
    ownerId,
    data.unitId,
    `${seisMeses[0]}-01`,
    `${mes}-01`,
    porId,
  );
  const dre = montarDre(lancamentos, seisMeses, "competencia");
  const evolucao: PontoDaEvolucao[] = seisMeses.map((m, i) => {
    const receita = dre.linhas.receita.porMes[i] ?? 0;
    const resultado = dre.resultadoOperacional[i] ?? 0;
    return { mes: m, receita, resultado, margem: margemEmPct(resultado, receita) };
  });
  const atual = evolucao[5];
  const anterior = evolucao[4];

  // ── Indicadores do mês e do anterior ───────────────────────────────
  const doPeriodo = (m: string) => {
    const lista = doMes(m);
    const ate = ateDia(m);
    const noPeriodo = lista.filter((a) => a.date <= ate);
    const capacidade = minutosDeCapacidade(m, ate, daCapacidade(idsEmFoco));
    const agendado = minutosAgendados(noPeriodo);
    return {
      concluidos: lista.filter((a) => a.status === "completed"),
      ocupacao: ocupacaoEmPct(agendado, capacidade),
      perdidos: taxaDePerdidos(lista, ate),
      agendado,
      capacidade,
      grupos: novosERecorrentes(lista, primeiros, m),
    };
  };
  const pAtual = doPeriodo(mes);
  const pAnterior = doPeriodo(mesAnterior);

  // ── Por unidade ────────────────────────────────────────────────────
  let porUnidade: UnidadeNoPainel[] = [];
  if (!data.unitId && ativas.length > 1) {
    porUnidade = await Promise.all(
      ativas.map(async (u) => {
        const lanc = await lerLancamentos(supabase, ownerId, u.id, `${mes}-01`, `${mes}-01`, porId);
        const d = montarDre(lanc, [mes], "competencia");
        const feitos = doMes(mes).filter((a) => a.unitId === u.id);
        const ate = ateDia(mes);
        const cap = minutosDeCapacidade(mes, ate, daCapacidade([u.id]));
        return {
          id: u.id,
          nome: u.nome,
          receita: d.linhas.receita.porMes[0] ?? 0,
          resultado: d.resultadoOperacional[0] ?? 0,
          atendimentos: feitos.filter((a) => a.status === "completed").length,
          ticketMedio: ticketMedio(feitos),
          ocupacao: ocupacaoEmPct(minutosAgendados(feitos.filter((a) => a.date <= ate)), cap),
        };
      }),
    );
  }

  // ── Caixa ──────────────────────────────────────────────────────────
  const { data: contas, error: erroContas } = await supabase
    .from("financial_accounts")
    .select("current_balance")
    .eq("owner_id", ownerId);
  if (erroContas) throw new Error(erroContas.message);
  const saldos = ((contas ?? []) as any[]).map((c) => Number(c.current_balance ?? 0));

  // ── NÓS Club (só onde o consultório tem) ───────────────────────────
  let club: VisaoDeGestao["pacientes"]["club"] = null;
  const recursos = recursosDaFicha(await lerFichaDoSite(supabase, ownerId), new Date());
  if (recursos.club) {
    const ini = `${mes}-01`;
    const fim = `${somarMeses(mes, 1)}-01`;
    const contar = async (q: any) => {
      const { count, error } = await q;
      return error ? 0 : (count ?? 0);
    };
    club = {
      indicadas: await contar(
        supabase
          .from("club_indicacoes")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", ownerId)
          .neq("status", "cancelada")
          .gte("created_at", ini)
          .lt("created_at", fim),
      ),
      confirmadas: await contar(
        supabase
          .from("club_indicacoes")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", ownerId)
          .eq("status", "confirmada")
          .gte("confirmada_em", ini)
          .lt("confirmada_em", fim),
      ),
    };
  }

  const avisos: string[] = [];
  if (dre.semGrupo > 0) {
    avisos.push(
      `${dre.semGrupo} lançamentos entraram na DRE sem grupo definido; o resultado usa um palpite pelo nome da categoria.`,
    );
  }
  if (pAtual.capacidade === 0) {
    avisos.push("Cadastre o horário de funcionamento das unidades para a ocupação aparecer.");
  }

  return {
    mes,
    mesAnterior,
    mesEmAndamento: hoje >= `${mes}-01` && hoje < fimDoMes(mes),
    unidades: ativas,
    unidadeSelecionada: data.unitId,
    resumo: {
      receita: variacao(atual.receita, anterior.receita),
      resultado: variacao(atual.resultado, anterior.resultado),
      margem: variacao(atual.margem, anterior.margem),
      novosPacientes: variacao(pAtual.grupos.novos, pAnterior.grupos.novos),
      ocupacao: variacao(pAtual.ocupacao, pAnterior.ocupacao),
    },
    caixa: { total: saldos.reduce((a, b) => a + b, 0), informado: saldos.some((s) => s !== 0) },
    operacao: {
      atendimentos: variacao(pAtual.concluidos.length, pAnterior.concluidos.length),
      ticketMedio: variacao(ticketMedio(pAtual.concluidos), ticketMedio(pAnterior.concluidos)),
      perdidos: variacao(pAtual.perdidos, pAnterior.perdidos),
      horasAgendadas: pAtual.agendado / 60,
      horasDisponiveis: pAtual.capacidade / 60,
    },
    pacientes: { ...pAtual.grupos, club },
    evolucao,
    porUnidade,
    avisos,
  };
}
