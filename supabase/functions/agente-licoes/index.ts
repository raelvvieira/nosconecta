// A Luna olhando para as conversas que ela já conduziu.
//
// ── O que roda aqui ─────────────────────────────────────────────────────
//
// De hora em hora: pega as conversas da Luna que terminaram e ainda não foram
// avaliadas, descobre se viraram consulta, e pede a ela mesma a lição — o que
// funcionou, o que faltou, e o que mudar no manual. Uma lição por conversa,
// gravada em `ai_agent_licoes` para uma pessoa ler.
//
// ── Por que uma função só para isso ─────────────────────────────────────
//
// `ai-playbook` é o que a TELA chama, e toda ação dela exige `ownerId` porque
// quem pergunta é alguém logado. Um cron não tem dono: ele varre todas as
// clínicas. Enfiar isso lá dentro obrigaria a inventar um `ownerId` fixo no
// agendamento do cron — que é exatamente o tipo de constante que fica errada
// quando entra a segunda clínica.
//
// ── O que NÃO acontece aqui ─────────────────────────────────────────────
//
// Nenhuma mensagem é enviada, nenhum manual é sobrescrito. A lição é texto para
// uma pessoa decidir. Reescrever o LUNA V1 sozinha seria a IA editando a própria
// instrução a partir da leitura que ela fez de si mesma, sem ninguém olhando.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarModelo } from "../_shared/modelo-de-atendimento.ts";
import { historicoDoEspelho } from "../_shared/historico-da-conversa.ts";
import { variantesDoNumero } from "../_shared/phone-match.ts";
import { telefoneDoJid } from "../_shared/evolution-mapear.ts";
import {
  FORMATO_DA_LICAO,
  desfechoDaSessao,
  licaoDoJson,
  promptDaLicao,
  type Desfecho,
} from "../_shared/licoes-do-atendimento.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Quantas conversas por rodada.
 *
 * Cada lição é uma chamada de modelo com o manual inteiro dentro. Seis cabem
 * com folga no tempo de uma Edge Function; o que não for avaliado agora é
 * avaliado na hora seguinte, e nada se perde porque o critério de "encerrada"
 * não expira.
 */
const POR_RODADA = 6;

/** Até quando vale a pena olhar para trás. Conversa de mês passado não rende
 *  lição sobre o jeito de atender de hoje, e renderia chamada de modelo. */
const DIAS_PARA_TRAS = 30;

/** A conversa inteira, não só as últimas. Uma lição sobre "o que faltou" tirada
 *  do fim da conversa erraria o começo, que é onde a condução se decide. */
const MENSAGENS_DA_TRANSCRICAO = 60;

