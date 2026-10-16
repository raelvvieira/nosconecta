// Quando alguém da clínica lê a conversa pelo celular.
//
// ── O defeito que isto conserta ────────────────────────────────────────────
//
// A bolinha de não lidas é local: "mensagem que chegou depois da última vez que
// alguém abriu esta conversa AQUI". Ela não sabe nada do aparelho. Quem lê no
// WhatsApp do celular continua vendo a bolinha acesa no sistema, e quem lê no
// sistema continua vendo a bolinha acesa no celular.
//
// Em 16/10/2026 eram 211 conversas com bolinha e 1.452 mensagens marcadas como
// não lidas — boa parte delas já lida no aparelho.
//
// ── O sinal, e por que ele é mais escorregadio do que parece ───────────────
//
// O WhatsApp não manda "fulano leu a conversa". O que a Evolution repassa é o
// ESTADO do chat depois da leitura, num evento de atualização de conversa, com
// um contador de não lidas. Zerou, foi lido no aparelho.
//
// Escorregadio por três motivos, todos tratados aqui:
//
//   **O formato varia.** `data` vem ora objeto, ora lista; o identificador ora
//   é `remoteJid`, ora `id`; o contador ora é `unreadCount`, ora `unread_count`.
//   Qual chega depende da versão da Evolution e do tipo de evento.
//
//   **Contador ausente não é zero.** Um evento de atualização que só mudou o
//   nome do contato não diz nada sobre leitura. Tratar a ausência como zero
//   apagaria a bolinha de quem ninguém leu — o erro mais caro possível aqui,
//   porque some com a mensagem de um paciente esperando.
//
//   **O contador também aparece na sincronização inicial**, com o valor que o
//   aparelho tinha. Aí ele é informação legítima do mesmo jeito: se o celular
//   diz que não há nada por ler, não há.
//
// Puro de propósito: é a parte com regra, e regra sem teste é chute.

/** O que um evento de conversa diz sobre leitura. */
export interface LeituraDoEvento {
  /** O id da conversa, como o espelho a guarda (`5548...@s.whatsapp.net`). */
  conversationId: string;
  /** Quantas o aparelho diz que faltam ler. */
  naoLidas: number;
}

/** Os eventos da Evolution que carregam estado de conversa. Fora desta lista,
 *  nada aqui é chamado — ver `wa-webhook`. */
export const EVENTOS_DE_CONVERSA = ["chats.update", "chats.upsert", "chats.set"] as const;

/**
 * O que este evento diz sobre a leitura — ou nada.
 *
 * Devolve uma linha por conversa que trouxe contador. Lista vazia é a resposta
 * mais comum e significa "este evento não fala de leitura", nunca "está tudo
 * lido".
 */
export function leiturasDoEvento(evento: unknown): LeituraDoEvento[] {
  const corpo = (evento ?? {}) as Record<string, unknown>;
  const itens = Array.isArray(corpo.data)
    ? corpo.data
    : corpo.data
      ? [corpo.data]
      : Array.isArray(evento)
        ? (evento as unknown[])
        : [corpo];

  const saida: LeituraDoEvento[] = [];
  for (const item of itens) {
    const linha = (item ?? {}) as Record<string, unknown>;
    const id = primeiroTexto(linha.remoteJid, linha.id, linha.jid, linha.chatId);
    if (!id) continue;

    const contador = primeiroNumero(linha.unreadCount, linha.unread_count, linha.unread);
    // Ausente é ausente. Ver o cabeçalho: tratar como zero apagaria a bolinha
    // de uma conversa que ninguém leu.
    if (contador === null) continue;
    // Negativo não existe, e prender em zero diria "está tudo lido" — a
    // afirmação mais cara que este arquivo pode fazer por engano. Número que
    // não faz sentido não vira decisão.
    if (contador < 0) continue;

    saida.push({ conversationId: id, naoLidas: contador });
  }
  return saida;
}

/**
 * Esta leitura zera a conversa?
 *
 * Separada de `leiturasDoEvento` porque é a decisão, e decisão merece nome. E
 * porque um contador MAIOR que zero também é informação — só não é esta.
 */
export function foiLidaNoCelular(l: LeituraDoEvento): boolean {
  return l.naoLidas === 0;
}

/**
 * Esta conversa pode ser casada com o WhatsApp pelo id?
 *
 * Só as da conexão própria: o id delas É o identificador do WhatsApp. As 1.051
 * herdadas do CRM têm id próprio, que não existe no aparelho — usar o evento
 * para mexer nelas seria casar por coincidência.
 *
 * Grupo também sai: a clínica tem 12, todos internos, e nenhum deles aparece na
 * caixa de entrada.
 */
export function ehConversaDoAparelho(conversationId: string): boolean {
  const id = String(conversationId ?? "").trim();
  return id.endsWith("@s.whatsapp.net");
}

function primeiroTexto(...valores: unknown[]): string | null {
  for (const v of valores) {
    const t = String(v ?? "").trim();
    if (t) return t;
  }
  return null;
}

function primeiroNumero(...valores: unknown[]): number | null {
  for (const v of valores) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    // A Evolution manda número como texto em parte dos eventos. `"0"` é zero;
    // `""` e `"abc"` não são número nenhum e não podem virar zero.
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}
