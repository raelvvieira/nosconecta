// Envio individual de mensagem WhatsApp pra um contato do CRM — extraída de
// `whatsapp-broadcast/index.ts` (onde nasceu) pra ser reaproveitada também
// por `atendimento-automations/index.ts` (ação "Enviar WhatsApp" de uma
// automação). Mesmo padrão de injeção de dependência de `_shared/crm-auth.ts`
// (`crmFetch(supabase, ownerId, ...)`  — `supabase` é sempre parâmetro
// explícito, nunca client de módulo por closure, porque este arquivo é
// importado por mais de uma função e cada uma tem o seu.
import { crmFetch } from "./crm-auth.ts";
import type { AlvoDeEnvio } from "./alvo-de-envio.ts";
import { unwrap } from "./crm-client.ts";
import { decidirCaminho, evolutionFetch } from "./evolution-api.ts";
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
  const { caminho, instancia } = await decidirCaminho(supabase, ownerId);
  if (caminho === "evolution" && instancia) {
    return await enviarPelaEvolution(supabase, ownerId, instancia, alvo, message, midia);
  }

  if (alvo.conversation_id) {
    // Caminho CONFIRMADO: é o mesmo que o chat usa para responder alguém.
    //
    // Com imagem, o endpoint troca de JSON para multipart e o texto vai em
    // `content` na MESMA requisição — é assim que sai uma mensagem só, com a
    // foto legendada, e não duas mensagens seguidas. Idêntico ao que
    // `crm-conversations/handleSend` já faz para o anexo do chat.
    if (midia) {
      const form = new FormData();
      form.append("content", message);
      form.append("message_type", "outgoing");
      form.append("private", "false");
      form.append(
        "attachments[]",
        new File([midia.bytes as BlobPart], midia.nome, {
          type: midia.tipo || "application/octet-stream",
        }),
      );
      await crmFetch(supabase, ownerId, `/api/v1/conversations/${alvo.conversation_id}/messages`, {
        method: "POST",
        body: form,
      });
      return { via: "conversation_midia" };
    }

    await crmFetch(supabase, ownerId, `/api/v1/conversations/${alvo.conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: message, message_type: "outgoing", private: false }),
    });
    return { via: "conversation" };
  }

  // Daqui para baixo tudo endereça pelo id de contato do CRM, e ele passou a
  // ser opcional. Sem ele não há o que tentar: melhor dizer isso do que mandar
  // `undefined` para o CRM e receber um 404 que não explica nada.
  const contatoNoCrm = alvo.contact_id;
  if (!contatoNoCrm) {
    throw new Error(
      "Sem contato no CRM e sem conversa aberta — não há por onde mandar por esse caminho.",
    );
  }

  // Sem conversa ainda: cria a conversa direto — caminho validado pelo time do
  // CRM (18/08) com disparo real entregue. Uma chamada só vincula contato↔inbox
  // (a partir do telefone), abre a conversa e manda a mensagem de saída. Troca
  // o antigo caminho especulativo via /scheduled_actions (nunca confirmado
  // funcionando sozinho por contato — o uso real desse endpoint, em
  // crm-conversations/index.ts, sempre exige conversation_id).
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("inbox_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const inboxId: string | null = cred?.inbox_id ?? null;
  if (!inboxId) {
    throw new Error(
      "Caixa de WhatsApp não encontrada para iniciar a conversa. Reconecte o número em Atendimentos → Conectar.",
    );
  }

  // ── Antes de abrir conversa nova, perguntar se já existe uma ───────────
  //
  // A decisão de "esta pessoa não tem conversa" foi tomada no navegador, minutos
  // antes, e congelada na coluna `conversation_id` da fila. Ela erra em pelo
  // menos dois casos reais:
  //
  //  - dois alvos do mesmo contato entraram na fila (o bug de 31/08). O
  //    primeiro cria a conversa; o segundo ainda acha que não existe nenhuma e
  //    cria a segunda.
  //  - a leitura de conversas truncou (teto de 5000 ou 45s em
  //    `crm-conversations`) e quem tem conversa foi lido como se não tivesse.
  //
  // Reusar também conversa RESOLVIDA é de propósito: é a mesma pessoa e o
  // mesmo histórico. Abrir outra por ela estar encerrada é exatamente como a
  // caixa de entrada enche de linhas repetidas.
  const existente = await conversaExistente(supabase, ownerId, contatoNoCrm);
  if (existente) {
    return await enviarWhatsapp(
      supabase,
      ownerId,
      { ...alvo, conversation_id: existente },
      message,
      midia,
    );
  }

  // NÃO mandar `source_id`: o CRM deriva do telefone do contato, e um valor
  // próprio faz a requisição ser recusada (confirmado pelo time do CRM, 18/08).
  //
  // Com imagem, este endpoint também aceita multipart — os campos aninhados vão
  // como `message[content]` e `message[attachments][]` (confirmado pelo time do
  // CRM, 25/08). Sai UMA mensagem com a foto legendada, sem precisar criar a
  // conversa e mandar o anexo depois, que seriam duas mensagens no WhatsApp de
  // quem recebe.
  if (midia) {
    const form = new FormData();
    form.append("contact_id", contatoNoCrm);
    form.append("inbox_id", inboxId);
    form.append("message[content]", message);
    form.append(
      "message[attachments][]",
      new File([midia.bytes as BlobPart], midia.nome, {
        type: midia.tipo || "application/octet-stream",
      }),
    );
    try {
      await crmFetch(supabase, ownerId, "/api/v1/conversations", { method: "POST", body: form });
      return { via: "conversation_nova_midia" };
    } catch (e) {
      // O time do CRM validou este caminho na camada do Rails, não de ponta a
      // ponta por HTTP com token — e avisou disso. Se ele for RECUSADO (4xx), a
      // conversa não chegou a ser criada, então dá pra cair no JSON de sempre e
      // a pessoa recebe ao menos o texto, com o motivo da foto faltar gravado
      // na linha do alvo.
      //
      // Só em 4xx. Num 5xx ou timeout não dá pra saber se a conversa foi criada
      // antes de a resposta se perder, e repetir mandaria a mensagem duas vezes
      // — pior do que falhar.
      const status = Number((e as any)?.status ?? 0);
      if (status < 400 || status >= 500) throw e;
      console.warn("[whatsapp-send] multipart recusado na criação da conversa:", String(e).slice(0, 300));
      await criarConversaSoTexto(supabase, ownerId, contatoNoCrm, inboxId, message);
      return {
        via: "conversation_new",
        midiaIgnorada: "O CRM recusou a imagem ao abrir a conversa; o texto foi enviado.",
      };
    }
  }

  await criarConversaSoTexto(supabase, ownerId, contatoNoCrm, inboxId, message);
  return { via: "conversation_new" };
}

/**
 * Id de uma conversa que o contato já tenha, ou `null`.
 *
 * **Endpoint não confirmado com o Wavy.** Se ele não existir, qualquer falha
 * devolve `null` e o envio segue criando a conversa como sempre fez — esta
 * checagem só pode EVITAR uma conversa duplicada, nunca impedir um envio.
 * Engolir o erro aqui é a decisão certa pela mesma razão: uma pessoa deixar de
 * receber porque uma consulta opcional falhou seria pior do que a duplicata que
 * ela previne.
 *
 * Prefere conversa aberta; cai para qualquer uma, inclusive resolvida.
 */
async function conversaExistente(
  supabase: any,
  ownerId: string,
  contactId: string,
): Promise<string | null> {
  try {
    const res = await crmFetch(supabase, ownerId, `/api/v1/contacts/${contactId}/conversations`);
    const linhas = unwrap(res);
    if (!Array.isArray(linhas) || linhas.length === 0) return null;
    const aberta = linhas.find((c: any) => c?.status !== "resolved");
    const escolhida = aberta ?? linhas[0];
    const id = escolhida?.id;
    return id ? String(id) : null;
  } catch (e) {
    console.warn("[whatsapp-send] não deu para checar conversa existente:", String(e).slice(0, 200));
    return null;
  }
}

async function criarConversaSoTexto(
  supabase: any,
  ownerId: string,
  contactId: string,
  inboxId: string,
  message: string,
): Promise<void> {
  await crmFetch(supabase, ownerId, "/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify({
      contact_id: contactId,
      inbox_id: inboxId,
      message: { content: message },
    }),
  });
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
  // `crm-conversations/handleSend` chama daqui com `contact_id: ""`: a tela
  // manda o id da conversa, não o do contato. Numa conversa ANTIGA esse id é
  // um UUID do CRM ("1edf217b-baf2-4288-a1b8-00c43bbb0ef1"), sem "@", então
  // os dois degraus acima não pegam e os dois abaixo procuram por um contato
  // vazio.
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