async function avaliarClinica(agente: {
  id: string;
  owner_id: string;
  api_key: string | null;
  model: string | null;
  instrucao_base: string | null;
}) {
  const ownerId = agente.owner_id;

  // Sem modelo escolhido não há como avaliar. Não é erro: é uma clínica que
  // ainda não configurou a IA.
  if (!agente.model) return { ownerId, motivo: "sem modelo escolhido" };

  const desde = new Date(Date.now() - DIAS_PARA_TRAS * 86_400_000).toISOString();

  // As conversas em que a Luna FALOU. `last_outbound_at` nulo quer dizer que ela
  // nunca respondeu ali — não há conversa dela para avaliar.
  const { data: sessoes, error } = await supabase
    .from("ai_agent_sessions")
    .select(
      "id, conversation_id, contact_name, created_at, last_inbound_at, last_outbound_at, human_took_over_at, anuncio",
    )
    .eq("agent_id", agente.id)
    .not("last_outbound_at", "is", null)
    .gte("created_at", desde)
    .order("last_outbound_at", { ascending: false })
    .limit(200);
  if (error) return { ownerId, erro: error.message };
  if (!sessoes?.length) return { ownerId, motivo: "nenhuma conversa conduzida" };

  // As que já têm lição saem antes de qualquer consulta cara. O índice único em
  // `session_id` é a garantia de verdade; isto é só para não gastar à toa.
  const { data: jaAvaliadas } = await supabase
    .from("ai_agent_licoes")
    .select("session_id")
    .eq("owner_id", ownerId)
    .limit(2000);
  const avaliadas = new Set((jaAvaliadas ?? []).map((l: { session_id: string }) => l.session_id));

  const agora = new Date();
  let gravadas = 0;
  const desfechos: Record<string, number> = {};

  for (const s of sessoes) {
    if (gravadas >= POR_RODADA) break;
    if (avaliadas.has(s.id)) continue;

    // ── Virou consulta? ───────────────────────────────────────────────
    //
    // Pelo telefone, e a partir do início da conversa: quem vem de anúncio não
    // tem ficha quando escreve, e a ficha nasce junto com o agendamento.
    const variantes = variantesDoNumero(telefoneDoJid(s.conversation_id));
    let agendamento: { appointment_id: string } | null = null;
    if (variantes.length) {
      const { data: achados, error: erroRpc } = await supabase.rpc("agendamento_criado_apos", {
        _owner: ownerId,
        _variantes: variantes,
        _desde: s.created_at,
      });
      // Erro de leitura NÃO pode virar "não agendou": gravaria uma lição
      // negativa sobre uma conversa que deu certo, e a IA aprenderia a se
      // culpar por um banco instável. Sem resposta, esta conversa espera a
      // próxima rodada.
      if (erroRpc) {
        console.warn(`[licoes] agendamento de ${s.conversation_id}:`, erroRpc.message);
        continue;
      }
      agendamento = (achados ?? [])[0] ?? null;
    }

    const ultimaMensagemEm =
      [s.last_inbound_at, s.last_outbound_at].filter(Boolean).sort().slice(-1)[0] ?? null;

    const desfecho: Desfecho | null = desfechoDaSessao(
      {
        falouAlgumaVez: !!s.last_outbound_at,
        ultimaMensagemEm,
        agendou: !!agendamento,
        humanoAssumiu: !!s.human_took_over_at,
      },
      agora,
    );
    if (!desfecho) continue;

    const falas = await historicoDoEspelho(
      supabase,
      ownerId,
      s.conversation_id,
      MENSAGENS_DA_TRANSCRICAO,
    );
    // Conversa sem mensagem legível no espelho não rende lição nenhuma, e
    // gravaria uma lição inventada a partir de nada.
    if (falas.length < 2) continue;

    const transcricao = falas
      .map((f) => `${f.deQuem === "clinica" ? "VOCÊ" : "A PESSOA"}: ${f.texto}`)
      .join("\n");

    const anuncio = (s.anuncio ?? null) as { copy?: string | null } | null;

    let texto: string;
    try {
      texto = await chamarModelo({
        chave: agente.api_key,
        modelo: agente.model,
        pergunta: promptDaLicao({
          desfecho,
          nomeDoContato: s.contact_name ?? null,
          anuncio: anuncio?.copy ?? null,
          transcricao,
          manual: agente.instrucao_base ?? null,
          humanoAssumiu: !!s.human_took_over_at,
          agendou: !!agendamento,
        }),
        maxTokens: 2000,
        formato: FORMATO_DA_LICAO,
        nomeDoFormato: "licao_do_atendimento",
      });
    } catch (e) {
      // Uma clínica com chave vencida não pode derrubar a rodada das outras.
      console.error(`[licoes] modelo falhou para ${ownerId}:`, e instanceof Error ? e.message : e);
      break;
    }

    // Texto vazio é recusa do modelo. Recusa não vira lição em branco na tela.
    if (!texto) continue;

    let licao;
    try {
      licao = licaoDoJson(JSON.parse(texto));
    } catch {
      console.warn(`[licoes] resposta ilegível na conversa ${s.conversation_id}`);
      continue;
    }

    // `ignoreDuplicates`: duas rodadas sobrepostas não podem gravar duas lições
    // da mesma conversa. O índice único em `session_id` é quem decide.
    const { error: erroGravar } = await supabase.from("ai_agent_licoes").upsert(
      {
        owner_id: ownerId,
        session_id: s.id,
        conversation_id: s.conversation_id,
        contact_name: s.contact_name ?? null,
        desfecho,
        appointment_id: agendamento?.appointment_id ?? null,
        humano_assumiu: !!s.human_took_over_at,
        o_que_funcionou: licao.oQueFuncionou || null,
        o_que_faltou: licao.oQueFaltou || null,
        motivo: licao.motivo,
        momento_decisivo: licao.momentoDecisivo || null,
        sugestao: licao.sugestao || null,
        confianca: licao.confianca,
        mensagens: falas.length,
      },
      { onConflict: "session_id", ignoreDuplicates: true },
    );
    if (erroGravar) {
      console.error(`[licoes] não gravou ${s.id}:`, erroGravar.message);
      continue;
    }

    gravadas++;
    desfechos[desfecho] = (desfechos[desfecho] ?? 0) + 1;
  }

  return { ownerId, gravadas, desfechos };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    // Uma clínica por linha de `ai_agents`. Sem filtro por `enabled`: a Luna
    // pode ter sido pausada DEPOIS de conduzir conversas, e essas conversas
    // continuam tendo lição para dar — inclusive a lição de por que ela foi
    // pausada.
    const { data: agentes, error } = await supabase
      .from("ai_agents")
      .select("id, owner_id, api_key, model, instrucao_base");
    if (error) throw new Error(error.message);

    const resultado = [];
    for (const a of agentes ?? []) resultado.push(await avaliarClinica(a));

    return new Response(JSON.stringify({ ok: true, clinicas: resultado }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[agente-licoes]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
