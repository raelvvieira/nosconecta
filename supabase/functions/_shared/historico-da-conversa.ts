// As últimas mensagens de uma conversa, como o modelo as vê.
//
// ── Por que isto é um arquivo, e não duas cópias ───────────────────────
//
// Dois lugares precisam da mesma coisa: o agente, para responder, e as
// sugestões de fala do chat, para saber em que altura a conversa está. Duas
// implementações de "quais mensagens contam" divergem — uma passa a incluir
// nota interna, ou a ler mais mensagens, e aí o card sugere uma fala baseada
// num contexto diferente do que o agente enxerga na mesma conversa.
//
// ── A regra que não pode mudar ─────────────────────────────────────────
//
// **Nota interna fica de fora.** É conversa da equipe SOBRE o paciente, não
// COM ele: "essa aí só enrola", "cobrar antes de marcar". Passá-la ao modelo
// faria o que foi combinado nos bastidores sair na resposta, para a pessoa de
// quem se falava. É o pior vazamento possível neste sistema, e é uma linha de
// filtro.
//
// Mensagem sem texto também sai: foto sem legenda e áudio não dizem nada ao
// modelo, e ocupam vaga na janela.

/** Quantas mensagens o modelo vê. Vinte cobre a conversa recente sem encher o
 *  prompt de histórico que já não importa. */
export const JANELA_DE_CONTEXTO = 20;

export interface FalaDaConversa {
  deQuem: "clinica" | "paciente";
  texto: string;
}

/**
 * As últimas mensagens, da mais antiga para a mais nova.
 *
 * Lê o espelho, que é onde a mensagem acabou de ser gravada — inclusive a que
 * está sendo respondida agora.
 *
 * Erro NÃO levanta: devolve lista vazia com aviso no log. Quem chama decide o
 * que fazer sem histórico, e para o agente responder só à última mensagem é
 * pior que responder com contexto, mas muito melhor que não responder.
 */
export async function historicoDoEspelho(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  conversationId: string,
  janela: number = JANELA_DE_CONTEXTO,
): Promise<FalaDaConversa[]> {
  const { data, error } = await supabase
    .from("wa_messages")
    .select("body, from_me, is_private, sent_at")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    // As ÚLTIMAS, não as primeiras: quem pega o fim da conversa sabe do que se
    // fala agora. Vêm da mais nova para a mais velha e são reviradas abaixo.
    .order("sent_at", { ascending: false })
    .limit(janela);

  if (error) {
    console.warn("[historico] indisponível:", error.message);
    return [];
  }

  return [...(data ?? [])]
    .reverse()
    .filter(
      (m: { is_private?: boolean | null; body?: string | null }) =>
        !m.is_private && String(m.body ?? "").trim(),
    )
    .map((m: { from_me?: boolean | null; body?: string | null }) => ({
      deQuem: m.from_me ? ("clinica" as const) : ("paciente" as const),
      texto: String(m.body).trim(),
    }));
}
