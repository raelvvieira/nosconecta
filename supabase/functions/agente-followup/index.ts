// A Luna voltando em quem sumiu.
//
// ── O que roda aqui ─────────────────────────────────────────────────────
//
// De hora em hora: acha as conversas de anúncio em que a Luna falou e a pessoa
// não voltou, e manda UMA mensagem retomando. Dois toques por conversa, e
// depois ela para.
//
// ── Por que função própria, e não uma automação ─────────────────────────
//
// `atendimento-automations` reage a EVENTO: agendamento criado, resposta
// recebida. Follow-up é o contrário — reage à AUSÊNCIA de evento, e nada
// dispara quando nada acontece. Precisa de alguém varrendo o relógio.
//
// E, como as lições, um cron não tem dono: varre todas as clínicas. Enfiar
// isso no `ai-playbook`, que é o que a tela chama, obrigaria a inventar um
// `ownerId` fixo no agendamento do cron.
//
// ── Os três freios, e por que cada um existe ────────────────────────────
//
// **Nasce desligado** (`followup_ligado` default false). Uma coisa nova que
// manda mensagem no WhatsApp de gente real não se liga sozinha.
//
// **Ligar não acorda o passado** (`followup_ligado_desde`). Sem isso, o dia em
// que a clínica ligasse a chave, 262 conversas paradas receberiam mensagem ao
// mesmo tempo — muitas de dois meses atrás. Isso não é follow-up, é disparo, e
// disparo que a pessoa não espera vira bloqueio.
//
// **Teto por rodada** (`POR_RODADA`). Mesmo tudo estando certo, uma rodada não
// manda mais que isto. É o que transforma um defeito numa dor de cabeça em vez
// de num número de WhatsApp queimado.
//
// E o quarto, que é de fora: a cota diária que o disparo e as campanhas já
// respeitam. Follow-up entra no mesmo caixa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarModelo } from "../_shared/modelo-de-atendimento.ts";
import { anotarConsumo } from "../_shared/consumo-da-ia.ts";
import { historicoDoEspelho } from "../_shared/historico-da-conversa.ts";
import { variantesDoNumero } from "../_shared/phone-match.ts";
import { telefoneDoJid } from "../_shared/evolution-mapear.ts";
import { enviarWhatsapp } from "../_shared/whatsapp-send.ts";
import { debitDailyUsage, getDailyUsage } from "../_shared/daily-quota.ts";
import { agoraNaClinica } from "../_shared/agenda-da-clinica.ts";
import { instrucaoDaLuna } from "../_shared/atendimento.ts";
import { semTravessao } from "../_shared/sem-travessao.ts";
import { emojiNaMedida } from "../_shared/emoji-na-medida.ts";
import { jaDisseIssoAgora } from "../_shared/nao-repetir.ts";
import { oQueEuMandei } from "../_shared/historico-da-clinica.ts";
import { type Anuncio } from "../_shared/veio-de-anuncio.ts";
import {
  decidirFollowup,
  dentroDaJanela,
  promptDoFollowup,
  RITMO_PADRAO_DO_FOLLOWUP,
  type DiaDaJornada,
} from "../_shared/followup-do-agente.ts";
import {
  conferirAntesDeEnviar,
  depoisDe,
  janelaAberta,
  MECANISMOS,
  mecanismoDaEtapa,
  pareceGenerica,
  proximaEtapa,
  reclamar,
  soltarSePresa,
  type EstadoDaSequencia,
  type EtapaPlanejada,
  type Mecanismo,
  type Trilha,
} from "../_shared/recuperacao.ts";
import {
  colunasDoEstado,
  configDoAgente,
  diasAbertos,
  estadoDaSessao,
} from "../_shared/recuperacao-no-banco.ts";
import {
  FORMATO_DA_RETOMADA,
  lerRetomada,
  pedidoDaRetomada,
  type RetomadaEscrita,
} from "../_shared/recuperacao-prompt.ts";
import { casoEscolhido } from "../_shared/casos-da-ia.ts";
import { baixarCaso } from "../_shared/agente-no-webhook.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Quantas mensagens por rodada, por clínica.
 *
 * Três é pouco de propósito. O cron roda de hora em hora, então são até 72 por
 * dia — mais que o follow-up de uma clínica precisa, e pouco o bastante para um
 * defeito não virar centena de mensagens antes de alguém perceber.
 */
const POR_RODADA = 3;

/** A conversa inteira vai ao modelo: um follow-up que erra o que já foi
 *  combinado é pior que nenhum. */
const MENSAGENS_DO_HISTORICO = 30;

