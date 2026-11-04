/* eslint-disable @typescript-eslint/no-explicit-any */
import { variacao, type Variacao } from "@/lib/gestao/indicadores";
import {
  aguardando,
  atendidas,
  conversao,
  movimentoPorHora,
  novasConversas,
  periodosDoFiltro,
  picoDaSemana,
  respostas,
  resumoDeResposta,
  type AgendamentoCriado,
  type Aguardando,
  type Atendidas,
  type Conversao,
  type FiltroDePeriodo,
  type Mensagem,
  type PicoDaSemana,
  type PrimeiraEntrada,
  type ResumoDeResposta,
} from "./metricas";

// O painel de Atendimento, lido do banco. As contas moram em `metricas.ts`.

export interface PainelDoAtendimento {
  filtro: FiltroDePeriodo;
  /** Quando foi calculado, em ms. */
  geradoEm: number;
  novas: Variacao;
  /** `false` enquanto a visão `wa_primeira_entrada` não existe (migration). */
  novasDisponiveis: boolean;
  atendidas: { atual: Atendidas; anterior: Atendidas; variacao: Variacao };
  conversao: Conversao;
  resposta: { atual: ResumoDeResposta; anterior: ResumoDeResposta };
  /** Mensagens recebidas por hora do dia, no período: 24 posições. */
  porHora: number[];
  aguardando: Aguardando;
}

const iso = (ms: number) => new Date(ms).toISOString();
const DIA = 86_400_000;
const SO_PESSOAS = "%@s.whatsapp.net";

async function lerTudo(montar: (de: number, ate: number) => any): Promise<any[]> {
  const linhas: any[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await montar(pagina * 1000, pagina * 1000 + 999);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

export async function montarPainelDoAtendimento(
  supabase: any,
  ownerId: string,
  filtro: FiltroDePeriodo,
  agora = Date.now(),
): Promise<PainelDoAtendimento> {
  const { atual, anterior } = periodosDoFiltro(filtro, agora);

  // As mensagens de duas janelas (a do período e a de comparação) até agora: a
  // resposta a uma pergunta do período pode ter vindo depois do fim dele.
  const bruto = await lerTudo((de, ate) =>
    supabase
      .from("wa_messages")
      .select("crm_message_id, crm_conversation_id, from_me, sent_at")
      .eq("owner_id", ownerId)
      .like("crm_conversation_id", SO_PESSOAS)
      .or("is_private.is.null,is_private.eq.false")
      .gte("sent_at", iso(anterior.de))
      .order("sent_at", { ascending: true })
      .order("crm_message_id", { ascending: true })
      .range(de, ate),
  );

  // O que foi a assistente que mandou: o id da mensagem que ela registra.
  const lunaIds = new Set<string>(
    (
      await lerTudo((de, ate) =>
        supabase
          .from("ai_agent_messages")
          .select("wa_message_id")
          .eq("owner_id", ownerId)
          .eq("direction", "saida")
          .not("wa_message_id", "is", null)
          .gte("created_at", iso(anterior.de - DIA))
          .range(de, ate),
      )
    ).map((r) => String(r.wa_message_id)),
  );

  const mensagens: Mensagem[] = bruto.map((m) => ({
    conversa: String(m.crm_conversation_id),
    daClinica: m.from_me === true,
    em: Date.parse(m.sent_at),
    luna: m.from_me === true && lunaIds.has(String(m.crm_message_id)),
  }));

  // ── Quem chamou pela primeira vez ──────────────────────────────────
  let entradas: PrimeiraEntrada[] = [];
  let novasDisponiveis = true;
  {
    const { data, error } = await supabase
      .from("wa_primeira_entrada")
      .select("crm_conversation_id, primeira_em")
      .eq("owner_id", ownerId)
      .like("crm_conversation_id", SO_PESSOAS)
      .gte("primeira_em", iso(anterior.de))
      .lt("primeira_em", iso(agora + 1));
    if (error) {
      // 42P01: a visão ainda não existe (migration pendente). O painel segue,
      // com "—" no lugar do número, em vez de cair inteiro.
      if (error.code !== "42P01" && !/does not exist/i.test(String(error.message))) throw error;
      novasDisponiveis = false;
    } else {
      entradas = (data ?? []).map((r: any) => ({
        conversa: String(r.crm_conversation_id),
        em: Date.parse(r.primeira_em),
      }));
    }
  }
  const novasAtual = novasConversas(entradas, atual);
  const novasAnterior = novasConversas(entradas, anterior);

  // ── Agendamentos criados desde o início da comparação ──────────────
  const agendamentos: AgendamentoCriado[] = [];
  {
    const linhas = await lerTudo((de, ate) =>
      supabase
        .from("appointments")
        .select("patient_id, created_at, status")
        .eq("owner_id", ownerId)
        .neq("status", "cancelled")
        .not("patient_id", "is", null)
        .gte("created_at", iso(anterior.de))
        .range(de, ate),
    );
    const ids = [...new Set(linhas.map((l) => String(l.patient_id)))];
    const pacientes = new Map<string, { fone: string | null; contato: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("patients")
        .select("id, phone, crm_contact_id")
        .in("id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const p of data ?? [])
        pacientes.set(String(p.id), { fone: p.phone ?? null, contato: p.crm_contact_id ?? null });
    }
    for (const l of linhas) {
      const p = pacientes.get(String(l.patient_id));
      if (p) agendamentos.push({ ...p, criadoEm: Date.parse(l.created_at) });
    }
  }

  // ── Quem está esperando resposta agora ─────────────────────────────
  const { data: esperando, error: erroEspera } = await supabase
    .from("wa_conversations")
    .select("last_message_at")
    .eq("owner_id", ownerId)
    .like("crm_conversation_id", SO_PESSOAS)
    .eq("last_message_from_me", false)
    .gte("last_message_at", iso(agora - DIA));
  if (erroEspera) throw erroEspera;

  const atendidasAtual = atendidas(mensagens, atual);
  const atendidasAnterior = atendidas(mensagens, anterior);

  return {
    filtro,
    geradoEm: agora,
    novas: variacao(
      novasDisponiveis ? novasAtual.length : null,
      novasDisponiveis ? novasAnterior.length : null,
    ),
    novasDisponiveis,
    atendidas: {
      atual: atendidasAtual,
      anterior: atendidasAnterior,
      variacao: variacao(atendidasAtual.total, atendidasAnterior.total),
    },
    conversao: conversao(novasAtual, agendamentos),
    resposta: {
      atual: resumoDeResposta(respostas(mensagens, atual)),
      anterior: resumoDeResposta(respostas(mensagens, anterior)),
    },
    porHora: movimentoPorHora(mensagens, atual),
    aguardando: aguardando(
      (esperando ?? []).map((c: any) => Date.parse(c.last_message_at)),
      agora,
    ),
  };
}

/** As mensagens recebidas nas últimas quatro semanas, por dia da semana e hora. */
export async function montarPicoDaSemana(
  supabase: any,
  ownerId: string,
  agora = Date.now(),
): Promise<PicoDaSemana> {
  const linhas = await lerTudo((de, ate) =>
    supabase
      .from("wa_messages")
      .select("sent_at")
      .eq("owner_id", ownerId)
      .eq("from_me", false)
      .like("crm_conversation_id", SO_PESSOAS)
      .gte("sent_at", iso(agora - 28 * DIA))
      .order("sent_at", { ascending: true })
      .range(de, ate),
  );
  return picoDaSemana(linhas.map((l) => Date.parse(l.sent_at)));
}
