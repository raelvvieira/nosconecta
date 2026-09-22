// Envio individual de mensagem no WhatsApp — extraída de
// `whatsapp-broadcast/index.ts` (onde nasceu) pra ser reaproveitada também por
// `atendimento-automations/index.ts` (ação "Enviar WhatsApp" de uma automação)
// e por `wa-enviar` (o chat). `supabase` é sempre parâmetro explícito, nunca
// client de módulo por closure, porque este arquivo é importado por mais de
// uma função e cada uma tem o seu.
import type { AlvoDeEnvio } from "./alvo-de-envio.ts";
import { conexaoParaEnviar, evolutionFetch } from "./evolution-api.ts";
import { explicarSemConexao } from "./evolution-rota.ts";
import { gravarMensagemEspelhada, mensagemEnviada } from "./espelho-evolution.ts";
import {
  corpoDeMidia,
  corpoDeTexto,
  destinoDaMensagem,
  paraBase64,
  rota,
} from "./evolution-enviar.ts";

// O tipo do alvo mora em `alvo-de-envio.ts`, junto da conta pura que o monta —
// ver lá por que a decisão de "para quem vai" precisou sair daqui. Reexportado
// para quem já importava daqui não ter de mudar.
export type { AlvoDeEnvio };

/** Imagem enviada JUNTO do texto, como legenda de uma mensagem só. */
export interface MidiaDeEnvio {
  nome: string;
  tipo: string;
  bytes: Uint8Array;
}

/** Manda uma mensagem, devolvendo por qual caminho saiu.
 *
 *  `midiaIgnorada` vem preenchido quando havia imagem para mandar e ela não
 *  saiu — é o que impede a foto de sumir em silêncio. Os dois caminhos (com e
 *  sem conversa aberta) sabem levar imagem legendada hoje, então isso só
 *  aparece se o CRM recusar o anexo. */
export async function enviarWhatsapp(
  supabase: any,
  ownerId: string,
  alvo: AlvoDeEnvio,
  message: string,
  midia?: MidiaDeEnvio | null,
): Promise<{ via: string; midiaIgnorada?: string }> {
  // ── Por onde sai ────────────────────────────────────────────────────
  //
  // Um número de WhatsApp só existe numa sessão por vez: no instante em que o
  // número da clínica for pareado na Evolution própria, o CRM perde a sessão
  // e tudo que sair por ele cai no vazio. A decisão está em
  // `evolution-rota.ts`, e ela é tomada pelo ESTADO das duas conexões — não
  // por uma chave que alguém precisa lembrar de virar.
  // Qual conexão atende.
  //
  // Isto já escolheu entre duas — o CRM e a conexão própria. Hoje a pergunta é
  // outra e continua não sendo trivial: mais de uma sessão aberta significa
  // que alguém pareou um chip de teste, e mandar por ele é falar com paciente
  // pelo número errado. A regra mora em `evolution-rota.ts`, com teste.
  const { instancia, motivo } = await conexaoParaEnviar(supabase, ownerId);
  if (!instancia) throw new Error(explicarSemConexao(motivo));
  return await enviarPelaEvolution(supabase, ownerId, instancia, alvo, message, midia);
}

// ── O caminho da Evolution ────────────────────────────────────────────────

/**
 * Manda pela Evolution própria.
 *
 * A diferença que organiza tudo: o CRM endereça por ID DE CONTATO, a Evolution
 * por NÚMERO. Não existe "abrir conversa" aqui — no WhatsApp a conversa é o
 * número, e mandar para alguém que nunca escreveu é a mesma chamada de
 * responder a quem escreveu agora.
 *
 * Sem número não há envio, e isso vira erro em vez de silêncio: a linha da
 * fila guarda o motivo, e alguém conserta o cadastro. Cair de volta no CRM
 * seria pior — quando este caminho está valendo, é porque o CRM não tem mais
 * a sessão, e o "enviado" dele seria mentira.
 */
export async function enviarPelaEvolution(
  supabase: any,
  ownerId: string,
  instancia: string,
  alvo: AlvoDeEnvio,
  message: string,
  midia?: MidiaDeEnvio | null,
): Promise<{ via: string; midiaIgnorada?: string }> {
  const destino = await destinoDoAlvo(supabase, ownerId, alvo);
  if (!destino) {
    throw new Error(
      "Sem número de WhatsApp para este contato — não dá para enviar pela conexão própria.",
    );
  }

  if (midia) {
    const resposta = await evolutionFetch(rota("sendMedia", instancia), {
      method: "POST",
      body: JSON.stringify(
        corpoDeMidia(
          destino,
          { nome: midia.nome, tipo: midia.tipo, base64: paraBase64(midia.bytes) },
          message,
        ),
      ),
    });
    await espelharEnviada(supabase, ownerId, resposta);
    return { via: "evolution_midia" };
  }

  const resposta = await evolutionFetch(rota("sendText", instancia), {
    method: "POST",
    body: JSON.stringify(corpoDeTexto(destino, message)),
  });
  await espelharEnviada(supabase, ownerId, resposta);
  return { via: "evolution" };
}

