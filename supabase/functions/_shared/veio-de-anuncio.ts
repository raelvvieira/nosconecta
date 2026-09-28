// A pessoa chegou por um anúncio? E por qual?
//
// ── O sinal é exato, não é palpite ──────────────────────────────────────
//
// Quando alguém clica em "Enviar mensagem" num anúncio do Instagram ou do
// Facebook, o WhatsApp anexa `contextInfo.externalAdReply` à PRIMEIRA mensagem
// dela. Dentro vem `ctwaClid` (o identificador do clique, o "Click To WhatsApp
// Click ID"), o id do anúncio, a rede de origem, e — o que mais vale aqui — o
// TEXTO do anúncio e a saudação que já foi mostrada na tela.
//
// Medido em 27/09: 27 conversas com esse marcador, todas entre 19 e 27/09, e
// todas em mensagem do contato (nunca da clínica, o que faz sentido: o marcador
// é do clique da pessoa).
//
// ── Por que isso muda o atendimento, e não só o filtro ──────────────────
//
// O manual da Luna manda perguntar "você viu o anúncio de qual procedimento?"
// quando a pessoa diz "vi o anúncio". Com o texto do anúncio em mãos ela não
// precisa perguntar: já sabe que a promessa foi "Combo de Limpeza e Clareamento
// com condições especiais". Uma pergunta a menos é uma conversa mais curta, e
// perguntar algo que a própria clínica acabou de dizer é o tipo de detalhe que
// denuncia automação.
//
// ── Por que a miniatura é descartada ────────────────────────────────────
//
// `externalAdReply` carrega a imagem do anúncio como um objeto de mais de mil
// bytes numerados. Ela não serve para nada aqui e estourou uma leitura de
// depuração; por isso este módulo copia campo por campo, em vez de guardar o
// objeto inteiro.

export interface Anuncio {
  /** O identificador do clique. É ele que prova que veio de anúncio. */
  clickId: string;
  /** O id do anúncio na Meta, para cruzar com o gerenciador. */
  anuncioId: string | null;
  /** "instagram", "facebook"… */
  rede: string | null;
  /** O texto que o anúncio mostrava. */
  copy: string | null;
  /** O título do botão ("Fale Comigo"). */
  titulo: string | null;
  /** A mensagem que o WhatsApp já mostrou pronta para a pessoa enviar. */
  saudacao: string | null;
  /** O link do post. */
  url: string | null;
}

function texto(valor: unknown): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t ? t : null;
}

/**
 * Lê o anúncio de um evento da Evolution. `null` quando não veio de anúncio.
 *
 * Procura em dois caminhos porque a Evolution muda o formato conforme o tipo da
 * mensagem: texto simples traz `contextInfo` na raiz, e mensagem com citação ou
 * mídia o traz dentro de `message.<tipo>.contextInfo`. Procurar num só deixaria
 * metade dos anúncios de fora — e "de fora" aqui significa a IA não responder
 * justamente quem clicou.
 */
export function anuncioDoEvento(payload: unknown): Anuncio | null {
  const p = (payload ?? {}) as Record<string, any>;
  const mensagem = (p.message ?? {}) as Record<string, any>;

  const candidatos = [
    p.contextInfo,
    ...Object.values(mensagem).map((v) => (v as Record<string, any> | null)?.contextInfo),
  ];

  for (const ctx of candidatos) {
    const ad = (ctx as Record<string, any> | null)?.externalAdReply;
    if (!ad) continue;
    const clickId = texto(ad.ctwaClid);
    // Sem `ctwaClid` não há prova de clique: pode ser uma resposta a mensagem
    // que por acaso carregava contexto. Falha fechada — melhor não tratar como
    // anúncio do que tratar quem não é.
    if (!clickId) continue;
    return {
      clickId,
      anuncioId: texto(ad.sourceId),
      rede: texto(ad.sourceApp),
      copy: texto(ad.body),
      titulo: texto(ad.title),
      saudacao: texto(ad.greetingMessageBody),
      url: texto(ad.sourceUrl),
    };
  }
  return null;
}

/**
 * Lê o anúncio que ficou GUARDADO na sessão.
 *
 * `null` na coluna quer dizer "ainda não procurei"; um objeto vazio quer dizer
 * "procurei no espelho e esta conversa não veio de anúncio". A diferença existe
 * para a busca no espelho rodar UMA vez por conversa em vez de a cada mensagem
 * — e o vazio é o que registra que ela já rodou.
 */
export function anuncioGuardado(valor: unknown): Anuncio | null {
  const a = (valor ?? null) as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return null;
  return typeof a.clickId === "string" && a.clickId.trim() ? (a as unknown as Anuncio) : null;
}

/** Já se procurou o anúncio desta conversa no espelho? */
export function jaProcurouAnuncio(valor: unknown): boolean {
  return valor !== null && valor !== undefined;
}

/**
 * O que a instrução do agente diz sobre o anúncio.
 *
 * Vazio quando não veio de anúncio: uma seção dizendo "esta pessoa não veio de
 * anúncio" não ajuda em nada e só gasta instrução.
 */
export function secaoDoAnuncio(a: Anuncio | null | undefined): string {
  if (!a) return "";
  const linhas = [
    "## De onde esta pessoa veio",
    `Ela clicou num anúncio${a.rede ? ` no ${a.rede}` : ""} e caiu direto nesta conversa.`,
  ];
  if (a.copy) {
    linhas.push("", "O anúncio dizia isto:", ...a.copy.split("\n").map((l) => `> ${l}`));
  }
  if (a.saudacao) {
    linhas.push(
      "",
      "E o WhatsApp já mostrou esta mensagem pronta para ela enviar:",
      `> ${a.saudacao}`,
    );
  }
  linhas.push(
    "",
    "Então você JÁ SABE o que trouxe ela aqui. Não pergunte qual anúncio ela viu",
    "nem qual procedimento ela quer, se o anúncio já diz. Comece de onde o",
    "anúncio parou, e não prometa nada além do que ele prometeu.",
  );
  return linhas.join("\n");
}