const MAX_TOKENS = 600;

type Agente = {
  id: string;
  owner_id: string;
  api_key: string | null;
  model: string | null;
  instrucao_base: string | null;
  parcelamento: string | null;
  enabled: boolean | null;
  circuit_open_until: string | null;
  followup_ligado: boolean | null;
  followup_horas_1: number | null;
  followup_horas_2: number | null;
  followup_ligado_desde: string | null;
  recovery_config: unknown;
};

async function cuidarDaClinica(agente: {
  id: string;
  owner_id: string;
  api_key: string | null;
  model: string | null;
  instrucao_base: string | null;
  parcelamento: string | null;
  enabled: boolean | null;
  circuit_open_until: string | null;
  followup_ligado: boolean | null;
  followup_horas_1: number | null;
  followup_horas_2: number | null;
  followup_ligado_desde: string | null;
}) {
  const ownerId = agente.owner_id;

  const ritmo = {
    ...RITMO_PADRAO_DO_FOLLOWUP,
    ligado: agente.followup_ligado === true,
    horasParaOPrimeiro: agente.followup_horas_1 ?? RITMO_PADRAO_DO_FOLLOWUP.horasParaOPrimeiro,
    horasParaOSegundo: agente.followup_horas_2 ?? RITMO_PADRAO_DO_FOLLOWUP.horasParaOSegundo,
    ligadoDesde: agente.followup_ligado_desde ?? null,
  };

  if (!ritmo.ligado) return { ownerId, motivo: "follow-up desligado" };
  if (!agente.model) return { ownerId, motivo: "sem modelo escolhido" };

  // A Luna pausada não volta em ninguém: pausar tem de calar todos os
  // caminhos, não só o que responde.
  if (!agente.enabled) return { ownerId, motivo: "agente pausado" };
  if (agente.circuit_open_until && new Date(agente.circuit_open_until) > new Date()) {
    return { ownerId, motivo: "disjuntor aberto" };
  }

  // Ligar a chave sem data é o caso perigoso: seria "sem limite para trás".
  // Tratado como "ligou agora", que não manda nada nesta rodada e passa a
  // valer da próxima em diante.
  if (!ritmo.ligadoDesde) {
    await supabase
      .from("ai_agents")
      .update({ followup_ligado_desde: new Date().toISOString() })
      .eq("id", agente.id);
    return { ownerId, motivo: "follow-up acabou de ser ligado; vale de agora em diante" };
  }

  // ── A janela de horário ─────────────────────────────────────────────
  //
  // Antes de qualquer consulta: fora do horário nada vai sair, e não há por que
  // ler a agenda e as conversas para descobrir isso.
  const { data: jornada } = await supabase
    .from("clinic_business_hours")
    .select("weekday, modo, opens_at, closes_at")
    .eq("owner_id", ownerId);

  const dias: DiaDaJornada[] = (jornada ?? []).map((j: Record<string, unknown>) => ({
    weekday: Number(j.weekday),
    modo: String(j.modo),
    abre: j.opens_at ? String(j.opens_at) : null,
    fecha: j.closes_at ? String(j.closes_at) : null,
  }));

  const agora = new Date();
  const naClinica = agoraNaClinica(agora);
  const hora = Number(naClinica.hora.slice(0, 2));
  // `date` vem como AAAA-MM-DD no fuso da clínica; o dia da semana sai dela com
  // meio-dia UTC para nenhum fuso empurrar a data para o dia anterior.
  const weekday = new Date(`${naClinica.date}T12:00:00Z`).getUTCDay();

  if (!dentroDaJanela(hora, weekday, dias)) {
    return { ownerId, motivo: `fora da janela (${naClinica.hora}, dia ${weekday})` };
  }

  // ── A cota do número ────────────────────────────────────────────────
  const { limit, usedToday } = await getDailyUsage(supabase, ownerId);
  if (usedToday >= limit) return { ownerId, motivo: "cota diária do número esgotada" };

  // ── As candidatas ───────────────────────────────────────────────────
  //
  // Só de anúncio e só as em que a Luna falou. `human_took_over_at` nulo entra
  // no filtro do banco além da checagem pura: é o corte que tira mais linhas.
  const desde = new Date(agora.getTime() - ritmo.diasDeValidade * 86_400_000).toISOString();
  const { data: sessoes, error } = await supabase
    .from("ai_agent_sessions")
    .select(
      "id, conversation_id, contact_id, contact_name, created_at, last_inbound_at, last_outbound_at, human_took_over_at, anuncio, followups_enviados, ultimo_followup_em",
    )
    .eq("agent_id", agente.id)
    .is("human_took_over_at", null)
    .not("last_outbound_at", "is", null)
    .not("anuncio", "is", null)
    .lt("followups_enviados", ritmo.maximoDeToques)
    .gte("created_at", desde)
    .order("last_outbound_at", { ascending: true })
    .limit(100);
  if (error) return { ownerId, erro: error.message };
  if (!sessoes?.length) return { ownerId, motivo: "nenhuma conversa candidata" };

  let enviados = 0;
  const recusas: Record<string, number> = {};
  const registrar = (m: string) => (recusas[m] = (recusas[m] ?? 0) + 1);

  for (const s of sessoes) {
    if (enviados >= POR_RODADA) break;
    if (usedToday + enviados >= limit) {
      registrar("cota diária do número esgotada");
      break;
    }

    // ── Virou consulta? ───────────────────────────────────────────────
    //
    // A MESMA RPC que as lições usam. Duas leituras de "agendou?" divergiriam,
    // e a que erra aqui manda mensagem de cobrança para quem já marcou.
    const variantes = variantesDoNumero(telefoneDoJid(s.conversation_id));
    let jaAgendou = false;
    if (variantes.length) {
      const { data: achados, error: erroRpc } = await supabase.rpc("agendamento_criado_apos", {
        _owner: ownerId,
        _variantes: variantes,
        _desde: s.created_at,
      });
      // Erro de leitura NÃO pode virar "não agendou": mandaria follow-up para
      // quem já tem consulta marcada. Sem saber, esta conversa espera a
      // próxima hora.
      if (erroRpc) {
        registrar("não deu para conferir se agendou");
        continue;
      }
      jaAgendou = (achados ?? []).length > 0;
    }

    const decisao = decidirFollowup(
      {
        humanoAssumiu: !!s.human_took_over_at,
        ultimaEntrada: s.last_inbound_at,
        ultimaSaida: s.last_outbound_at,
        criadaEm: s.created_at,
        followupsEnviados: Number(s.followups_enviados ?? 0),
        ultimoFollowupEm: s.ultimo_followup_em,
        veioDeAnuncio: !!s.anuncio,
        jaAgendou,
      },
      ritmo,
      agora,
    );

    if (!decisao.volta) {
      registrar(decisao.motivo);
      continue;
    }

    // ── Escrever o toque ──────────────────────────────────────────────
    const falas = await historicoDoEspelho(
      supabase,
      ownerId,
      s.conversation_id,
      MENSAGENS_DO_HISTORICO,
    );
    if (!falas.length) {
      registrar("conversa sem mensagem legível");
      continue;
    }

    // A MESMA instrução do atendimento, montada pela mesma função. Ver o
    // comentário em `instrucaoDaLuna`: eu tinha copiado estas consultas para
    // cá e errado duas delas — a Luna do follow-up citaria preço de
    // procedimento que a clínica tirou da lista de propósito.
    // `.texto` e não o objeto: `instrucaoDaLuna` devolve `{ texto, horarios,
    // casos }`, porque o atendimento valida o código do horário contra a MESMA
    // tabela que montou a instrução. Aqui estava sendo passado o objeto inteiro
    // para `chamarModelo`, que espera uma string — a chamada iria com um objeto
    // no lugar do `system` e a OpenAI recusaria. Nunca apareceu porque o
    // follow-up nasceu desligado e nunca rodou: `bunx tsc` não alcança os
    // arquivos do Deno, e `checar-edge-functions` só pega identificador que não
    // existe. Achado em 16/10, implementando a Etapa 1.
    // A cidade que a pessoa confirmou, quando confirmou: é ela que decide de
    // qual unidade saem os horários da instrução. Leitura à parte, e tolerante,
    // em vez de entrar no `select` da lista acima: a coluna nasce numa
    // migration que o Lovable aplica em passo separado deste deploy, e um
    // `select` com coluna inexistente derrubaria a rodada inteira de follow-up.
    // Erro aqui é "não sei a cidade", e aí a Luna pergunta — que é o que ela
    // faria mesmo.
    let unidadeDaSessao: string | null = null;
    try {
      const { data: comCidade } = await supabase
        .from("ai_agent_sessions")
        .select("unidade_id")
        .eq("id", s.id)
        .maybeSingle();
      unidadeDaSessao = comCidade?.unidade_id ? String(comCidade.unidade_id) : null;
    } catch (e) {
      console.warn("[followup] cidade da sessão indisponível:", e instanceof Error ? e.message : e);
    }

    const { texto: instrucao } = await instrucaoDaLuna(
      supabase,
      ownerId,
      agente,
      (s.anuncio as Anuncio | null) ?? null,
      agora,
      // Sessão e dúvida pendente seguem fora, como antes desta mudança: o que
      // entrou aqui foi só a cidade.
      null,
      null,
      unidadeDaSessao,
    );

    const horasDeSilencio = (agora.getTime() - new Date(s.last_outbound_at).getTime()) / 3_600_000;

    let texto: string;
    try {
      texto = await chamarModelo({
        chave: agente.api_key,
        modelo: agente.model,
        instrucao,
        pergunta: promptDoFollowup({
          toque: decisao.toque,
          historico: falas
            .map((f) => `${f.deQuem === "clinica" ? "VOCÊ" : "PACIENTE"}: ${f.texto}`)
            .join("\n"),
          horasDeSilencio,
        }),
        maxTokens: MAX_TOKENS,
        anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "followup", uso, s.id),
      });
    } catch (e) {
      console.error(`[followup] modelo falhou em ${s.conversation_id}:`, e);
      registrar("modelo falhou");
      continue;
    }

    // A janela é larga aqui (48h) porque o que não pode repetir é a MENSAGEM
    // ANTERIOR da conversa, não uma de minutos atrás. A mesma leitura decide o
    // emoji: um follow-up também não sorri se a Luna sorriu há pouco.
    const jaDitas = await oQueEuMandei(supabase, s.id, agora, 48 * 60);
    const mensagem = emojiNaMedida(
      semTravessao(String(texto ?? "").trim()),
      jaDitas.map((m) => m.texto),
    );
    if (!mensagem) {
      registrar("o modelo preferiu não escrever");
      continue;
    }

    // A mesma rede do atendimento: um follow-up que repete o que já foi dito é
    // pior que nenhum.
    const repetida = jaDisseIssoAgora(
      mensagem,
      jaDitas.map((m) => m.texto),
    );
    if (repetida) {
      registrar("o toque saiu igual ao que já foi dito");
      // Conta como toque gasto: insistir com o mesmo texto na hora seguinte
      // daria no mesmo, e deixaria a conversa presa neste laço para sempre.
      await marcarToque(s.id, Number(s.followups_enviados ?? 0), agora);
      continue;
    }

    // ── Mandar ────────────────────────────────────────────────────────
    //
    // Última checagem antes do envio: alguém pode ter assumido a conversa nos
    // segundos que a chamada do modelo levou.
    const { data: agoraMesmo } = await supabase
      .from("ai_agent_sessions")
      .select("human_took_over_at, followups_enviados")
      .eq("id", s.id)
      .maybeSingle();
    if (agoraMesmo?.human_took_over_at) {
      registrar("humano assumiu enquanto eu escrevia");
      continue;
    }
    // Duas rodadas sobrepostas não podem mandar dois toques. O contador do
    // banco é quem decide.
    if (Number(agoraMesmo?.followups_enviados ?? 0) !== Number(s.followups_enviados ?? 0)) {
      registrar("outra rodada já cuidou desta");
      continue;
    }

    try {
      const envio = await enviarWhatsapp(
        supabase,
        ownerId,
        { conversation_id: s.conversation_id, phone: telefoneDoJid(s.conversation_id) },
        mensagem,
      );
      await supabase.from("ai_agent_messages").insert({
        owner_id: ownerId,
        session_id: s.id,
        direction: "saida",
        content: mensagem,
        wa_message_id: typeof envio?.messageId === "string" ? envio.messageId : null,
        skipped_reason: null,
      });
      await marcarToque(s.id, Number(s.followups_enviados ?? 0), agora);
      // O mesmo caixa do disparo e das campanhas.
      await debitDailyUsage(supabase, ownerId, `followup:${agente.id}`, 1);
      enviados++;
    } catch (e) {
      console.error(`[followup] não deu para enviar em ${s.conversation_id}:`, e);
      registrar("falha no envio");
    }
  }

  return { ownerId, enviados, recusas };
}

