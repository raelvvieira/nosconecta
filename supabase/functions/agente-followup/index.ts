// A Luna voltando em quem sumiu: o Recovery Engine.
//
// ── O que roda aqui ─────────────────────────────────────────────────────
//
// A cada minuto: para cada consultório com o Recovery Engine ligado, executa
// a etapa de retomada que venceu em cada conversa. O calendário de cada
// conversa nasce em `atendimento.ts`, quando a Luna responde; as regras estão
// em `_shared/recuperacao.ts` (com `tests/recuperacao.ts`).
//
// ── O que saiu em 30/10 ──────────────────────────────────────────────────
//
// O follow-up simples (um toque em 20h e outro em 72h) morava aqui também,
// de hora em hora, para quem não tinha ligado o motor novo. Fazia o mesmo
// com menos — e, por um filtro errado, não tinha mandado nada desde que foi
// ligado. Ficou um caminho só.
//
// ── Os freios ───────────────────────────────────────────────────────────
//
// **Nasce desligado**: quem liga é a clínica, na tela do Agente.
// **Ligar não acorda o passado** (`ligadoDesde`): só conversa que parar
// depois de ligar recebe retomada.
// **Teto por minuto** (`POR_MINUTO`) e a cota diária do número, a mesma do
// disparo e das campanhas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarModelo } from "../_shared/modelo-de-atendimento.ts";
import { anotarConsumo } from "../_shared/consumo-da-ia.ts";
import { historicoDoEspelho } from "../_shared/historico-da-conversa.ts";
import { variantesDoNumero } from "../_shared/phone-match.ts";
import { telefoneDoJid } from "../_shared/evolution-mapear.ts";
import { enviarFigurinha, enviarWhatsapp } from "../_shared/whatsapp-send.ts";
import { debitDailyUsage, getDailyUsage } from "../_shared/daily-quota.ts";
import { instrucaoDaLuna } from "../_shared/atendimento.ts";
import { semTravessao } from "../_shared/sem-travessao.ts";
import { emojiNaMedida } from "../_shared/emoji-na-medida.ts";
import { jaDisseIssoAgora } from "../_shared/nao-repetir.ts";
import { oQueEuMandei } from "../_shared/historico-da-clinica.ts";
import { type Anuncio } from "../_shared/veio-de-anuncio.ts";
import {
  conferirAntesDeEnviar,
  depoisDe,
  escolherFigurinha,
  figurinhasAprovadas,
  podeUsarFigurinha,
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
import { soOSistema } from "../_shared/so-o-sistema.ts";
import { semIaNoConsultorio } from "../_shared/plano-no-banco.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** A conversa inteira vai ao modelo: uma retomada que erra o que já foi
 *  combinado é pior que nenhuma. */
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
  recovery_figurinhas: unknown;
};

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

  const figurinhas = figurinhasAprovadas(agente.recovery_figurinhas);
  const mecanismo = mecanismoDaEtapa(etapa.mecanismo, estado.mecanismos, {
    // Sem figurinha aprovada (ou já usada nesta sequência), a quebra de padrão
    // vira outra abordagem leve, em vez de fingir uma mídia (teste 13).
    figurinha: podeUsarFigurinha({ trilha, usados: estado.mecanismos, aprovadas: figurinhas }),
    casos: instrucao.casos.length > 0,
  });

  // A conversa mudou enquanto esta etapa era preparada? Se a pessoa respondeu
  // ou a equipe entrou, o atendimento já cancelou a sequência, e a linha não
  // está mais "enviando" neste passo.
  const mudouAgora = async (): Promise<boolean> => {
    const { data: agoraMesmo } = await supabase
      .from("ai_agent_sessions")
      .select("recovery_status, recovery_passo, human_took_over_at, nao_contatar_em")
      .eq("id", s.id)
      .maybeSingle();
    return (
      agoraMesmo?.recovery_status !== "enviando" ||
      Number(agoraMesmo?.recovery_passo) !== estado.passo ||
      !!agoraMesmo?.human_took_over_at ||
      !!agoraMesmo?.nao_contatar_em ||
      (await pessoaFalouDepois(ownerId, s.conversation_id, s.recovery_origem_em))
    );
  };

  // ── A figurinha: sem modelo, sem texto ─────────────────────────────────
  if (mecanismo === "PATTERN_INTERRUPT") {
    const { data: jaMandadas } = await supabase
      .from("ai_agent_messages")
      .select("content")
      .eq("session_id", s.id)
      .like("content", "[figurinha %");
    const recebidas = (jaMandadas ?? []).map((m: { content: string }) =>
      String(m.content).slice(11, -1),
    );
    const figurinha = escolherFigurinha(figurinhas, recebidas, Math.random());
    const arquivo = figurinha
      ? await supabase.storage.from("wa-midia").download(figurinha.path)
      : null;
    if (figurinha && arquivo?.data) {
      if (await mudouAgora()) {
        return {
          estado: depoisDe(estado, { tipo: "cancelou", motivo: "mudou enquanto a Luna preparava" }),
          motivo: "mudou enquanto a Luna preparava",
        };
      }
      // Gravada ANTES de enviar, como o texto: o eco da figurinha volta sem
      // texto, e é esta linha que diz ao atendimento que foi a Luna.
      const { data: linha } = await supabase
        .from("ai_agent_messages")
        .insert({
          owner_id: ownerId,
          session_id: s.id,
          direction: "saida",
          content: `[figurinha ${figurinha.id}]`,
          skipped_reason: null,
          recovery_trilha: trilha,
          recovery_passo: etapa.passo,
          recovery_mecanismo: "PATTERN_INTERRUPT",
        })
        .select("id")
        .maybeSingle();
      try {
        const envio = await enviarFigurinha(
          supabase,
          ownerId,
          { conversation_id: s.conversation_id, phone: telefoneDoJid(s.conversation_id) },
          new Uint8Array(await arquivo.data.arrayBuffer()),
        );
        if (linha?.id && typeof envio?.messageId === "string") {
          await supabase
            .from("ai_agent_messages")
            .update({ wa_message_id: envio.messageId })
            .eq("id", linha.id);
        }
      } catch (e) {
        if (linha?.id) await supabase.from("ai_agent_messages").delete().eq("id", linha.id);
        const motivo = e instanceof Error ? e.message : String(e);
        return {
          estado: depoisDe(estado, { tipo: "falhou", motivo: motivo.slice(0, 200) }),
          motivo: "falha no envio",
        };
      }
      await debitDailyUsage(supabase, ownerId, `recovery:${agente.id}`, 1);
      const quando = new Date().toISOString();
      return {
        estado: depoisDe(estado, { tipo: "enviou", mecanismo: "PATTERN_INTERRUPT" }),
        motivo: "enviada",
        extras: {
          last_outbound_at: quando,
          ultimo_followup_em: quando,
          followups_enviados: Number(s.followups_enviados ?? 0) + 1,
        },
      };
    }
    // O arquivo sumiu do depósito: a etapa segue em texto leve, sem fingir.
    return executarEtapa(
      { ...agente, recovery_figurinhas: [] },
      config,
      dias,
      s,
      estado,
      etapa,
      trilha,
      agora,
    );
  }
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
  if (await mudouAgora()) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const { data: agentes, error } = await supabase
      .from("ai_agents")
      .select(
        "id, owner_id, api_key, model, instrucao_base, parcelamento, enabled, circuit_open_until, followup_ligado, followup_horas_1, followup_horas_2, followup_ligado_desde, recovery_config, recovery_figurinhas",
      );
    if (error) throw new Error(error.message);

    const resultado = [];
    for (const a of (agentes ?? []) as Agente[]) {
      // Um consultório não derruba os outros: o erro de um vira a linha dele
      // no resultado, e a rodada segue.
      try {
        // Plano básico, suspenso ou teste vencido: ninguém é retomado.
        const semIa = await semIaNoConsultorio(supabase, a.owner_id, new Date());
        if (semIa) resultado.push({ ownerId: a.owner_id, motivo: semIa });
        // Só o Recovery Engine. O follow-up simples (20h e 72h) saiu em 30/10:
        // fazia o mesmo com menos, e os dois ligados juntos mandariam
        // retomada dobrada.
        else if (configDoAgente(a)) resultado.push(await recuperarDaClinica(a));
        else resultado.push({ ownerId: a.owner_id, motivo: "Recovery Engine desligado" });
      } catch (e) {
        console.error(`[agente-followup] falhou em ${a.owner_id}:`, e);
        resultado.push({ ownerId: a.owner_id, motivo: e instanceof Error ? e.message : "falhou" });
      }
    }

    return new Response(JSON.stringify({ ok: true, clinicas: resultado }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[agente-followup]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
