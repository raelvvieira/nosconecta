// "Esta pessoa chegou agora?" — a pergunta que decide se a IA pode atender.
//
// ── O que se quer dizer com "nova" ──────────────────────────────────────
//
// O caso é o contato que veio do anúncio: escreveu pela primeira vez, ninguém
// da clínica conhece, e responder rápido é o que evita perdê-lo. O oposto é o
// lead de três meses atrás, que já trocou mensagem com a recepção e tem
// combinado que a IA não sabe — esse não é contato novo, é lead esquecido, e
// quem fala com ele é gente.
//
// ── A definição que NÃO funciona ────────────────────────────────────────
//
// A tentação é "nunca houve mensagem da clínica nesta conversa". Soa mais
// rigoroso e está errada por dois motivos, os dois medidos nesta base:
//
//   A resposta da própria IA é gravada com `from_me = true`. Na segunda
//   mensagem do lead o critério inverte, e o agente abandonaria a conversa
//   depois de uma frase — o pior comportamento possível, porque é pior que
//   nunca ter respondido.
//
//   Das 63 conversas não-paciente nascidas nos últimos 7 dias, só 7 não têm
//   nenhuma mensagem da clínica. O agente ficaria indistinguível de um agente
//   quebrado.
//
// Fica a idade da conversa: estável do começo ao fim, uma consulta indexada, e
// honesta sobre o que afirma — "chegou há pouco", não "ninguém falou com ela".

/**
 * A conversa nasceu dentro da janela?
 *
 * Pura: é isto que o teste exerce. `primeiraEm` nulo quer dizer que não há
 * mensagem nenhuma registrada — conversa que está nascendo agora, e a resposta
 * é sim.
 */
export function ehConversaNova(
  primeiraEm: string | null,
  agora: Date,
  janelaEmDias: number,
): boolean {
  if (!primeiraEm) return true;

  const nascimento = new Date(primeiraEm);
  // Data ilegível não pode virar "nova" por acidente: seria o agente entrando
  // numa conversa antiga por causa de um campo corrompido.
  if (Number.isNaN(nascimento.getTime())) return false;

  const dias = (agora.getTime() - nascimento.getTime()) / 86_400_000;

  // Data no futuro (relógio torto na origem) conta como nova: a conversa
  // certamente não é velha.
  if (dias < 0) return true;

  return dias < janelaEmDias;
}

/**
 * Quando a PESSOA falou pela primeira vez — não a conversa.
 *
 * A diferença importa. Pela Evolution o id da conversa é o número, mas há
 * 1.090 conversas herdadas do CRM com ids próprios: quem escreveu em 2024 pelo
 * CRM e voltou agora abre uma conversa "nascida hoje", e o agente trataria um
 * lead antigo como contato novo.
 *
 * A view `wa_conversas_por_pessoa` já resolve essa união pela coluna `pessoa`
 * — é a mesma ponte que a thread do chat usa para achar as conversas irmãs de
 * um número. Uma consulta a mais, irrisória ao lado de uma chamada de modelo.
 */
export async function primeiraMensagemDaPessoa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  conversationId: string,
): Promise<string | null> {
  const { data: minha } = await supabase
    .from("wa_conversas_por_pessoa")
    .select("pessoa")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    .maybeSingle();

  const pessoa = String(minha?.pessoa ?? "");

  // Sem `pessoa` não dá para unir: cai na conversa sozinha, que é o pior caso
  // e ainda assim é melhor que desistir da checagem.
  let ids = [conversationId];
  if (pessoa) {
    const { data: irmas } = await supabase
      .from("wa_conversas_por_pessoa")
      .select("crm_conversation_id")
      .eq("owner_id", ownerId)
      .eq("pessoa", pessoa)
      .limit(20);
    const achadas = (irmas ?? [])
      .map((c: { crm_conversation_id?: string | null }) => String(c.crm_conversation_id ?? ""))
      .filter(Boolean);
    if (achadas.length) ids = achadas;
  }

  const { data, error } = await supabase
    .from("wa_messages")
    .select("sent_at")
    .eq("owner_id", ownerId)
    .in("crm_conversation_id", ids)
    .order("sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Erro de leitura NÃO pode virar "não tem mensagem" — isso diria "conversa
  // nova" e soltaria o agente justamente quando o banco está instável. Uma
  // data antiga fecha a porta, que é o lado seguro de errar.
  if (error) {
    console.warn(`[conversa-nova] não deu para ler ${conversationId}:`, error.message);
    return new Date(0).toISOString();
  }

  return data?.sent_at ? String(data.sent_at) : null;
}