/** O contador e o relógio do próximo toque, numa escrita só. `last_outbound_at`
 *  também avança: para todo o resto do sistema este toque É uma mensagem da
 *  clínica, e a caixa de entrada precisa vê-lo como tal. */
async function marcarToque(sessionId: string, quantosJa: number, agora: Date) {
  await supabase
    .from("ai_agent_sessions")
    .update({
      followups_enviados: quantosJa + 1,
      ultimo_followup_em: agora.toISOString(),
      last_outbound_at: agora.toISOString(),
      updated_at: agora.toISOString(),
    })
    .eq("id", sessionId);
}

// ═════════════════════════════════════════════════════════════════════════
// O Recovery Engine
// ═════════════════════════════════════════════════════════════════════════
//
// A rodada de cada minuto, para quem ligou o motor novo na tela. Cada conversa
// já tem o seu calendário guardado (nasceu quando a Luna respondeu, em
// `atendimento.ts`); aqui só se executa a etapa que venceu.
//
// A ordem de cada etapa é a de `tests/recuperacao.ts`, que é onde ela está
// provada: soltar o que ficou preso, reclamar a etapa (uma rodada só ganha),
// conferir tudo de novo, escrever, conferir uma última vez, gravar e enviar.

/** Teto por clínica e por minuto. Folgado para a cadência, apertado para um
 *  defeito não virar rajada. */
