// "A clínica já falou nesta conversa?" e "esta mensagem fui eu?"
//
// ── As duas perguntas são a mesma, vistas de dois lados ─────────────────
//
// A clínica quis que a Luna atendesse só quem "não tem histórico de conversa
// ainda". A leitura literal disso — nenhuma mensagem da clínica nesta conversa —
// está errada por um motivo já medido nesta base e escrito em
// `conversa-nova.ts`: a resposta da própria IA é gravada com `from_me = true`.
// Na segunda mensagem da pessoa o critério inverte, e a IA abandona a conversa
// depois de uma frase.
//
// E não é só o registro. A Evolution DEVOLVE pelo webhook tudo que o número
// manda, inclusive o que a IA acabou de mandar: 830 mensagens `fromMe` chegaram
// por esse caminho até 27/09. Essa devolução, sem tratamento, caía em "mensagem
// da própria clínica" — o motivo que `atender` transforma em "humano assumiu a
// conversa". A IA respondia uma vez e se calava para sempre, e a tela mostrava
// uma recepcionista que nunca existiu tendo assumido a conversa.
//
// Então "histórico" aqui quer dizer sempre a MESMA coisa: alguém da clínica que
// não sou eu falou nesta conversa. É o que estas duas funções respondem.

/** Espaços colapsados e sem maiúsculas. Local de propósito: o normalizador de
 *  `resposta-do-paciente.ts` também tira acento, porque lá se procura palavra
 *  ("sim", "não"); aqui se compara uma frase inteira com ela mesma, e tirar
 *  acento faria "voce" casar com "você" sem necessidade nenhuma. */
function normalizado(texto: string | null): string {
  return String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Esta mensagem é uma que eu mandei, voltando?
 *
 * Pura: é isto que o teste exerce. Compara o TEXTO porque é o que se tem dos
 * dois lados — o que saiu está gravado em `ai_agent_messages`, e o que volta
 * pelo webhook é o mesmo texto. O id da Evolution não serve: quando a resposta
 * sai, o registro do que foi enviado já está gravado sem ele.
 *
 * Comparação normalizada (espaços colapsados, sem maiúsculas) porque o WhatsApp
 * devolve o texto como o recebeu e uma diferença de um espaço faria a IA achar
 * que uma pessoa assumiu a conversa.
 */
export interface MensagemQueEuMandei {
  /** O id que o WhatsApp deu. Nulo para o que foi enviado antes de a coluna
   *  existir, ou quando a Evolution não devolveu id. */
  waMessageId: string | null;
  texto: string;
}

export function ehEcoDaPropriaIa(
  texto: string | null,
  enviados: MensagemQueEuMandei[],
  messageId?: string | null,
): boolean {
  // ── Primeiro o id: é prova, não indício ────────────────────────────────
  //
  // A Evolution devolve o id no instante do envio, e a IA o guarda. Se a
  // mensagem que voltou tem um id que eu mandei, fui eu — ponto final, sem
  // depender de texto, de quem repetiu frase de quem, nem de a Evolution
  // continuar não devolvendo eco das mensagens da própria API.
  const id = String(messageId ?? "").trim();
  if (id && enviados.some((e) => e.waMessageId === id)) return true;

  // ── Depois o texto, como rede ──────────────────────────────────────────
  //
  // Vale para o que a IA mandou antes de a coluna do id existir, e para o dia
  // em que a Evolution devolver um envio sem id. Erra se a recepção repetir
  // exatamente uma frase da IA nos últimos dez minutos — e esse erro é o lado
  // seguro: a IA continua achando que a conversa é dela, em vez de se calar
  // para sempre por causa de um id ausente.
  const alvo = normalizado(texto);
  // Mensagem sem texto (foto, áudio) nunca é eco: a IA manda texto. E sem isto
  // qualquer mensagem vazia casaria com um envio vazio.
  if (!alvo) return false;
  return enviados.some((e) => normalizado(e.texto) === alvo);
}

/**
 * O que a IA mandou nesta sessão há pouco.
 *
 * A janela existe para a comparação não ficar mais frouxa com o tempo: uma
 * recepcionista que repete hoje uma frase que a IA mandou semana passada
 * continuaria marcando "humano assumiu", que é o comportamento certo. Dez
 * minutos cobrem com folga a volta do webhook, que é de segundos.
 */
export async function oQueEuMandei(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sessionId: string,
  agora: Date,
  janelaMinutos = 10,
): Promise<MensagemQueEuMandei[]> {
  const desde = new Date(agora.getTime() - janelaMinutos * 60_000).toISOString();
  const { data, error } = await supabase
    .from("ai_agent_messages")
    .select("content, wa_message_id")
    .eq("session_id", sessionId)
    .eq("direction", "saida")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(50);

  // Erro de leitura devolve lista vazia, e lista vazia significa "não reconheço
  // esta mensagem como minha". O pior caso é marcar "humano assumiu" numa
  // conversa que era da IA: ela se cala, uma pessoa atende, e ninguém recebe
  // duas respostas. O contrário — não reconhecer uma pessoa que assumiu —
  // deixaria a IA falando por cima dela.
  if (error) {
    console.warn("[historico-da-clinica] não deu para ler o que a IA mandou:", error.message);
    return [];
  }
  return (data ?? [])
    .map((m: { content?: string | null; wa_message_id?: string | null }) => ({
      waMessageId: m.wa_message_id ?? null,
      texto: String(m.content ?? ""),
    }))
    .filter((m: MensagemQueEuMandei) => m.texto.trim().length > 0 || m.waMessageId);
}

/**
 * Alguém da clínica já falou nesta conversa?
 *
 * Só o espelho responde isto, e ele não distingue quem escreveu: a resposta da
 * IA entra igual à da recepção. Quem resolve essa parte é o chamador, com o
 * `last_outbound_at` da sessão — se a IA já falou aqui, a conversa é dela e o
 * `from_me` que existe é o dela. Ver o uso em `atendimento.ts`.
 */
export async function aClinicaJaFalou(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("wa_messages")
    .select("crm_message_id")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    .eq("from_me", true)
    .limit(1);

  // Falha fechada: erro de leitura conta como "já falou", e isso CALA a IA.
  // Um banco instável não pode virar a IA entrando no meio de um atendimento
  // que já estava acontecendo.
  if (error) {
    console.warn(`[historico-da-clinica] não deu para ler ${conversationId}:`, error.message);
    return true;
  }
  return (data ?? []).length > 0;
}