/**
 * A mensagem que acabou de sair também entra no espelho.
 *
 * Sem isto, ela chega no WhatsApp de quem recebe e NÃO aparece na conversa de
 * quem mandou: o webhook avisa o que chega, e o que sai pela API da Evolution
 * vem por outro evento, que ele não escuta.
 *
 * Gravar aqui é imediato e não depende de ligar mais um evento na VPS. Se o
 * webhook ainda entregar a mesma mensagem, o upsert pelo id não duplica.
 *
 * Falha aqui NÃO derruba o envio: a mensagem já está no celular do paciente, e
 * dizer "não enviou" faria alguém mandar de novo. Fica no log e some da tela
 * até o espelho ser recopiado.
 */
async function espelharEnviada(supabase: any, ownerId: string, resposta: unknown) {
  try {
    const m = mensagemEnviada(resposta);
    if (!m) {
      console.warn("[whatsapp-send] resposta da Evolution sem id; nada a espelhar");
      return;
    }
    await gravarMensagemEspelhada(supabase, ownerId, m, resposta);
  } catch (e) {
    console.error("[whatsapp-send] enviada mas não espelhada:", e);
  }
}

/**
 * O número de quem vai receber.
 *
 * Em ordem de confiança: o que quem chamou já tinha; o `remoteJid`, quando a
 * conversa nasceu na própria Evolution; o espelho; e a ficha do paciente.
 * Cada degrau abaixo é uma consulta a mais, e todos podem não achar nada —
 * o que não pode é chutar.
 */
async function destinoDoAlvo(
  supabase: any,
  ownerId: string,
  alvo: AlvoDeEnvio,
): Promise<string | null> {
  const doChamador = destinoDaMensagem(alvo.phone);
  if (doChamador) return doChamador;

  // Conversa da Evolution: o id DELA é o próprio jid.
  if (alvo.conversation_id?.includes("@")) {
    const doJid = destinoDaMensagem(alvo.conversation_id);
    if (doJid) return doJid;
  }

  // Pela CONVERSA — que é o único dado que o chat tem em mãos.
  //
  // `wa-enviar/handleSend` chama daqui sem `contact_id`: a tela manda o id da
  // conversa, não o do contato. Numa conversa ANTIGA — das que foram copiadas
  // do CRM antes de ele sair — esse id é um UUID ("1edf217b-baf2-4288-a1b8-
  // 00c43bbb0ef1"), sem "@", então os dois degraus acima não pegam e os dois
  // abaixo procuram por um contato vazio.
  //
  // Medido no banco: das 969 linhas da caixa de entrada, 961 abrem uma
  // conversa antiga — é a mais recente de cada pessoa. Sem este degrau, o
  // envio falharia em praticamente toda a caixa dizendo "sem número", e a
  // culpa pareceria ser do cadastro do paciente.
  //
  // A view já junta conversa e contato pelas três colunas da chave natural e
  // entrega o telefone normalizado. É a mesma ponte que a thread usa para
  // achar as conversas irmãs de um número.
  if (alvo.conversation_id) {
    const { data: pessoa } = await supabase
      .from("wa_conversas_por_pessoa")
      .select("phone_e164")
      .eq("owner_id", ownerId)
      .eq("crm_conversation_id", alvo.conversation_id)
      .limit(1)
      .maybeSingle();
    const daConversa = destinoDaMensagem(pessoa?.phone_e164);
    if (daConversa) return daConversa;
  }

  // Os dois últimos degraus procuram pelo contato do CRM. Sem ele não há o que
  // procurar: `.eq("crm_contact_id", undefined)` não é "nenhum resultado", é
  // uma consulta malformada — e quem chama leria o erro como "sem número".
  if (!alvo.contact_id) return null;

  const { data: contato } = await supabase
    .from("wa_contacts")
    .select("phone_e164, phone_raw")
    .eq("owner_id", ownerId)
    .eq("crm_contact_id", alvo.contact_id)
    .limit(1)
    .maybeSingle();
  const doEspelho = destinoDaMensagem(contato?.phone_e164 ?? contato?.phone_raw);
  if (doEspelho) return doEspelho;

  const { data: paciente } = await supabase
    .from("patients")
    .select("phone")
    .eq("owner_id", ownerId)
    .eq("crm_contact_id", alvo.contact_id)
    .limit(1)
    .maybeSingle();
  return destinoDaMensagem(paciente?.phone);
}
