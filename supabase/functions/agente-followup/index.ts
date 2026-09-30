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
import { jaDisseIssoAgora } from "../_shared/nao-repetir.ts";
import { oQueEuMandei } from "../_shared/historico-da-clinica.ts";
import {
  decidirFollowup,
  dentroDaJanela,
  promptDoFollowup,
  RITMO_PADRAO_DO_FOLLOWUP,
  type DiaDaJornada,
} from "../_shared/followup-do-agente.ts";

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
    const instrucao = await instrucaoDaLuna(
      supabase,
      ownerId,
      agente,
      (s.anuncio as Record<string, unknown> | null) ?? null,
      agora,
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

    const mensagem = semTravessao(String(texto ?? "").trim());
    if (!mensagem) {
      registrar("o modelo preferiu não escrever");
      continue;
    }

    // A mesma rede do atendimento: um follow-up que repete o que já foi dito é
    // pior que nenhum. A janela é larga aqui (48h) porque o que não pode
    // repetir é a MENSAGEM ANTERIOR da conversa, não uma de minutos atrás.
    const jaDitas = await oQueEuMandei(supabase, s.id, agora, 48 * 60);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { data: agentes, error } = await supabase
      .from("ai_agents")
      .select(
        "id, owner_id, api_key, model, instrucao_base, parcelamento, enabled, circuit_open_until, followup_ligado, followup_horas_1, followup_horas_2, followup_ligado_desde",
      );
    if (error) throw new Error(error.message);

    const resultado = [];
    for (const a of agentes ?? []) resultado.push(await cuidarDaClinica(a));

    return new Response(JSON.stringify({ ok: true, clinicas: resultado }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[agente-followup]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