const POR_MINUTO = 10;

/** Colunas da conversa que a rodada lê. */
const COLUNAS_DA_SESSAO =
  "id, conversation_id, created_at, human_took_over_at, nao_contatar_em, anuncio, unidade_id, followups_enviados, recovery_status, recovery_trilha, recovery_intensidade, recovery_origem_em, recovery_plano, recovery_passo, recovery_proximo_em, recovery_mecanismos, recovery_tentativas, recovery_enviando_desde, recovery_pergunta_aberta, recovery_motivo";

/**
 * Grava o estado novo SÓ se a conversa ainda está como esta rodada a deixou.
 *
 * É o que impede o atendimento e a rodada de pisarem um no outro: se a pessoa
 * respondeu enquanto a Luna escrevia, o atendimento já trocou para
 * "cancelada", e esta escrita não acha a linha. Devolve se gravou.
 */
async function gravarSe(
  sessionId: string,
  esperado: { status: string; passo: number },
  novo: EstadoDaSequencia,
  extras: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_agent_sessions")
    .update({ ...colunasDoEstado(novo), ...extras, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("recovery_status", esperado.status)
    .eq("recovery_passo", esperado.passo)
    .select("id");
  if (error) {
    console.warn("[recovery] não gravou o estado:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Deixa o motivo de cada decisão no registro da Luna: é daqui que sai a
 *  medição do que foi cancelado, pulado ou bloqueado, e por quê. */
async function anotar(
  ownerId: string,
  sessionId: string,
  trilha: string,
  etapa: EtapaPlanejada,
  motivo: string,
) {
  await supabase.from("ai_agent_messages").insert({
    owner_id: ownerId,
    session_id: sessionId,
    direction: "ignorada",
    content: null,
    skipped_reason: `recovery: ${motivo}`,
    recovery_trilha: trilha,
    recovery_passo: etapa.passo,
    recovery_mecanismo: etapa.mecanismo,
  });
}

/** A pessoa escreveu algo depois da mensagem que deu origem à sequência? O
 *  espelho é a fonte: vale até para mensagem que a Luna não respondeu. */
async function pessoaFalouDepois(
  ownerId: string,
  conversationId: string,
  desde: string | null,
): Promise<boolean> {
  if (!desde) return false;
  const { data, error } = await supabase
    .from("wa_messages")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    .eq("from_me", false)
    .gt("sent_at", desde)
    .limit(1);
  // Sem saber, trata como "falou": melhor perder uma retomada do que mandar
  // uma por cima da resposta dela.
  if (error) return true;
  return (data ?? []).length > 0;
}

async function recuperarDaClinica(agente: Agente) {
  const ownerId = agente.owner_id;
  const config = configDoAgente(agente)!;
  const agora = new Date();

  // ── O que ficou preso no meio de um envio ──────────────────────────────
  //
  // Servidor caiu entre mandar e gravar. A etapa é descartada, nunca
  // reenviada: perder um toque é melhor que mandar dois.
  const { data: presas } = await supabase
    .from("ai_agent_sessions")
    .select(COLUNAS_DA_SESSAO)
    .eq("agent_id", agente.id)
    .eq("recovery_status", "enviando")
    .limit(50);
  for (const s of presas ?? []) {
    const estado = estadoDaSessao(s);
    const solta = estado ? soltarSePresa(estado, agora) : null;
    if (estado && solta) {
      await gravarSe(s.id, { status: "enviando", passo: estado.passo }, solta);
    }
  }

  const { data: vencidas, error } = await supabase
    .from("ai_agent_sessions")
    .select(COLUNAS_DA_SESSAO)
    .eq("agent_id", agente.id)
    .eq("recovery_status", "ativa")
    .lte("recovery_proximo_em", agora.toISOString())
    .order("recovery_proximo_em", { ascending: true })
    .limit(POR_MINUTO * 2);
  if (error) return { ownerId, erro: error.message };
  if (!vencidas?.length) return { ownerId, motivo: "nenhuma etapa vencida" };

  const dias = await diasAbertos(supabase, ownerId);
  const resultado: Record<string, number> = {};
  const contar = (m: string) => (resultado[m] = (resultado[m] ?? 0) + 1);
  let enviados = 0;

  for (const s of vencidas) {
    if (enviados >= POR_MINUTO) break;
    const estado = estadoDaSessao(s);
    const etapa = estado ? proximaEtapa(estado) : null;
    if (!estado || !etapa) continue;

    // ── Reclamar: daqui em diante esta etapa é só desta rodada ──────────
    const reclamado = reclamar(estado, estado.passo, agora);
    if (!reclamado) continue;
    if (!(await gravarSe(s.id, { status: "ativa", passo: estado.passo }, reclamado))) {
      contar("outra rodada pegou");
      continue;
    }

    const trilha = (s.recovery_trilha ?? "ACTIVE_CONVERSATION_DROP") as Trilha;
    let final: EstadoDaSequencia;
    let extras: Record<string, unknown> = {};
    try {
      const r = await executarEtapa(agente, config, dias, s, reclamado, etapa, trilha, agora);
      final = r.estado;
      extras = r.extras ?? {};
      if (r.motivo) {
        contar(r.motivo);
        if (r.motivo !== "enviada") await anotar(ownerId, s.id, trilha, etapa, r.motivo);
      }
      if (r.motivo === "enviada") enviados++;
    } catch (e) {
      // Erro inesperado ANTES do envio: devolve a etapa como falha, que tenta
      // uma vez mais no próximo minuto, passando pela conferência de novo.
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[recovery] etapa ${etapa.passo} em ${s.conversation_id}:`, motivo);
      final = depoisDe(reclamado, { tipo: "falhou", motivo: motivo.slice(0, 200) });
      contar("erro");
    }
    await gravarSe(s.id, { status: "enviando", passo: estado.passo }, final, extras);
  }

  return { ownerId, recovery: true, enviados, resultado };
}

/**
 * Uma etapa, da conferência ao envio. Devolve o estado a gravar e o motivo
 * (que vira linha no registro).
 */
async function executarEtapa(
  agente: Agente,
  config: NonNullable<ReturnType<typeof configDoAgente>>,
  dias: number[],
  // deno-lint-ignore no-explicit-any
  s: any,
  estado: EstadoDaSequencia,
  etapa: EtapaPlanejada,
  trilha: Trilha,
  agora: Date,
): Promise<{ estado: EstadoDaSequencia; motivo: string; extras?: Record<string, unknown> }> {
  const ownerId = agente.owner_id;

  // ── Conferir tudo de novo, agora ──────────────────────────────────────
  const variantes = variantesDoNumero(telefoneDoJid(s.conversation_id));
  let agendou: boolean | null = false;
  if (variantes.length) {
    const { data: achados, error: erroRpc } = await supabase.rpc("agendamento_criado_apos", {
      _owner: ownerId,
      _variantes: variantes,
      _desde: s.created_at,
    });
    agendou = erroRpc ? null : (achados ?? []).length > 0;
  }
  const { limit, usedToday } = await getDailyUsage(supabase, ownerId);

  const veredito = conferirAntesDeEnviar({
    agora,
    etapa,
    pessoaFalouDepois: await pessoaFalouDepois(ownerId, s.conversation_id, s.recovery_origem_em),
    equipeAssumiu: !!s.human_took_over_at,
    agendou,
    naoContatar: !!s.nao_contatar_em,
    agenteLigado:
      !!agente.enabled &&
      !!agente.model &&
      !(agente.circuit_open_until && new Date(agente.circuit_open_until) > agora),
    recuperacaoLigada: config.ligado,
    trilhaLigada: config.trilhas[trilha]?.ligada === true,
    janelaAberta: janelaAberta(agora, config, dias),
    cotaDisponivel: usedToday < limit,
    toleranciaMinutos: config.toleranciaMinutos,
  });
  if (veredito.acao === "cancelar") {
    return {
      estado: depoisDe(estado, { tipo: "cancelou", motivo: veredito.motivo }),
      motivo: veredito.motivo,
    };
  }
  if (veredito.acao === "pular") {
    return {
      estado: depoisDe(estado, { tipo: "pulou", motivo: veredito.motivo }),
      motivo: veredito.motivo,
    };
  }
  if (veredito.acao === "esperar") {
    return {
      estado: depoisDe(estado, { tipo: "esperar", motivo: veredito.motivo }),
      motivo: veredito.motivo,
    };
  }

  // ── Escrever ──────────────────────────────────────────────────────────
  const falas = await historicoDoEspelho(
    supabase,
    ownerId,
    s.conversation_id,
    MENSAGENS_DO_HISTORICO,
  );
  if (!falas.length) {
    return {
      estado: depoisDe(estado, { tipo: "pulou", motivo: "conversa sem mensagem legível" }),
      motivo: "conversa sem mensagem legível",
    };
  }

  const instrucao = await instrucaoDaLuna(
    supabase,
    ownerId,
    agente,
    (s.anuncio as Anuncio | null) ?? null,
    agora,
    s.id,
    null,
    s.unidade_id ? String(s.unidade_id) : null,
  );

  const mecanismo = mecanismoDaEtapa(etapa.mecanismo, estado.mecanismos, {
    // Sem biblioteca de figurinhas aprovadas ainda: a quebra de padrão vira
    // outra abordagem leve, em vez de fingir uma mídia (teste 13).
    figurinha: false,
    casos: instrucao.casos.length > 0,
  });
  const historico = falas
    .map((f) => `${f.deQuem === "clinica" ? "VOCÊ" : "PACIENTE"}: ${f.texto}`)
    .join("\n");
  const contexto = {
    trilha,
    intensidade: config.trilhas[trilha].intensidade,
    etapa: etapa.passo,
    totalDeEtapas: estado.plano.length,
    mecanismo,
    mecanismosAnteriores: estado.mecanismos,
    perguntaAberta: String(s.recovery_pergunta_aberta ?? ""),
    pessoaJaRespondeu:
      falas.some((f) => f.deQuem === "paciente") && trilha !== "INITIAL_NO_RESPONSE",
    minutosDeSilencio:
      (agora.getTime() - new Date(s.recovery_origem_em ?? agora).getTime()) / 60_000,
    depoisDaNoite: etapa.juntou > 0,
    temCasos: instrucao.casos.length > 0,
  };

  const escrever = async (nota: string): Promise<RetomadaEscrita> =>
    lerRetomada(
      await chamarModelo({
        chave: agente.api_key,
        modelo: agente.model,
        instrucao: instrucao.texto,
        pergunta: pedidoDaRetomada(contexto, historico) + nota,
        maxTokens: MAX_TOKENS,
        formato: FORMATO_DA_RETOMADA,
        nomeDoFormato: "retomada",
        anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "followup", uso, s.id),
      }),
    );

  const jaDitas = (await oQueEuMandei(supabase, s.id, agora, 7 * 24 * 60)).map((m) => m.texto);
  const limpar = (texto: string) => emojiNaMedida(semTravessao(texto), jaDitas);

  let escrita = await escrever("");
  let mensagem = escrita.pular ? "" : limpar(escrita.mensagem);
  // Saiu genérica? Uma segunda chance, dizendo por quê. Genérica de novo, a
  // etapa é pulada: uma mensagem sem motivo é pior que nenhuma.
  if (mensagem && pareceGenerica(mensagem, mecanismo)) {
    escrita = await escrever(
      "\n\nSua primeira versão saiu genérica (soou como 'ainda tem interesse?'). Escreva de novo com um motivo concreto para a pessoa responder, ou responda pular = true.",
    );
    mensagem = escrita.pular ? "" : limpar(escrita.mensagem);
    if (mensagem && pareceGenerica(mensagem, mecanismo)) mensagem = "";
  }
  if (!mensagem) {
    return {
      estado: depoisDe(estado, { tipo: "pulou", motivo: "sem motivo novo para voltar" }),
      motivo: "sem motivo novo para voltar",
    };
  }
  if (jaDisseIssoAgora(mensagem, jaDitas)) {
    return {
      estado: depoisDe(estado, { tipo: "pulou", motivo: "repetiria o que já foi dito" }),
      motivo: "repetiria o que já foi dito",
    };
  }

  // ── A última conferência, logo antes de enviar ────────────────────────
  //
  // A escrita leva segundos. Se a pessoa respondeu ou a equipe entrou nesse
  // meio-tempo, o atendimento já cancelou a sequência, e a linha não está mais
  // "enviando" neste passo.
  const { data: agoraMesmo } = await supabase
    .from("ai_agent_sessions")
    .select("recovery_status, recovery_passo, human_took_over_at, nao_contatar_em")
    .eq("id", s.id)
    .maybeSingle();
  if (
    agoraMesmo?.recovery_status !== "enviando" ||
    Number(agoraMesmo?.recovery_passo) !== estado.passo ||
    agoraMesmo?.human_took_over_at ||
    agoraMesmo?.nao_contatar_em ||
    (await pessoaFalouDepois(ownerId, s.conversation_id, s.recovery_origem_em))
  ) {
    return {
      estado: depoisDe(estado, { tipo: "cancelou", motivo: "mudou enquanto a Luna escrevia" }),
      motivo: "mudou enquanto a Luna escrevia",
    };
  }

  const usado: Mecanismo = (MECANISMOS as readonly string[]).includes(escrita.mecanismoUsado)
    ? (escrita.mecanismoUsado as Mecanismo)
    : mecanismo;
  const caso =
    mecanismo === "SOCIAL_PROOF"
      ? casoEscolhido({ codigo: escrita.casoEnviado }, instrucao.casos)
      : null;
  const midia = caso ? await baixarCaso(supabase, caso) : null;

  // ── Gravar ANTES de enviar ────────────────────────────────────────────
  //
  // A mensagem volta pelo webhook como `from_me`, às vezes antes de o envio
  // terminar. Com a linha já gravada, o atendimento a reconhece pelo texto
  // como eco da Luna, e não como "a equipe assumiu".
  const { data: linha } = await supabase
    .from("ai_agent_messages")
    .insert({
      owner_id: ownerId,
      session_id: s.id,
      direction: "saida",
      content: mensagem,
      skipped_reason: null,
      caso_id: midia ? (caso?.id ?? null) : null,
      recovery_trilha: trilha,
      recovery_passo: etapa.passo,
      recovery_mecanismo: usado,
    })
    .select("id")
    .maybeSingle();

  try {
    const envio = await enviarWhatsapp(
      supabase,
      ownerId,
      { conversation_id: s.conversation_id, phone: telefoneDoJid(s.conversation_id) },
      mensagem,
      midia,
    );
    if (linha?.id && typeof envio?.messageId === "string") {
      await supabase
        .from("ai_agent_messages")
        .update({ wa_message_id: envio.messageId })
        .eq("id", linha.id);
    }
  } catch (e) {
    // Não saiu: a linha sai também, senão a medição contaria um envio que não
    // houve. Uma nova tentativa no próximo minuto, pela conferência de novo.
    if (linha?.id) await supabase.from("ai_agent_messages").delete().eq("id", linha.id);
    const motivo = e instanceof Error ? e.message : String(e);
    return {
      estado: depoisDe(estado, { tipo: "falhou", motivo: motivo.slice(0, 200) }),
      motivo: "falha no envio",
    };
  }

  await debitDailyUsage(supabase, ownerId, `recovery:${agente.id}`, 1);
  return {
    estado: depoisDe(estado, { tipo: "enviou", mecanismo: usado }),
    motivo: "enviada",
    // Para a caixa de entrada e o resto do sistema, a retomada É uma mensagem
    // da clínica. O contador antigo segue valendo para as telas que o leem.
    extras: {
      last_outbound_at: new Date().toISOString(),
      ultimo_followup_em: new Date().toISOString(),
      followups_enviados: Number(s.followups_enviados ?? 0) + 1,
    },
  };
}

/**
 * O minuto em que o follow-up ANTIGO roda.
 *
 * A rotina passou a ser chamada a cada minuto por causa do Recovery Engine. O
 * follow-up antigo (20h e 72h, para quem ainda não ligou o motor novo) foi
 * escrito para rodar de hora em hora, com teto de três por rodada; rodando a
 * cada minuto ele mandaria até 180 por hora. Então ele só roda neste minuto,
 * o mesmo de antes.
 */
const MINUTO_DO_FOLLOWUP_ANTIGO = 43;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { data: agentes, error } = await supabase
      .from("ai_agents")
      .select(
        "id, owner_id, api_key, model, instrucao_base, parcelamento, enabled, circuit_open_until, followup_ligado, followup_horas_1, followup_horas_2, followup_ligado_desde, recovery_config",
      );
    if (error) throw new Error(error.message);

    const minuto = new Date().getUTCMinutes();
    const resultado = [];
    for (const a of (agentes ?? []) as Agente[]) {
      if (configDoAgente(a)) resultado.push(await recuperarDaClinica(a));
      else if (minuto === MINUTO_DO_FOLLOWUP_ANTIGO) resultado.push(await cuidarDaClinica(a));
    }

    return new Response(JSON.stringify({ ok: true, clinicas: resultado }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[agente-followup]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
