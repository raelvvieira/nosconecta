// Traduz um evento da Evolution API para as linhas do espelho.
//
// ── Por que um tradutor, e não "gravar o que vier" ──────────────────────
//
// A Evolution fala uma língua completamente diferente do CRM. Onde o Chatwoot
// mandava `contact.phone_number` e `message_type: 0|1`, ela manda
// `key.remoteJid` e `key.fromMe`. E o texto da mensagem não tem um lugar fixo:
// mora em `conversation`, ou em `extendedTextMessage.text`, ou na legenda de
// uma imagem, dependendo do tipo.
//
// Errar aqui não levanta exceção — produz mensagem em branco, do lado errado
// da conversa, ou com a data de hoje. Por isso o tradutor mora fora da
// função, num módulo sem import nenhum, onde dá para exercitar cada formato
// de verdade.
//
// ── A chave de tudo é o `remoteJid` ─────────────────────────────────────
//
// "5548984195309@s.whatsapp.net" é a identidade da conversa no WhatsApp — o
// número. É ele que faz a conversa nova colar no histórico que veio do Wavy,
// porque do outro lado o espelho já guarda o telefone normalizado.

/** Número em E.164 sem "+", ou `null` quando é grupo ou coisa que não é número. */
export function telefoneDoJid(jid: unknown): string | null {
  const texto = String(jid ?? "");
  if (!texto || texto.includes("@g.us")) return null; // grupo não tem número
  const antes = texto.split("@")[0].split(":")[0]; // ":" aparece em jid de aparelho
  const digitos = antes.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;
  return digitos;
}

/** Grupo do WhatsApp — identidade é o id do grupo, não um telefone. */
export function ehGrupo(jid: unknown): boolean {
  return String(jid ?? "").includes("@g.us");
}

/**
 * O texto da mensagem, de onde quer que ele esteja.
 *
 * O WhatsApp não tem um campo de texto: tem um campo por TIPO de mensagem, e
 * o texto mora dentro do que veio. Uma foto com legenda guarda o texto em
 * `imageMessage.caption`; uma resposta, em `extendedTextMessage.text`.
 *
 * Devolve `null` quando a mensagem não tem texto nenhum — uma foto sem
 * legenda, um áudio. Quem chama decide o que mostrar no lugar.
 */
export function textoDaMensagem(message: any): string | null {
  if (!message || typeof message !== "object") return null;
  const candidatos = [
    message.conversation,
    message.extendedTextMessage?.text,
    message.imageMessage?.caption,
    message.videoMessage?.caption,
    message.documentMessage?.caption,
    message.documentWithCaptionMessage?.message?.documentMessage?.caption,
    message.buttonsResponseMessage?.selectedDisplayText,
    message.listResponseMessage?.title,
    message.templateButtonReplyMessage?.selectedDisplayText,
    message.ephemeralMessage?.message?.conversation,
    message.ephemeralMessage?.message?.extendedTextMessage?.text,
    message.viewOnceMessage?.message?.imageMessage?.caption,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

export interface AnexoDaEvolution {
  tipo: "image" | "audio" | "video" | "file";
  /** O que a Evolution informou como endereço, quando informou. */
  url: string | null;
  mimetype: string | null;
  /** Nome original, quando é documento. */
  nome: string | null;
}

/**
 * O anexo da mensagem, quando há um.
 *
 * A Evolution guarda a mídia dela mesma e nem sempre manda a URL no evento —
 * às vezes é preciso pedir depois. Por isso `url` pode vir nula e ainda assim
 * o anexo ser real: o tipo já é o bastante para a prévia da conversa dizer
 * "📷 Foto" em vez de deixar a linha vazia.
 */
export function anexoDaMensagem(message: any): AnexoDaEvolution | null {
  if (!message || typeof message !== "object") return null;
  const m =
    message.ephemeralMessage?.message ?? message.viewOnceMessage?.message ?? message;

  const mapa: Array<[string, AnexoDaEvolution["tipo"]]> = [
    ["imageMessage", "image"],
    ["audioMessage", "audio"],
    ["videoMessage", "video"],
    ["documentMessage", "file"],
    ["stickerMessage", "image"],
  ];
  for (const [chave, tipo] of mapa) {
    const bruto = m[chave];
    if (!bruto) continue;
    return {
      tipo,
      url: bruto.url ?? null,
      mimetype: bruto.mimetype ?? null,
      nome: bruto.fileName ?? bruto.title ?? null,
    };
  }
  return null;
}

/**
 * `messageTimestamp` em segundos — ou em milissegundos, ou em texto.
 *
 * Mesmo cuidado do tradutor do CRM, pela mesma razão: uma data mal lida põe a
 * mensagem no topo da conversa como se tivesse acabado de chegar.
 */
export function dataDaMensagem(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined || bruto === "") return null;
  const n = typeof bruto === "string" ? Number(bruto.trim()) : Number(bruto);
  if (!n || !Number.isFinite(n)) return null;
  return new Date(n < 10_000_000_000 ? n * 1000 : n).toISOString();
}

export interface MensagemEspelhada {
  crmMessageId: string;
  crmConversationId: string;
  crmContactId: string;
  fromMe: boolean;
  body: string | null;
  sentAt: string | null;
  attachments: unknown[];
  phone: string | null;
  contactName: string | null;
  ehGrupo: boolean;
}

/**
 * Um evento `messages.upsert` virando a linha do espelho.
 *
 * Devolve `null` quando falta o que identifica a mensagem — sem id ou sem
 * conversa não há o que gravar, e inventar um id faria a mesma mensagem
 * entrar duas vezes no próximo reenvio da Evolution.
 *
 * `crmConversationId` e `crmContactId` são AMBOS o `remoteJid`. Não é
 * preguiça: no WhatsApp a conversa e o contato são a mesma coisa — o número.
 * Foi o Chatwoot que separou os dois, e o espelho carrega essa separação por
 * causa dele.
 */
export function mensagemDoEvento(data: any): MensagemEspelhada | null {
  const id = data?.key?.id;
  const jid = data?.key?.remoteJid;
  if (!id || !jid) return null;

  const anexo = anexoDaMensagem(data?.message);
  return {
    crmMessageId: String(id),
    crmConversationId: String(jid),
    crmContactId: String(jid),
    fromMe: data?.key?.fromMe === true,
    body: textoDaMensagem(data?.message),
    sentAt: dataDaMensagem(data?.messageTimestamp),
    attachments: anexo
      ? [{ id: String(id), tipo: anexo.tipo, url: anexo.url, thumbUrl: anexo.url, nome: anexo.nome }]
      : [],
    phone: telefoneDoJid(jid),
    // `pushName` é o nome que a pessoa pôs no próprio WhatsApp. Só vale para
    // mensagem RECEBIDA: no que a clínica manda, ele é o nome da clínica.
    contactName: data?.key?.fromMe === true ? null : (data?.pushName ?? null),
    ehGrupo: ehGrupo(jid),
  };
}
