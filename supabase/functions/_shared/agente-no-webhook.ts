// O agente de IA atendendo pela conexão própria.
//
// ── O que isto substitui ────────────────────────────────────────────────
//
// A Edge Function `ai-agent-webhook`, que o CRM chamava a cada mensagem de
// paciente. Quando o número saiu do CRM, em 18/09, ela parou de receber
// qualquer coisa — o agente ficou sem entrada, e ninguém notou porque ele
// estava desligado.
//
// ── Por que um arquivo, e não código dentro do webhook ──────────────────
//
// `wa-webhook` tem uma responsabilidade que não pode falhar: gravar a mensagem
// do paciente. O agente é o oposto — ele é opcional, chama um modelo de fora,
// demora segundos e pode dar erro. Misturar os dois no mesmo bloco faria uma
// falha do agente derrubar a gravação, e a Evolution reenviaria o evento, e a
// mensagem entraria duas vezes.
//
// Aqui embaixo, nada do que acontece pode subir. O pior caso é o agente não
// responder, com o motivo no log.
import { atender, type MensagemDeEntrada } from "./atendimento.ts";
import { ehConversaNova, primeiraMensagemDaPessoa } from "./conversa-nova.ts";
import { ehPacienteDoContato } from "./quem-e-paciente.ts";
import { historicoDoEspelho } from "./historico-da-conversa.ts";
import { responderPaciente } from "./modelo-de-atendimento.ts";
import { enviarWhatsapp } from "./whatsapp-send.ts";
import type { MensagemEspelhada } from "./evolution-mapear.ts";

/** Espera de verdade antes de mandar o pedaço — é o tempo de digitação. */
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deixa o agente responder, se for o caso dele responder.
 *
 * Quem decide é `atender`, e dentro dele `decidirSeResponde` — agente
 * desligado, grupo, paciente, conversa antiga, mensagem da própria clínica,
 * nota interna, disjuntor aberto e conversa assumida por uma pessoa saem todos
 * por lá, cada um com o motivo gravado em `ai_agent_messages.skipped_reason`.
 *
 * Aqui só se RESOLVEM os fatos que a decisão precisa e que ela, sendo pura,
 * não tem como buscar: se a pessoa tem ficha e se a conversa nasceu há pouco.
 *
 * Nada aqui levanta: o webhook já gravou a mensagem, e uma falha do agente não
 * pode fazer a Evolution reenviar o evento.
 */
export async function deixarOAgenteResponder(
  supabase: any,
  ownerId: string,
  m: MensagemEspelhada,
): Promise<void> {
  try {
    // A chave da clínica, gravada na tela do agente. Vazia = cai no segredo do
    // ambiente, que é onde ela morava antes de a tela existir.
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("api_key, novo_ate_dias")
      .eq("owner_id", ownerId)
      .maybeSingle();
    const chave: string | null = agente?.api_key ?? null;

    // Os dois fatos, em paralelo: são consultas independentes e a mensagem do
    // paciente já está esperando resposta.
    const [ehPaciente, primeiraEm] = await Promise.all([
      ehPacienteDoContato(supabase, ownerId, m.crmContactId),
      primeiraMensagemDaPessoa(supabase, ownerId, m.crmConversationId),
    ]);

    const entrada: MensagemDeEntrada = {
      conversationId: m.crmConversationId,
      contactId: m.crmContactId,
      contactName: m.contactName,
      conteudo: m.body,
      daClinica: m.fromMe,
      // A conexão própria não tem nota interna do lado de fora: o que chega
      // pelo webhook é sempre mensagem de verdade.
      privada: false,
      ehGrupo: m.ehGrupo,
      ehPaciente,
      // A janela vale a partir da PRIMEIRA mensagem da pessoa. Funciona porque
      // `deixarOAgenteResponder` roda DEPOIS de `gravarMensagemEspelhada` no
      // webhook: a mensagem que acabou de chegar já está no espelho. Antecipar
      // esta chamada faria a consulta voltar vazia para todo contato novo — e
      // "vazia" quer dizer "nova", então por sorte ainda daria certo, mas por
      // motivo errado. Não antecipar.
      conversaNova: ehConversaNova(primeiraEm, new Date(), Number(agente?.novo_ate_dias ?? 7)),
    };

    const resultado = await atender(
      {
        supabase,
        ownerId,
        historico: (conversationId) => historicoDoEspelho(supabase, ownerId, conversationId),
        responderComIa: (instrucao, historico, mensagem) =>
          responderPaciente(instrucao, historico, mensagem, chave),
        enviar: async (pedaco, esperaMs) => {
          // A espera é o tempo de digitação. Acontece de verdade aqui — é o
          // que faz a resposta não chegar como um bloco instantâneo.
          await dormir(esperaMs);
          // O telefone vai junto, e é seguro: medido no banco, toda conversa
          // que chega pelo webhook é `@s.whatsapp.net` (telefone de verdade)
          // ou `@g.us` (grupo, que o filtro barra antes daqui). Os 1.962
          // contatos que o WhatsApp identifica por `@lid` são PARTICIPANTES de
          // grupo, e nenhum deles é uma conversa — se um dia fossem, o lid
          // tem 14 ou 15 dígitos e passaria por `numeroParaEnvio` como se
          // fosse um número internacional, mandando a resposta para um
          // estranho.
          await enviarWhatsapp(
            supabase,
            ownerId,
            { conversation_id: m.crmConversationId, phone: m.phone },
            pedaco,
          );
        },
      },
      entrada,
    );

    if (!resultado.respondeu && resultado.motivo) {
      console.log(`[agente] não respondeu (${resultado.motivo}) em ${m.crmConversationId}`);
    }
  } catch (e) {
    console.error("[agente] falhou:", e instanceof Error ? e.message : e);
  }
}
