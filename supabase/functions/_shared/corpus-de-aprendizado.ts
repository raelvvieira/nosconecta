// Quais conversas a IA lê para aprender o jeito da casa.
//
// ── Por que esta escolha existe ─────────────────────────────────────────
//
// O aprendizado lia o funil: conversa que virou card, card que entrou em etapa
// de vitória. Com o funil vazio isso nunca devolveu nada, e o manual ficou em
// branco desde o primeiro dia.
//
// A fonte passa a ser o espelho. Mas "todas as conversas" também não serve:
// das 1.090, a maioria é uma mensagem só — confirmação de consulta, lembrete
// que ninguém respondeu, disparo. Aprender com monólogo ensinaria a falar
// sozinho.
//
// ── A ordem, e o que cada critério compra ───────────────────────────────
//
// 1. **Virou paciente.** É o único desfecho que dá para comprovar sem o funil:
//    a pessoa daquela conversa tem ficha na clínica. São 32 conversas assim
//    com troca real — dez vezes o mínimo para confiar. Elas vêm primeiro
//    porque são as que comprovadamente terminaram bem.
//
// 2. **Profundidade da troca**, medida como `min(daClinica, doContato)`. É de
//    propósito o MENOR dos dois lados: vinte mensagens da clínica para uma do
//    contato é insistência, não conversa. O mínimo só sobe quando os dois
//    lados falaram, que é exatamente o que se quer aprender.
//
// 3. **Mais recente.** Desempate. Preço, procedimento e jeito de falar mudam;
//    entre duas conversas igualmente boas, a de agora ensina melhor.

export interface ConversaDoCorpus {
  conversationId: string;
  contactName: string | null;
  /** A pessoa desta conversa tem ficha de paciente. */
  ehPaciente: boolean;
  /** Mensagens COM TEXTO de cada lado — anexo sem legenda não ensina nada. */
  daClinica: number;
  doContato: number;
  /** ISO. Usado só como desempate. */
  ultimaEm: string;
}

export interface ConversaEscolhida {
  conversationId: string;
  contactName: string | null;
  source: "paciente" | "conversa";
}

/**
 * Sem os dois lados não é diálogo.
 *
 * Uma conversa em que só a clínica falou é lembrete, confirmação ou disparo.
 * Ela pode até conter uma frase boa, mas não mostra o que o paciente respondeu
 * nem o que veio depois — e é esse encadeamento que o manual precisa.
 */
export const MINIMO_DE_CADA_LADO = 1;

/**
 * Ordena e corta. Pura: é aqui que a decisão mora, e é isto que o teste exerce.
 *
 * `jaConhecidas` são as conversas que já viraram fonte em rodadas anteriores —
 * o índice único de `ai_playbook_sources` recusaria a gravação, mas reapresentar
 * a mesma conversa todo dia também gastaria a vaga de uma que ainda não foi
 * lida.
 */
export function escolherConversas(
  todas: ConversaDoCorpus[],
  jaConhecidas: Set<string>,
  max: number,
): ConversaEscolhida[] {
  if (max <= 0) return [];

  const candidatas = todas.filter(
    (c) =>
      c.conversationId &&
      !jaConhecidas.has(c.conversationId) &&
      c.daClinica >= MINIMO_DE_CADA_LADO &&
      c.doContato >= MINIMO_DE_CADA_LADO,
  );

  candidatas.sort((a, b) => {
    if (a.ehPaciente !== b.ehPaciente) return a.ehPaciente ? -1 : 1;

    const trocaA = Math.min(a.daClinica, a.doContato);
    const trocaB = Math.min(b.daClinica, b.doContato);
    if (trocaA !== trocaB) return trocaB - trocaA;

    // Data como texto: ISO 8601 ordena igual como string e como data, e assim
    // uma data inválida não vira NaN no meio da comparação.
    return String(b.ultimaEm ?? "").localeCompare(String(a.ultimaEm ?? ""));
  });

  return candidatas.slice(0, max).map((c) => ({
    conversationId: c.conversationId,
    contactName: c.contactName,
    source: c.ehPaciente ? "paciente" : "conversa",
  }));
}

/**
 * Conta as mensagens por conversa a partir das linhas cruas do espelho.
 *
 * Mora aqui junto do resto porque a regra do que CONTA é a mesma do que vai
 * virar transcrição depois: mensagem sem texto não entra. Se as duas
 * divergissem, uma conversa poderia ser escolhida por dez mensagens e chegar
 * ao modelo com duas.
 */
export function contarPorConversa(
  linhas: {
    crm_conversation_id?: string | null;
    from_me?: boolean | null;
    body?: string | null;
    is_private?: boolean | null;
  }[],
): Map<string, { daClinica: number; doContato: number }> {
  const contas = new Map<string, { daClinica: number; doContato: number }>();
  for (const l of linhas) {
    const id = String(l?.crm_conversation_id ?? "");
    if (!id) continue;
    // Nota interna é conversa da equipe SOBRE o paciente, não COM ele. A
    // transcrição já a descarta; contá-la aqui faria uma conversa entrar no
    // corpus por dez mensagens e chegar ao modelo com duas.
    if (l?.is_private) continue;
    if (!String(l?.body ?? "").trim()) continue;

    const atual = contas.get(id) ?? { daClinica: 0, doContato: 0 };
    if (l.from_me) atual.daClinica++;
    else atual.doContato++;
    contas.set(id, atual);
  }
  return contas;
}
